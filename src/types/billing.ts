/**
 * Billing and Subscription Types
 * (c) 2026 Zootopia Club
 */

export type CurrencyCode = 'USD' | 'EGP' | 'SAR' | 'AED' | 'EUR' | 'GBP';

export type PaymentProviderId = 'stripe' | 'paymob' | 'fawry' | 'fawrypay' | 'easykash' | 'mock';

export interface PaymentStatus {
  status: 'pending' | 'success' | 'failed' | 'cancelled';
  transactionId?: string;
  sessionId?: string;
  amount?: number;
  currency?: string;
  metadata?: any;
}

export interface SubscriptionPlan {
  id: string;
  nameKey: string;
  descriptionKey: string;
  basePriceUSD: number;
  features: string[];
  creditsPerDay: number;
  isPopular?: boolean;
  isEnterprise?: boolean;
  stripePriceId?: string;
}

export interface CheckoutSessionRequest {
  planId: string;
  userId: string;
  userEmail: string;
  userPhone?: string;
  currency: CurrencyCode;
  successUrl: string;
  cancelUrl: string;
  provider?: PaymentProviderId;
}

export interface DonationRequest {
  amount: number;
  userId?: string;
  userEmail?: string;
  userPhone?: string;
  currency: CurrencyCode;
  successUrl: string;
  cancelUrl: string;
  provider?: PaymentProviderId;
  amountMode?: 'fixed' | 'custom';
  tierId?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentSessionResponse {
  sessionId: string;
  url?: string;
  checkoutUrl?: string;
  provider?: PaymentProviderId;
  metadata?: any;
}

export interface BillingSessionResponse {
  sessionId: string;
  url: string;
}

export interface BillingVerificationResponse {
  success: boolean;
  planId?: string;
  amount?: number;
  message?: string;
}

export interface Plan extends SubscriptionPlan {
  name: string;
  description: string;
  price: number;
  currency: string;
}

export interface LocalizedPrice {
  amount: number;
  currency: CurrencyCode;
  formatted: string;
  isEstimated?: boolean;
}
