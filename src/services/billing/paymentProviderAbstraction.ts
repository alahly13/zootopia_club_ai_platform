/**
 * Zootopia Club Payment Provider Abstraction
 * (c) 2026 Zootopia Club
 */

import { 
  PaymentProviderId, 
  CheckoutSessionRequest, 
  DonationRequest, 
  PaymentSessionResponse, 
  PaymentStatus 
} from '../../types/billing';

/**
 * Interface for a payment provider adapter.
 * Each provider (Paymob, FawryPay, EasyKash) must implement this.
 */
export type ProviderStatus = 'active' | 'inactive' | 'disabled' | 'future';

function resolveServerPublicAppUrl(): string {
  const configured = String(process.env.APP_URL || '').trim();
  return (configured || 'http://localhost:3000').replace(/\/$/, '');
}

/**
 * Interface for a payment provider adapter.
 * Each provider (Paymob, FawryPay, EasyKash) must implement this.
 */
export interface PaymentProviderAdapter {
  id: PaymentProviderId;
  name: string;
  status: ProviderStatus;
  
  /**
   * Creates a checkout session for a subscription.
   */
  createSubscriptionSession(request: CheckoutSessionRequest): Promise<PaymentSessionResponse>;
  
  /**
   * Creates a checkout session for a donation.
   */
  createDonationSession(request: DonationRequest): Promise<PaymentSessionResponse>;
  
  /**
   * Verifies the status of a payment.
   */
  verifyPayment(transactionId: string): Promise<PaymentStatus>;
  
  /**
   * Handles a webhook notification from the provider.
   */
  handleWebhook(payload: any, signature?: string): Promise<PaymentStatus | null>;

  /**
   * Refunds a transaction.
   */
  refund(transactionId: string, amountCents: number, reason: string): Promise<{ success: boolean; refundId?: string; error?: string }>;
}

/**
 * Registry to manage and retrieve payment provider adapters.
 */
export class PaymentProviderRegistry {
  private static providers: Map<PaymentProviderId, PaymentProviderAdapter> = new Map();

  static register(provider: PaymentProviderAdapter) {
    this.providers.set(provider.id, provider);
  }

  static getProvider(id: PaymentProviderId): PaymentProviderAdapter {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new Error(`Payment provider not found: ${id}`);
    }
    return provider;
  }

  static getAllProviders(): PaymentProviderAdapter[] {
    return Array.from(this.providers.values());
  }

  static getActiveProviders(): PaymentProviderAdapter[] {
    return Array.from(this.providers.values()).filter(p => p.status === 'active');
  }

  /**
   * Returns the default provider for a given currency or region.
   */
  static getDefaultProvider(currency?: string): PaymentProviderAdapter {
    const activeProviders = this.getActiveProviders();
    if (activeProviders.length === 0) {
      throw new Error('No active payment providers found');
    }
    // For now, return the first active one as default
    return activeProviders[0];
  }
}

/**
 * Base class for payment provider adapters to share common logic.
 */
export abstract class BasePaymentProviderAdapter implements PaymentProviderAdapter {
  abstract id: PaymentProviderId;
  abstract name: string;
  abstract status: ProviderStatus;

  abstract createSubscriptionSession(request: CheckoutSessionRequest): Promise<PaymentSessionResponse>;
  abstract createDonationSession(request: DonationRequest): Promise<PaymentSessionResponse>;
  abstract verifyPayment(transactionId: string): Promise<PaymentStatus>;
  abstract handleWebhook(payload: any, signature?: string): Promise<PaymentStatus | null>;
  abstract refund(transactionId: string, amountCents: number, reason: string): Promise<{ success: boolean; refundId?: string; error?: string }>;

  protected getBaseUrl(): string {
    /**
     * This adapter layer executes on the backend only, even though it lives
     * under `src/` for historical reasons. Keep APP_URL pointed at the public
     * frontend origin (local app, Firebase Hosting, or Netlify) rather than the
     * backend host so payment providers return users to the correct surface.
     */
    return resolveServerPublicAppUrl();
  }
}
