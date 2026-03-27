/**
 * Zootopia Club Paymob Adapter
 * (c) 2026 Zootopia Club
 */

import { 
  PaymentProviderId, 
  CheckoutSessionRequest, 
  DonationRequest, 
  PaymentSessionResponse, 
  PaymentStatus 
} from '../../../types/billing';
import { BasePaymentProviderAdapter, ProviderStatus } from '../paymentProviderAbstraction';
import { getPlanById } from '../../../constants/plans';
import { getLocalizedPrice } from '../pricingDisplayService';
import crypto from 'crypto';

export class PaymobAdapter extends BasePaymentProviderAdapter {
  id: PaymentProviderId = 'paymob';
  name: string = 'Paymob';
  status: ProviderStatus = 'active';

  private buildMerchantOrderId(prefix: 'SUB' | 'DON', actorId: string): string {
    const safeActor = String(actorId || 'anon').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16) || 'anon';
    const nonce = crypto.randomBytes(6).toString('hex');
    return `${prefix}-${safeActor}-${Date.now()}-${nonce}`;
  }

  private toPositiveAmount(value: unknown): number {
    const amount = Number(value);
    return Number.isFinite(amount) && amount > 0 ? amount : 0;
  }

  private normalizeCurrency(value: unknown): string {
    const normalized = String(value || 'EGP').trim().toUpperCase();
    return normalized || 'EGP';
  }

  private normalizePaymobStatus(payload: any): 'success' | 'failed' | 'pending' | 'cancelled' {
    const success = payload?.success === true || payload?.success === 'true';
    const pending = payload?.pending === true || payload?.pending === 'true';
    const isRefunded = payload?.is_refunded === true || payload?.is_refunded === 'true';
    const isVoided = payload?.is_voided === true || payload?.is_voided === 'true';
    const hasError = payload?.error_occured === true || payload?.error_occured === 'true';

    if (success) return 'success';
    if (isRefunded || isVoided) return 'cancelled';
    if (pending) return 'pending';
    if (hasError) return 'failed';
    return 'pending';
  }

  private safeHmacEquals(left: string, right: string): boolean {
    const a = Buffer.from(String(left || '').toLowerCase());
    const b = Buffer.from(String(right || '').toLowerCase());
    if (a.length !== b.length || a.length === 0) return false;
    return crypto.timingSafeEqual(a, b);
  }

  private async getAuthToken(): Promise<string> {
    const apiKey = process.env.PAYMOB_API_KEY;
    if (!apiKey) throw new Error('PAYMOB_API_KEY is not configured');

    const response = await fetch('https://egypt.paymob.com/api/auth/tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Paymob Auth Error: ${JSON.stringify(error)}`);
    }

    const data = await response.json();
    return data.token;
  }

  private async createOrder(token: string, amountCents: number, currency: string, merchantOrderId: string): Promise<number> {
    const response = await fetch('https://egypt.paymob.com/api/ecommerce/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth_token: token,
        delivery_needed: "false",
        amount_cents: amountCents,
        currency: currency,
        merchant_order_id: merchantOrderId,
        items: []
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Paymob Order Error: ${JSON.stringify(error)}`);
    }

    const data = await response.json();
    return data.id;
  }

  private async getPaymentKey(token: string, orderId: number, amountCents: number, currency: string, billingData: any): Promise<string> {
    const integrationId = process.env.PAYMOB_INTEGRATION_ID;
    if (!integrationId) throw new Error('PAYMOB_INTEGRATION_ID is not configured');

    const response = await fetch('https://egypt.paymob.com/api/acceptance/payment_keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth_token: token,
        amount_cents: amountCents,
        expiration: 3600,
        order_id: orderId,
        billing_data: {
          apartment: "NA",
          email: billingData.email || "guest@zootopia.club",
          floor: "NA",
          first_name: billingData.firstName || "Zootopia",
          street: "NA",
          building: "NA",
          phone_number: billingData.phone || "+201000000000",
          shipping_method: "NA",
          postal_code: "NA",
          city: "NA",
          country: "EG",
          last_name: billingData.lastName || "User",
          state: "NA"
        },
        currency: currency,
        integration_id: parseInt(integrationId),
        lock_order_when_paid: "false"
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Paymob Payment Key Error: ${JSON.stringify(error)}`);
    }

    const data = await response.json();
    return data.token;
  }

  async createSubscriptionSession(request: CheckoutSessionRequest): Promise<PaymentSessionResponse> {
    try {
      const plan = getPlanById(request.planId);
      if (!request.planId || plan.id !== request.planId) {
        throw new Error('Invalid subscription planId');
      }

      const currency = request.currency || 'EGP';
      const localizedPrice = getLocalizedPrice(plan.basePriceUSD, currency);
      
      const amountCents = Math.round(localizedPrice.amount * 100);
      if (amountCents <= 0) {
        throw new Error('Invalid subscription amount');
      }

      const merchantOrderId = this.buildMerchantOrderId('SUB', request.userId);

      const token = await this.getAuthToken();
      const orderId = await this.createOrder(token, amountCents, currency, merchantOrderId);
      const paymentKey = await this.getPaymentKey(token, orderId, amountCents, currency, {
        email: request.userEmail,
        firstName: request.userId.substring(0, 10),
        lastName: "Subscriber"
      });

      const iframeId = process.env.PAYMOB_IFRAME_ID;
      if (!iframeId) throw new Error('PAYMOB_IFRAME_ID is not configured');

      return {
        sessionId: merchantOrderId,
        checkoutUrl: `https://egypt.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${paymentKey}`,
        provider: this.id,
        metadata: {
          orderId,
          successUrl: request.successUrl,
          cancelUrl: request.cancelUrl,
        }
      };
    } catch (error: any) {
      console.error('Paymob createSubscriptionSession error:', error);
      throw error;
    }
  }

  async createDonationSession(request: DonationRequest): Promise<PaymentSessionResponse> {
    try {
      const amountCents = Math.round(this.toPositiveAmount(request.amount) * 100);
      const currency = this.normalizeCurrency(request.currency);
      if (amountCents <= 0) {
        throw new Error('Invalid donation amount');
      }

      const merchantOrderId = this.buildMerchantOrderId('DON', request.userId || 'anon');

      const token = await this.getAuthToken();
      const orderId = await this.createOrder(token, amountCents, currency, merchantOrderId);
      const paymentKey = await this.getPaymentKey(token, orderId, amountCents, currency, {
        email: request.userEmail || "donor@zootopia.club",
        firstName: "Zootopia",
        lastName: "Donor"
      });

      const iframeId = process.env.PAYMOB_IFRAME_ID;
      if (!iframeId) throw new Error('PAYMOB_IFRAME_ID is not configured');

      return {
        sessionId: merchantOrderId,
        checkoutUrl: `https://egypt.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${paymentKey}`,
        provider: this.id,
        metadata: {
          orderId,
          merchantOrderId,
          successUrl: request.successUrl,
          cancelUrl: request.cancelUrl,
        }
      };
    } catch (error: any) {
      console.error('Paymob createDonationSession error:', error);
      throw error;
    }
  }

  async verifyPayment(transactionId: string): Promise<PaymentStatus> {
    try {
      const token = await this.getAuthToken();
      
      /**
       * Paymob's order inquiry is authoritative for merchant-order lifecycle,
       * but it does not always surface the final acceptance transaction ID we
       * need for downstream refund/admin tooling. Keep merchant-order lookup
       * and transaction lookup distinct instead of collapsing them.
       */
      if (transactionId.startsWith('SUB-') || transactionId.startsWith('DON-')) {
        const response = await fetch(`https://egypt.paymob.com/api/ecommerce/orders?merchant_order_id=${transactionId}`, {
          method: 'GET',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
        });

        if (response.ok) {
          const data = await response.json();
          // Paymob's list API returns results array
          const order = data.results?.find((o: any) => o.merchant_order_id === transactionId);
          if (order) {
            const normalizedStatus = order.paid === true
              ? 'success'
              : (order.canceled === true ? 'cancelled' : 'pending');

            return {
              status: normalizedStatus,
              transactionId: undefined,
              sessionId: transactionId,
              amount: this.toPositiveAmount(order.amount_cents) / 100,
              currency: this.normalizeCurrency(order.currency),
              metadata: {
                ...order,
                paymobOrderId: order.id,
                lookupKind: 'merchant_order_lookup',
              }
            };
          }
        }
      }

      // Paymob transaction retrieval by ID
      const response = await fetch(`https://egypt.paymob.com/api/acceptance/transactions/${transactionId}`, {
        method: 'GET',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
      });

      if (!response.ok) {
        throw new Error('Failed to verify Paymob transaction');
      }

      const data = await response.json();
      const normalizedStatus = this.normalizePaymobStatus(data);

      return {
        status: normalizedStatus,
        transactionId: data.id.toString(),
        sessionId: data.order?.merchant_order_id || data.merchant_order_id || transactionId,
        amount: this.toPositiveAmount(data.amount_cents) / 100,
        currency: this.normalizeCurrency(data.currency),
        metadata: data
      };
    } catch (error: any) {
      console.error('Paymob verifyPayment error:', error);
      return {
        status: 'pending',
        transactionId,
        amount: 0,
        currency: 'EGP',
        metadata: { reason: 'verify-error', error: error?.message || 'unknown' },
      };
    }
  }

  async handleWebhook(payload: any, signature?: string): Promise<PaymentStatus | null> {
    try {
      const hmacSecret = process.env.PAYMOB_HMAC_SECRET;
      const providedSignature = String(payload?.hmac || signature || '').trim().toLowerCase();

      // Security-critical: if secret is configured, webhook signature is mandatory.
      if (!hmacSecret) {
        console.warn('PAYMOB_HMAC_SECRET not configured, rejecting webhook for security hardening');
        return null;
      }

      if (!providedSignature) {
        console.error('Missing Paymob webhook signature');
        return null;
      }

      {
        const obj = payload.obj;
        if (obj) {
          const data = [
            obj.amount_cents,
            obj.created_at,
            obj.currency,
            obj.error_occured,
            obj.has_parent_transaction,
            obj.id,
            obj.integration_id,
            obj.is_3d_secure,
            obj.is_auth,
            obj.is_capture,
            obj.is_refunded,
            obj.is_standalone_payment,
            obj.is_voided,
            obj.order.id,
            obj.owner,
            obj.pending,
            obj.source_data?.pan || '',
            obj.source_data?.sub_type || '',
            obj.source_data?.type || '',
            obj.success
          ].join('');

          const calculatedHmac = crypto.createHmac('sha512', hmacSecret).update(data).digest('hex').toLowerCase();
          
          if (!this.safeHmacEquals(calculatedHmac, providedSignature)) {
            console.error('Paymob HMAC verification failed');
            return null;
          }
        } else {
          console.error('Invalid Paymob webhook payload: missing obj');
          return null;
        }
      }

      const obj = payload.obj;
      if (!obj) return null;

      const normalizedStatus = this.normalizePaymobStatus(obj);
      
      return {
        status: normalizedStatus,
        sessionId: obj.order?.merchant_order_id || obj.merchant_order_id,
        transactionId: obj.id.toString(),
        amount: this.toPositiveAmount(obj.amount_cents) / 100,
        currency: this.normalizeCurrency(obj.currency),
        metadata: obj
      };
    } catch (error) {
      console.error('Paymob handleWebhook error:', error);
      return null;
    }
  }

  async refund(transactionId: string, amountCents: number, reason: string): Promise<{ success: boolean; refundId?: string; error?: string }> {
    try {
      const token = await this.getAuthToken();
      const response = await fetch('https://egypt.paymob.com/api/acceptance/void_refund/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auth_token: token,
          transaction_id: parseInt(transactionId),
          amount_cents: amountCents
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: `Paymob Refund Error: ${JSON.stringify(error)}` };
      }

      const data = await response.json();
      return { success: true, refundId: data.id.toString() };
    } catch (error: any) {
      console.error('Paymob refund error:', error);
      return { success: false, error: error.message };
    }
  }
}
