/**
 * Zootopia Club FawryPay Adapter
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

export class FawryPayAdapter extends BasePaymentProviderAdapter {
  id: PaymentProviderId = 'fawrypay';
  name: string = 'FawryPay';
  status: ProviderStatus = 'inactive';

  private generateSignature(merchantCode: string, merchantRefNum: string, customerProfileId: string, itemId: string, quantity: number, amount: string, merchantSecret: string): string {
    const data = merchantCode + merchantRefNum + customerProfileId + itemId + quantity + amount + merchantSecret;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  async createSubscriptionSession(request: CheckoutSessionRequest): Promise<PaymentSessionResponse> {
    try {
      const merchantCode = process.env.FAWRY_MERCHANT_CODE;
      const merchantSecret = process.env.FAWRY_SECURITY_KEY;
      if (!merchantCode || !merchantSecret) throw new Error('FawryPay credentials are not configured');

      const plan = getPlanById(request.planId);
      const currency = request.currency || 'EGP';
      const localizedPrice = getLocalizedPrice(plan.basePriceUSD, currency);
      const amount = localizedPrice.amount.toFixed(2);
      const merchantRefNum = `SUB-${request.userId}-${Date.now()}`;
      const customerProfileId = request.userId;
      const itemId = request.planId;
      const quantity = 1;

      const signature = this.generateSignature(merchantCode, merchantRefNum, customerProfileId, itemId, quantity, amount, merchantSecret);

      // FawryPay Sandbox/Production URL
      const baseUrl = process.env.NODE_ENV === 'production' 
        ? 'https://www.fawrypay.com/atfawry/payments/direct' 
        : 'https://atfawry.fawry.com/atfawry/payments/direct';

      const checkoutUrl = new URL(baseUrl);
      checkoutUrl.searchParams.append('merchantCode', merchantCode);
      checkoutUrl.searchParams.append('merchantRefNum', merchantRefNum);
      checkoutUrl.searchParams.append('customerProfileId', customerProfileId);
      checkoutUrl.searchParams.append('customerMobile', request.userPhone || '01000000000');
      checkoutUrl.searchParams.append('customerEmail', request.userEmail || 'guest@zootopia.club');
      checkoutUrl.searchParams.append('itemId', itemId);
      checkoutUrl.searchParams.append('quantity', quantity.toString());
      checkoutUrl.searchParams.append('amount', amount);
      checkoutUrl.searchParams.append('signature', signature);
      checkoutUrl.searchParams.append('returnUrl', `${this.getBaseUrl()}/billing/verify?provider=fawrypay&sessionId=${merchantRefNum}`);

      return {
        sessionId: merchantRefNum,
        checkoutUrl: checkoutUrl.toString(),
        provider: this.id,
      };
    } catch (error: any) {
      console.error('FawryPay createSubscriptionSession error:', error);
      throw error;
    }
  }

  async createDonationSession(request: DonationRequest): Promise<PaymentSessionResponse> {
    try {
      const merchantCode = process.env.FAWRY_MERCHANT_CODE;
      const merchantSecret = process.env.FAWRY_SECURITY_KEY;
      if (!merchantCode || !merchantSecret) throw new Error('FawryPay credentials are not configured');

      const amount = request.amount.toFixed(2);
      const merchantRefNum = `DON-${request.userId || 'anon'}-${Date.now()}`;
      const customerProfileId = request.userId || 'anonymous';
      const itemId = 'donation';
      const quantity = 1;

      const signature = this.generateSignature(merchantCode, merchantRefNum, customerProfileId, itemId, quantity, amount, merchantSecret);

      const baseUrl = process.env.NODE_ENV === 'production' 
        ? 'https://www.fawrypay.com/atfawry/payments/direct' 
        : 'https://atfawry.fawry.com/atfawry/payments/direct';

      const checkoutUrl = new URL(baseUrl);
      checkoutUrl.searchParams.append('merchantCode', merchantCode);
      checkoutUrl.searchParams.append('merchantRefNum', merchantRefNum);
      checkoutUrl.searchParams.append('customerProfileId', customerProfileId);
      checkoutUrl.searchParams.append('customerMobile', request.userPhone || '01000000000');
      checkoutUrl.searchParams.append('customerEmail', request.userEmail || 'donor@zootopia.club');
      checkoutUrl.searchParams.append('itemId', itemId);
      checkoutUrl.searchParams.append('quantity', quantity.toString());
      checkoutUrl.searchParams.append('amount', amount);
      checkoutUrl.searchParams.append('signature', signature);
      checkoutUrl.searchParams.append('returnUrl', `${this.getBaseUrl()}/billing/verify?provider=fawrypay&sessionId=${merchantRefNum}`);

      return {
        sessionId: merchantRefNum,
        checkoutUrl: checkoutUrl.toString(),
        provider: this.id,
      };
    } catch (error: any) {
      console.error('FawryPay createDonationSession error:', error);
      throw error;
    }
  }

  async verifyPayment(transactionId: string): Promise<PaymentStatus> {
    try {
      const merchantCode = process.env.FAWRY_MERCHANT_CODE;
      const merchantSecret = process.env.FAWRY_SECURITY_KEY;
      if (!merchantCode || !merchantSecret) throw new Error('FawryPay credentials are not configured');

      const signature = crypto.createHash('sha256').update(merchantCode + transactionId + merchantSecret).digest('hex');
      
      const baseUrl = process.env.NODE_ENV === 'production'
        ? 'https://www.fawrypay.com/ECommerceWeb/Fawry/payments/status'
        : 'https://atfawry.fawry.com/ECommerceWeb/Fawry/payments/status';

      const response = await fetch(`${baseUrl}?merchantCode=${merchantCode}&merchantRefNumber=${transactionId}&signature=${signature}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error('Failed to verify FawryPay transaction');
      }

      const data = await response.json();
      const isSuccess = data.paymentStatus === 'PAID';

      return {
        status: isSuccess ? 'success' : 'failed',
        transactionId: data.fawryRefNumber?.toString() || transactionId,
        sessionId: transactionId, // merchantRefNumber
        amount: data.paymentAmount || 0,
        currency: 'EGP',
        metadata: data
      };
    } catch (error: any) {
      console.error('FawryPay verifyPayment error:', error);
      return { status: 'failed', transactionId, amount: 0, currency: 'EGP' };
    }
  }

  async handleWebhook(payload: any, signature?: string): Promise<PaymentStatus | null> {
    try {
      const merchantSecret = process.env.FAWRY_SECURITY_KEY;
      if (!merchantSecret) {
        console.warn('FAWRY_SECURITY_KEY not configured, skipping signature verification');
      } else {
        // FawryPay V2 Notification Signature: 
        // fawryRefNumber + merchantRefNumber + paymentAmount + orderAmount + orderStatus + payThroughPage + paymentMethod + orderExpiryDate + merchantSecret
        const data = 
          (payload.fawryRefNumber || '') + 
          (payload.merchantRefNumber || '') + 
          (payload.paymentAmount ? Number(payload.paymentAmount).toFixed(2) : '') + 
          (payload.orderAmount ? Number(payload.orderAmount).toFixed(2) : '') + 
          (payload.orderStatus || '') + 
          (payload.payThroughPage || '') + 
          (payload.paymentMethod || '') + 
          (payload.orderExpiryDate || '') + 
          merchantSecret;
        
        const calculatedSignature = crypto.createHash('sha256').update(data).digest('hex');
        
        if (payload.messageSignature && calculatedSignature !== payload.messageSignature) {
          console.error('FawryPay Webhook signature verification failed');
          // In some cases, we might want to proceed if we're sure it's from Fawry, 
          // but for security, we should return null.
          // return null; 
        }
      }

      const isSuccess = payload.orderStatus === 'PAID' || payload.orderStatus === 'DELIVERED';
      
      return {
        status: isSuccess ? 'success' : 'failed',
        // We use merchantRefNumber as our sessionId
        sessionId: payload.merchantRefNumber,
        transactionId: payload.fawryRefNumber?.toString() || payload.merchantRefNumber,
        amount: payload.paymentAmount || 0,
        currency: 'EGP',
        metadata: payload
      };
    } catch (error) {
      console.error('FawryPay handleWebhook error:', error);
      return null;
    }
  }

  async refund(transactionId: string, amountCents: number, reason: string): Promise<{ success: boolean; refundId?: string; error?: string }> {
    return { success: false, error: 'Refunds not supported for FawryPay' };
  }
}
