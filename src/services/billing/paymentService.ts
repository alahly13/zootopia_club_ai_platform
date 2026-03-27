/**
 * Zootopia Club Payment Service
 * (c) 2026 Zootopia Club
 */

import { PaymentProviderRegistry } from './paymentProviderAbstraction';
import { PaymobAdapter } from './adapters/paymobAdapter';
import { FawryPayAdapter } from './adapters/fawryPayAdapter';
import { EasyKashAdapter } from './adapters/easyKashAdapter';
import { 
  PaymentProviderId, 
  CheckoutSessionRequest, 
  DonationRequest, 
  PaymentSessionResponse 
} from '../../types/billing';

// Initialize and register providers
PaymentProviderRegistry.register(new PaymobAdapter());
PaymentProviderRegistry.register(new FawryPayAdapter());
PaymentProviderRegistry.register(new EasyKashAdapter());

/**
 * High-level service for handling payments in the Zootopia Club app.
 */
export const PaymentService = {
  /**
   * Starts a subscription checkout process.
   */
  async startSubscription(request: CheckoutSessionRequest, providerId?: PaymentProviderId): Promise<PaymentSessionResponse> {
    const provider = providerId 
      ? PaymentProviderRegistry.getProvider(providerId) 
      : PaymentProviderRegistry.getDefaultProvider(request.currency);
    
    return provider.createSubscriptionSession(request);
  },

  /**
   * Starts a donation process.
   */
  async startDonation(request: DonationRequest, providerId?: PaymentProviderId): Promise<PaymentSessionResponse> {
    const provider = providerId 
      ? PaymentProviderRegistry.getProvider(providerId) 
      : PaymentProviderRegistry.getDefaultProvider(request.currency);
    
    return provider.createDonationSession(request);
  },

  /**
   * Gets all available payment providers.
   */
  getAvailableProviders() {
    return PaymentProviderRegistry.getAllProviders().map(p => ({
      id: p.id,
      name: p.name,
    }));
  }
};
