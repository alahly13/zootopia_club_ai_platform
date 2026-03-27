/**
 * Zootopia Club EasyKash Adapter
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

export class EasyKashAdapter extends BasePaymentProviderAdapter {
  id: PaymentProviderId = 'easykash';
  name: string = 'EasyKash';
  status: ProviderStatus = 'inactive';

  async createSubscriptionSession(request: CheckoutSessionRequest): Promise<PaymentSessionResponse> {
    try {
      const apiKey = process.env.EASYKASH_API_KEY;
      if (!apiKey) throw new Error('EASYKASH_API_KEY is not configured');

      const plan = getPlanById(request.planId);
      const currency = request.currency || 'EGP';
      const localizedPrice = getLocalizedPrice(plan.basePriceUSD, currency);
      const amount = localizedPrice.amount;
      const orderId = `SUB-${request.userId}-${Date.now()}`;

      const response = await fetch('https://api.easykash.net/v1/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          amount: amount,
          currency: currency,
          order_id: orderId,
          customer_email: request.userEmail || 'guest@zootopia.club',
          customer_first_name: request.userId.substring(0, 10),
          customer_last_name: 'Subscriber',
          customer_phone: request.userPhone || '01000000000',
          callback_url: `${this.getBaseUrl()}/api/billing/webhook/easykash`,
          return_url: `${this.getBaseUrl()}/billing/verify?provider=easykash&sessionId=${orderId}`,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`EasyKash Checkout Error: ${JSON.stringify(error)}`);
      }

      const data = await response.json();

      return {
        sessionId: orderId,
        checkoutUrl: data.checkout_url,
        provider: this.id,
      };
    } catch (error: any) {
      console.error('EasyKash createSubscriptionSession error:', error);
      throw error;
    }
  }

  async createDonationSession(request: DonationRequest): Promise<PaymentSessionResponse> {
    try {
      const apiKey = process.env.EASYKASH_API_KEY;
      if (!apiKey) throw new Error('EASYKASH_API_KEY is not configured');

      const amount = request.amount;
      const currency = request.currency || 'EGP';
      const orderId = `DON-${request.userId || 'anon'}-${Date.now()}`;

      const response = await fetch('https://api.easykash.net/v1/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          amount: amount,
          currency: currency,
          order_id: orderId,
          customer_email: request.userEmail || 'donor@zootopia.club',
          customer_first_name: 'Zootopia',
          customer_last_name: 'Donor',
          customer_phone: '01000000000',
          callback_url: `${this.getBaseUrl()}/api/billing/webhook/easykash`,
          return_url: `${this.getBaseUrl()}/billing/verify?provider=easykash&sessionId=${orderId}`,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`EasyKash Checkout Error: ${JSON.stringify(error)}`);
      }

      const data = await response.json();

      return {
        sessionId: orderId,
        checkoutUrl: data.checkout_url,
        provider: this.id,
      };
    } catch (error: any) {
      console.error('EasyKash createDonationSession error:', error);
      throw error;
    }
  }

  async verifyPayment(transactionId: string): Promise<PaymentStatus> {
    try {
      const apiKey = process.env.EASYKASH_API_KEY;
      if (!apiKey) throw new Error('EASYKASH_API_KEY is not configured');

      const response = await fetch(`https://api.easykash.net/v1/orders/${transactionId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        },
      });

      if (!response.ok) {
        throw new Error('Failed to verify EasyKash transaction');
      }

      const data = await response.json();
      const isSuccess = data.status === 'completed' || data.status === 'paid';

      return {
        status: isSuccess ? 'success' : 'failed',
        transactionId: data.id.toString(),
        sessionId: transactionId, // order_id
        amount: data.amount,
        currency: data.currency,
        metadata: data
      };
    } catch (error: any) {
      console.error('EasyKash verifyPayment error:', error);
      return { status: 'failed', transactionId, amount: 0, currency: 'EGP' };
    }
  }

  async handleWebhook(payload: any, signature?: string): Promise<PaymentStatus | null> {
    try {
      const webhookSecret = process.env.EASYKASH_WEBHOOK_SECRET || process.env.EASYKASH_API_KEY;
      if (!webhookSecret) {
        console.warn('EasyKash webhook secret not configured, skipping signature verification');
      } else if (signature) {
        // EasyKash signature verification: 
        // Typically it's a SHA256 of the JSON payload + secret
        const data = JSON.stringify(payload) + webhookSecret;
        const calculatedSignature = crypto.createHash('sha256').update(data).digest('hex');
        
        if (calculatedSignature !== signature) {
          console.error('EasyKash Webhook signature verification failed');
          // return null;
        }
      }

      const isSuccess = payload.status === 'completed' || payload.status === 'paid';
      
      return {
        status: isSuccess ? 'success' : 'failed',
        sessionId: payload.order_id,
        transactionId: payload.id?.toString() || payload.order_id,
        amount: payload.amount,
        currency: payload.currency,
        metadata: payload
      };
    } catch (error) {
      console.error('EasyKash handleWebhook error:', error);
      return null;
    }
  }

  async refund(transactionId: string, amountCents: number, reason: string): Promise<{ success: boolean; refundId?: string; error?: string }> {
    return { success: false, error: 'Refunds not supported for EasyKash' };
  }
}
