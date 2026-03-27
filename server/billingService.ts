/**
 * Zootopia Club Backend Billing Service
 * (c) 2026 Zootopia Club
 *
 * Copyright (c) Elmahdy Abdallah Youssef. All rights reserved.
 * Developed by Elmahdy Abdallah Youssef, Software Developer.
 * Class of 2022, Faculty of Science, Cairo University, Zoology Department.
 */

import { PaymentService } from '../src/services/billing/paymentService';
import { PaymentProviderRegistry } from '../src/services/billing/paymentProviderAbstraction';
import { 
  CheckoutSessionRequest, 
  DonationRequest, 
  PaymentSessionResponse, 
  PaymentStatus 
} from '../src/types/billing';
import { logDiagnostic, normalizeError, createTraceId } from './diagnostics';
import crypto from 'crypto';
import { CommunicationService } from './communicationService';

export class BillingService {
  constructor(private db: any, private communicationService?: CommunicationService) {}

  setCommunicationService(communicationService: CommunicationService) {
    this.communicationService = communicationService;
  }

  private normalizePaymentStatus(status: string | undefined): PaymentStatus['status'] {
    const normalized = String(status || '').trim().toLowerCase();
    if (normalized === 'success' || normalized === 'paid') return 'success';
    if (normalized === 'failed') return 'failed';
    if (normalized === 'cancelled' || normalized === 'canceled') return 'cancelled';
    return 'pending';
  }

  private mapStoredTransactionStatus(status: string | undefined): PaymentStatus['status'] {
    const normalized = String(status || '').trim().toLowerCase();
    if (normalized === 'paid') return 'success';
    if (normalized === 'failed') return 'failed';
    if (normalized === 'cancelled' || normalized === 'canceled') return 'cancelled';
    return 'pending';
  }

  private isFinalizedTransactionStatus(status: string | undefined): boolean {
    const normalized = String(status || '').trim().toLowerCase();
    return normalized === 'paid' || normalized === 'refunded';
  }

  private buildWebhookEventId(providerId: string, status: PaymentStatus, payload: any): string {
    const raw = JSON.stringify({
      provider: providerId,
      sessionId: status.sessionId || null,
      transactionId: status.transactionId || null,
      status: this.normalizePaymentStatus(status.status),
      amount: status.amount ?? null,
      currency: status.currency ?? null,
      providerEventId: payload?.obj?.id || payload?.id || payload?.fawryRefNumber || null,
      providerCreatedAt: payload?.obj?.created_at || payload?.created_at || null,
      signature: payload?.hmac || payload?.messageSignature || null,
    });

    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  async resolveTransactionSessionId(reference: string | undefined | null): Promise<string | null> {
    const normalizedReference = String(reference || '').trim();
    if (!normalizedReference) {
      return null;
    }

    const directDoc = await this.db.collection('transactions').doc(normalizedReference).get();
    if (directDoc.exists) {
      return directDoc.id;
    }

    const bySessionId = await this.db.collection('transactions')
      .where('id', '==', normalizedReference)
      .limit(1)
      .get();

    if (!bySessionId.empty) {
      return bySessionId.docs[0].id;
    }

    const byProviderTransaction = await this.db.collection('transactions')
      .where('providerTransactionId', '==', normalizedReference)
      .limit(1)
      .get();

    if (!byProviderTransaction.empty) {
      return byProviderTransaction.docs[0].id;
    }

    const numericReference = Number(normalizedReference);
    if (Number.isFinite(numericReference) && numericReference > 0) {
      const byProviderOrderId = await this.db.collection('transactions')
        .where('providerMetadata.orderId', '==', numericReference)
        .limit(1)
        .get();

      if (!byProviderOrderId.empty) {
        return byProviderOrderId.docs[0].id;
      }
    }

    return null;
  }

  private async resolveTransactionByStatus(status: PaymentStatus): Promise<string | null> {
    let sessionId = status.sessionId || null;
    if (sessionId) return sessionId;

    if (!status.transactionId) {
      return null;
    }

    const bySessionId = await this.db.collection('transactions')
      .where('id', '==', status.transactionId)
      .limit(1)
      .get();

    if (!bySessionId.empty) {
      return bySessionId.docs[0].id;
    }

    const byProviderTransaction = await this.db.collection('transactions')
      .where('providerTransactionId', '==', status.transactionId)
      .limit(1)
      .get();

    if (!byProviderTransaction.empty) {
      return byProviderTransaction.docs[0].id;
    }

    return null;
  }

  private normalizeDonationAmount(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error('Invalid donation request: amount must be a positive number');
    }

    const amountCents = Math.round(parsed * 100);
    if (amountCents <= 0) {
      throw new Error('Invalid donation request: amount must be a positive number');
    }

    const normalizedAmount = amountCents / 100;
    if (Math.abs(parsed - normalizedAmount) > 0.000001) {
      throw new Error('Invalid donation request: amount must use at most 2 decimal places');
    }

    return normalizedAmount;
  }

  private validateSubscriptionRequest(request: CheckoutSessionRequest) {
    if (!request?.userId?.trim()) throw new Error('Invalid subscription request: userId is required');
    if (!request?.userEmail?.trim()) throw new Error('Invalid subscription request: userEmail is required');
    if (!request?.planId?.trim()) throw new Error('Invalid subscription request: planId is required');
    if (!request?.successUrl?.trim()) throw new Error('Invalid subscription request: successUrl is required');
    if (!request?.cancelUrl?.trim()) throw new Error('Invalid subscription request: cancelUrl is required');
  }

  private validateDonationRequest(request: DonationRequest) {
    this.normalizeDonationAmount(request?.amount);
    const currency = String(request?.currency || '').trim().toUpperCase();
    if (currency !== 'EGP') {
      throw new Error('Invalid donation request: Paymob donations must use EGP');
    }
    if (!request?.successUrl?.trim()) throw new Error('Invalid donation request: successUrl is required');
    if (!request?.cancelUrl?.trim()) throw new Error('Invalid donation request: cancelUrl is required');
  }

  private async notifyPaymentStateChange(params: {
    traceId: string;
    sessionId: string;
    transaction: any;
    nextState: 'success' | 'failed' | 'pending' | 'cancelled';
    amount?: number;
    currency?: string;
  }) {
    const { traceId, sessionId, transaction, nextState } = params;

    if (!this.communicationService) {
      return;
    }

    const userId = String(transaction?.userId || '').trim();
    const userEmail = String(transaction?.userEmail || '').trim();
    const isDonation = transaction?.type === 'donation';
    const lastNotifiedState = String(transaction?.lastNotifiedPaymentState || '').trim().toLowerCase();
    if ((!userId && !userEmail) || lastNotifiedState === nextState) {
      return;
    }

    const displayAmount = params.amount ?? transaction?.amount;
    const displayCurrency = params.currency || transaction?.currency || '';

    const title =
      isDonation
        ? (nextState === 'success'
            ? 'Donation confirmed'
            : nextState === 'pending'
              ? 'Donation pending'
              : nextState === 'cancelled'
                ? 'Donation cancelled'
                : 'Donation not completed')
        : nextState === 'success'
          ? 'Payment confirmed'
          : nextState === 'pending'
            ? 'Payment pending'
            : nextState === 'cancelled'
              ? 'Payment cancelled'
              : 'Payment not completed';

    const message =
      isDonation
        ? (nextState === 'success'
            ? `Thank you. Your donation${displayAmount ? ` of ${displayAmount} ${displayCurrency}` : ''} has been confirmed.`
            : nextState === 'pending'
              ? 'Your donation is still processing. Please check again shortly.'
              : nextState === 'cancelled'
                ? 'Your donation was cancelled. No charge was applied.'
                : 'Your donation was not completed. No charge was applied.')
        : nextState === 'success'
          ? (transaction?.type === 'subscription'
              ? `Your ${transaction?.planId || 'subscription'} plan is now active.`
              : transaction?.type === 'tool_unlock'
                ? `Access granted to ${transaction?.toolId || 'the selected tool'}.`
                : transaction?.type === 'model_unlock'
                  ? `Access granted to ${transaction?.modelId || 'the selected model'}.`
                  : `Your payment${displayAmount ? ` of ${displayAmount} ${displayCurrency}` : ''} is confirmed.`)
          : nextState === 'pending'
            ? 'Your payment is processing. Please check again shortly.'
            : nextState === 'cancelled'
              ? 'Your payment was cancelled. No changes were applied.'
              : 'Your payment was not completed. No access was granted.';

    try {
      if (userId) {
        await this.communicationService.dispatchInternalMessage({
          userId,
          type: nextState === 'success' ? 'notification' : 'toast',
          purpose: isDonation ? 'billing-donation-state' : 'billing-payment-state',
          title,
          message,
          notes: `trace:${traceId};session:${sessionId};state:${nextState}`,
        });
      }

      if (userEmail && (nextState === 'success' || nextState === 'failed' || nextState === 'cancelled')) {
        await this.communicationService.dispatchEmailFromTemplate({
          recipientEmails: [userEmail],
          templateType: isDonation ? `billing_donation_${nextState}` : `billing_payment_${nextState}`,
          dynamicData: {
            title,
            message,
            sessionId,
            paymentType: transaction?.type || 'payment',
            planId: transaction?.planId || '',
            toolId: transaction?.toolId || '',
            modelId: transaction?.modelId || '',
            amount: displayAmount ?? '',
            currency: displayCurrency || '',
          },
          fallbackSubject: `Zootopia Club - ${title}`,
          fallbackHtml: `<p>${message}</p><p style="font-size:12px;color:#64748b;">Reference: ${sessionId}</p>`,
          purpose: isDonation ? 'billing-donation-state' : 'billing-payment-state',
          notes: `trace:${traceId};state:${nextState}`,
        });
      }

      await this.db.collection('transactions').doc(sessionId).set({
        lastNotifiedPaymentState: nextState,
        lastPaymentNotificationAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      logDiagnostic('info', 'billing.payment_notification_sent', {
        traceId,
        area: 'billing',
        stage: 'notifyPaymentStateChange',
        userId,
        status: nextState,
        details: { sessionId, type: transaction?.type || null },
      });
    } catch (notificationError) {
      logDiagnostic('warn', 'billing.payment_notification_failed', {
        traceId,
        area: 'billing',
        stage: 'notifyPaymentStateChange',
        userId,
        status: nextState,
        details: { sessionId, ...normalizeError(notificationError) },
      });
    }
  }

  private async notifyRefundStateChange(params: {
    traceId: string;
    sessionId: string;
    refundId: string;
    transaction: any;
    nextState: 'refund_processing' | 'refunded' | 'refund_failed';
    amountCents: number;
    reason: string;
    failureReason?: string;
  }) {
    if (!this.communicationService) {
      return;
    }

    const { traceId, sessionId, refundId, transaction, nextState, amountCents, reason, failureReason } = params;
    const userId = String(transaction?.userId || '').trim();
    const userEmail = String(transaction?.userEmail || '').trim();
    if (!userId) {
      return;
    }

    const amountMajor = Number(amountCents || 0) / 100;
    const currency = String(transaction?.currency || '').trim();
    const title =
      nextState === 'refund_processing'
        ? 'Refund in progress'
        : nextState === 'refunded'
          ? 'Refund completed'
          : 'Refund not completed';
    const message =
      nextState === 'refund_processing'
        ? `Your refund request for ${amountMajor} ${currency} is being processed.`
        : nextState === 'refunded'
          ? `Your refund for ${amountMajor} ${currency} has been completed.`
          : `Your refund request could not be completed. ${failureReason || 'Please contact support.'}`;

    try {
      await this.communicationService.dispatchInternalMessage({
        userId,
        type: nextState === 'refunded' ? 'notification' : 'toast',
        purpose: 'billing-refund-state',
        title,
        message,
        notes: `trace:${traceId};refund:${refundId};session:${sessionId};reason:${reason}`,
      });

      if (userEmail) {
        await this.communicationService.dispatchEmailFromTemplate({
          recipientEmails: [userEmail],
          templateType: `billing_refund_${nextState}`,
          dynamicData: {
            title,
            message,
            refundId,
            sessionId,
            reason,
            amount: amountMajor,
            currency,
            paymentType: transaction?.type || 'payment',
          },
          fallbackSubject: `Zootopia Club - ${title}`,
          fallbackHtml: `<p>${message}</p><p style="font-size:12px;color:#64748b;">Refund Reference: ${refundId}</p>`,
          purpose: 'billing-refund-state',
          notes: `trace:${traceId};state:${nextState}`,
        });
      }
    } catch (notificationError) {
      logDiagnostic('warn', 'billing.refund_notification_failed', {
        traceId,
        area: 'billing',
        stage: 'notifyRefundStateChange',
        userId,
        status: nextState,
        details: { sessionId, refundId, ...normalizeError(notificationError) },
      });
    }
  }

  /**
   * Creates a subscription checkout session and logs it to Firestore.
   */
  async createSubscription(request: CheckoutSessionRequest): Promise<PaymentSessionResponse> {
    try {
      this.validateSubscriptionRequest(request);
      const response = await PaymentService.startSubscription(request);
      
      await this.db.collection('transactions').doc(response.sessionId).set({
        id: response.sessionId,
        userId: request.userId,
        userEmail: request.userEmail,
        planId: request.planId,
        type: 'subscription',
        amount: 0, // Will be updated by webhook/callback
        currency: request.currency,
        status: 'pending',
        createdAt: new Date().toISOString(),
        provider: response.provider,
        providerMetadata: response.metadata || {}
      });

      return response;
    } catch (error: any) {
      logDiagnostic('error', 'billing.create_subscription_failed', {
        area: 'billing',
        stage: 'createSubscription',
        userId: request?.userId,
        details: normalizeError(error),
      });
      throw error;
    }
  }

  /**
   * Creates a donation checkout session and logs it to Firestore.
   */
  async createDonation(request: DonationRequest): Promise<PaymentSessionResponse> {
    try {
      this.validateDonationRequest(request);
      const normalizedAmount = this.normalizeDonationAmount(request.amount);
      const normalizedCurrency = String(request.currency || 'EGP').trim().toUpperCase() || 'EGP';
      const amountMode = request.amountMode === 'fixed' ? 'fixed' : 'custom';
      const donationMetadata =
        request.metadata && typeof request.metadata === 'object'
          ? (request.metadata as Record<string, unknown>)
          : {};
      const response = await PaymentService.startDonation({
        ...request,
        amount: normalizedAmount,
        currency: normalizedCurrency as DonationRequest['currency'],
      }, request.provider || 'paymob');
      
      await this.db.collection('transactions').doc(response.sessionId).set({
        id: response.sessionId,
        userId: request.userId || null,
        userEmail: request.userEmail || null,
        type: 'donation',
        amount: normalizedAmount,
        currency: normalizedCurrency,
        status: 'pending',
        donationAmountMode: amountMode,
        donationTierId: typeof request.tierId === 'string' ? request.tierId.trim() || null : null,
        isAnonymousDonation: !request.userId,
        paymentEffectsApplied: false,
        verificationAccessHash: typeof donationMetadata.verificationAccessHash === 'string'
          ? donationMetadata.verificationAccessHash
          : null,
        verificationAccessIssuedAt: typeof donationMetadata.verificationAccessIssuedAt === 'string'
          ? donationMetadata.verificationAccessIssuedAt
          : null,
        verificationAccessExpiresAt: typeof donationMetadata.verificationAccessExpiresAt === 'string'
          ? donationMetadata.verificationAccessExpiresAt
          : null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        provider: response.provider,
        providerMetadata: {
          ...(response.metadata || {}),
          merchantOrderId: response.sessionId,
        },
      });

      return response;
    } catch (error: any) {
      logDiagnostic('error', 'billing.create_donation_failed', {
        area: 'billing',
        stage: 'createDonation',
        userId: request?.userId,
        details: normalizeError(error),
      });
      throw error;
    }
  }

  /**
   * Verifies a payment status and updates Firestore accordingly.
   */
  async verifyPayment(sessionId: string): Promise<PaymentStatus> {
    try {
      const traceId = createTraceId('billing-verify');
      const canonicalSessionId = (await this.resolveTransactionSessionId(sessionId)) || sessionId;
      const doc = await this.db.collection('transactions').doc(canonicalSessionId).get();
      if (!doc.exists) {
        throw new Error('Transaction not found');
      }
      
      const transaction = doc.data()!;

      if (transaction.status === 'paid' || transaction.status === 'refunded') {
        logDiagnostic('info', 'billing.verify_payment_finalized_short_circuit', {
          traceId,
          area: 'billing',
          stage: 'verifyPayment',
          status: String(transaction.status || ''),
          userId: transaction.userId,
          details: { sessionId: canonicalSessionId, requestedSessionReference: sessionId },
        });
        return {
          status: this.mapStoredTransactionStatus(transaction.status),
          sessionId: canonicalSessionId,
          transactionId: transaction.providerTransactionId,
          amount: transaction.amount,
          currency: transaction.currency,
          metadata: {
            idempotentReplay: true,
            transactionStatus: transaction.status,
            requestedSessionReference: sessionId,
          },
        };
      }

      const provider = PaymentProviderRegistry.getProvider(transaction.provider);
      logDiagnostic('info', 'billing.verify_payment_provider_call', {
        traceId,
        area: 'billing',
        stage: 'verifyPayment',
        provider: transaction.provider,
        userId: transaction.userId,
        details: { sessionId: canonicalSessionId, requestedSessionReference: sessionId },
      });
      const upstreamStatus = await provider.verifyPayment(canonicalSessionId);
      const normalizedStatus: PaymentStatus = {
        ...upstreamStatus,
        status: this.normalizePaymentStatus(upstreamStatus.status),
        sessionId: upstreamStatus.sessionId || canonicalSessionId,
        metadata: {
          ...(upstreamStatus.metadata || {}),
          requestedSessionReference: sessionId,
          canonicalSessionId,
        },
      };

      if (normalizedStatus.status === 'success') {
        await this.db.collection('transactions').doc(canonicalSessionId).set({
          status: 'paid',
          verifiedAt: new Date().toISOString(),
          verificationCount: Number(transaction.verificationCount || 0) + 1,
          updatedAt: new Date().toISOString(),
          amount: normalizedStatus.amount,
          currency: normalizedStatus.currency,
          providerTransactionId: normalizedStatus.transactionId || transaction.providerTransactionId,
        }, { merge: true });

        const paymentEffectsApplied = transaction.paymentEffectsApplied === true;

        // Security-critical: business effects run only after provider-verified success.
        if (!paymentEffectsApplied && transaction.type === 'subscription') {
          const { getPlanById } = await import('../src/constants/plans.js');
          const plan = getPlanById(transaction.planId);
          
          await this.db.collection('users').doc(transaction.userId).update({
            plan: transaction.planId,
            credits: plan.creditsPerDay || 5, // Immediately grant credits for the new plan
            planUpdatedAt: new Date().toISOString()
          });

          await this.db.collection('transactions').doc(canonicalSessionId).set({
            paymentEffectsApplied: true,
            paymentEffectsAppliedAt: new Date().toISOString(),
          }, { merge: true });
          
          console.log(`User ${transaction.userId} plan updated to ${transaction.planId} and credits set to ${plan.creditsPerDay}`);
        } else if (transaction.type === 'tool_unlock') {
          // Entitlement grant is intentionally handled in the verification route
          // layer (server.ts) to keep payment state and authorization state
          // separated and auditable by source.
          console.log(`Tool unlock payment verified for session ${canonicalSessionId}`);
          await this.db.collection('transactions').doc(canonicalSessionId).set({
            paymentEffectsApplied: true,
            paymentEffectsAppliedAt: new Date().toISOString(),
          }, { merge: true });
        } else if (!paymentEffectsApplied && transaction.type === 'donation') {
          console.log(`Donation of ${normalizedStatus.amount} ${normalizedStatus.currency} received from ${transaction.userId || 'anonymous-donor'}`);
          await this.db.collection('transactions').doc(canonicalSessionId).set({
            paymentEffectsApplied: true,
            paymentEffectsAppliedAt: new Date().toISOString(),
          }, { merge: true });
        }

        await this.notifyPaymentStateChange({
          traceId,
          sessionId: canonicalSessionId,
          transaction,
          nextState: 'success',
          amount: normalizedStatus.amount,
          currency: normalizedStatus.currency,
        });
      } else if (normalizedStatus.status === 'failed' || normalizedStatus.status === 'cancelled' || normalizedStatus.status === 'pending') {
        if (this.isFinalizedTransactionStatus(transaction.status)) {
          return {
            ...normalizedStatus,
            metadata: {
              ...(normalizedStatus.metadata || {}),
              ignoredDueToFinalizedTransaction: true,
              transactionStatus: transaction.status,
            },
          };
        }

        await this.db.collection('transactions').doc(canonicalSessionId).set({
          status: normalizedStatus.status,
          providerTransactionId: normalizedStatus.transactionId || transaction.providerTransactionId,
          verificationCount: Number(transaction.verificationCount || 0) + 1,
          verifiedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }, { merge: true });

        await this.notifyPaymentStateChange({
          traceId,
          sessionId: canonicalSessionId,
          transaction,
          nextState: normalizedStatus.status,
          amount: normalizedStatus.amount,
          currency: normalizedStatus.currency,
        });
      }

      return {
        ...normalizedStatus,
        sessionId: canonicalSessionId,
      };
    } catch (error: any) {
      logDiagnostic('error', 'billing.verify_payment_failed', {
        area: 'billing',
        stage: 'verifyPayment',
        details: { sessionId, ...normalizeError(error) },
      });
      throw error;
    }
  }

  /**
   * Handles a webhook from a payment provider.
   */
  async handleWebhook(providerId: any, payload: any, signature?: string): Promise<PaymentStatus | null> {
    try {
      const traceId = createTraceId('billing-webhook');
      const provider = PaymentProviderRegistry.getProvider(providerId);
      logDiagnostic('info', 'billing.webhook_received', {
        traceId,
        area: 'billing',
        stage: 'handleWebhook',
        provider: String(providerId),
      });
      const upstreamStatus = await provider.handleWebhook(payload, signature);
      if (!upstreamStatus) {
        return null;
      }

      const status: PaymentStatus = {
        ...upstreamStatus,
        status: this.normalizePaymentStatus(upstreamStatus.status),
      };

      const webhookEventId = this.buildWebhookEventId(String(providerId), status, payload);
      const webhookRef = this.db.collection('billing_webhook_events').doc(webhookEventId);
      const webhookSnap = await webhookRef.get();
      if (webhookSnap.exists) {
        logDiagnostic('info', 'billing.webhook_duplicate_ignored', {
          traceId,
          area: 'billing',
          stage: 'handleWebhook',
          provider: String(providerId),
          details: { webhookEventId },
        });
        return {
          ...status,
          metadata: {
            ...(status.metadata || {}),
            duplicateWebhookEvent: true,
            webhookEventId,
          },
        };
      }

      await webhookRef.set({
        id: webhookEventId,
        provider: String(providerId),
        sessionId: status.sessionId || null,
        transactionId: status.transactionId || null,
        status: status.status,
        receivedAt: new Date().toISOString(),
      }, { merge: true });

      const sessionId = await this.resolveTransactionByStatus(status);

      if (!sessionId) {
        logDiagnostic('warn', 'billing.webhook_unknown_transaction', {
          area: 'billing',
          stage: 'handleWebhook',
          provider: String(providerId),
          details: { transactionId: status.transactionId },
        });
        return status;
      }

      const txRef = this.db.collection('transactions').doc(sessionId);
      const txSnap = await txRef.get();
      if (!txSnap.exists) {
        return status;
      }

      const transaction = txSnap.data() || {};

      // Security-critical: only provider-verified success may drive business effects.
      if (status.status === 'success') {
        logDiagnostic('info', 'billing.webhook_success_verify_triggered', {
          traceId,
          area: 'billing',
          stage: 'handleWebhook',
          provider: String(providerId),
          userId: transaction.userId,
          details: { sessionId },
        });
        await this.verifyPayment(sessionId);
        return status;
      }

      if (this.isFinalizedTransactionStatus(transaction.status)) {
        return {
          ...status,
          metadata: {
            ...(status.metadata || {}),
            ignoredDueToFinalizedTransaction: true,
            transactionStatus: transaction.status,
          },
        };
      }

      await txRef.set({
        status: status.status,
        providerTransactionId: status.transactionId || transaction.providerTransactionId,
        lastWebhookStatus: status.status,
        lastWebhookAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      return status;
    } catch (error: any) {
      logDiagnostic('error', 'billing.handle_webhook_failed', {
        area: 'billing',
        stage: 'handleWebhook',
        provider: String(providerId),
        details: normalizeError(error),
      });
      return null;
    }
  }

  /**
   * Processes a refund for a transaction.
   */
  async refund(sessionId: string, amountCents: number, reason: string): Promise<{ success: boolean; refundId?: string; error?: string }> {
    try {
      const traceId = createTraceId('billing-refund');
      const doc = await this.db.collection('transactions').doc(sessionId).get();
      if (!doc.exists) {
        return { success: false, error: 'Transaction not found' };
      }
      
      const transaction = doc.data()!;
      if (transaction.status !== 'paid') {
        return { success: false, error: 'Only paid transactions can be refunded' };
      }

      if (!Number.isFinite(amountCents) || amountCents <= 0) {
        return { success: false, error: 'Refund amount must be a positive integer in cents' };
      }

      const transactionAmountCents = Math.round(Number(transaction.amount || 0) * 100);
      if (transactionAmountCents > 0 && amountCents > transactionAmountCents) {
        return { success: false, error: 'Refund amount exceeds original transaction amount' };
      }

      if (!transaction.providerTransactionId) {
        return { success: false, error: 'Provider transaction id is missing for this payment' };
      }

      // Check for existing refund
      const existingRefund = await this.db.collection('refunds')
        .where('transactionId', '==', sessionId)
        .where('status', 'in', ['refund_requested', 'refund_processing', 'refunded'])
        .get();

      if (!existingRefund.empty) {
        return { success: false, error: 'A refund for this transaction is already in progress or completed' };
      }

      const provider = PaymentProviderRegistry.getProvider(transaction.provider);
      
      // Create refund record
      const refundId = `REF-${sessionId}-${Date.now()}`;
      const refundType = transactionAmountCents > 0 && amountCents < transactionAmountCents ? 'partial' : 'full';
      await this.db.collection('refunds').doc(refundId).set({
        id: refundId,
        transactionId: sessionId,
        userId: transaction.userId,
        amount: amountCents / 100,
        amountCents,
        currency: transaction.currency,
        refundType,
        status: 'refund_requested',
        reason,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      await this.db.collection('refunds').doc(refundId).set({
        status: 'refund_processing',
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      await this.notifyRefundStateChange({
        traceId,
        sessionId,
        refundId,
        transaction,
        nextState: 'refund_processing',
        amountCents,
        reason,
      });

      const result = await provider.refund(transaction.providerTransactionId, amountCents, reason);

      if (result.success) {
        await this.db.collection('refunds').doc(refundId).update({
          status: 'refunded',
          providerRefundId: result.refundId,
          refundedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        await this.db.collection('transactions').doc(sessionId).update({
          status: 'refunded',
          refundedAmount: amountCents / 100,
          refundedAmountCents: amountCents,
          refundType,
          refundedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        // REFUND-SENSITIVE BUSINESS RULE:
        // Revoke subscription entitlements only on full refunds. Partial refunds
        // should not silently strip plan access without a dedicated policy flow.
        if (transaction.type === 'subscription' && refundType === 'full') {
          // Revoke access
          await this.db.collection('users').doc(transaction.userId).update({
            plan: 'free',
            credits: 0,
            planUpdatedAt: new Date().toISOString()
          });
          console.log(`User ${transaction.userId} plan revoked due to refund`);
        }

        await this.notifyRefundStateChange({
          traceId,
          sessionId,
          refundId,
          transaction,
          nextState: 'refunded',
          amountCents,
          reason,
        });

        logDiagnostic('info', 'billing.refund_completed', {
          traceId,
          area: 'billing',
          stage: 'refund',
          provider: transaction.provider,
          userId: transaction.userId,
          details: { sessionId, refundId, refundType },
        });

        return { success: true, refundId };
      } else {
        await this.db.collection('refunds').doc(refundId).update({
          status: 'refund_failed',
          metadata: { error: result.error },
          updatedAt: new Date().toISOString()
        });

        await this.notifyRefundStateChange({
          traceId,
          sessionId,
          refundId,
          transaction,
          nextState: 'refund_failed',
          amountCents,
          reason,
          failureReason: result.error,
        });

        return { success: false, error: result.error };
      }
    } catch (error: any) {
      logDiagnostic('error', 'billing.refund_failed', {
        area: 'billing',
        stage: 'refund',
        details: { sessionId, ...normalizeError(error) },
      });
      return { success: false, error: error.message };
    }
  }
}
