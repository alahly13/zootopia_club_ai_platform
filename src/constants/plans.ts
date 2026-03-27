/**
 * Zootopia Club Subscription Plans
 * (c) 2026 Zootopia Club
 */

import { SubscriptionPlan } from '../types/billing';

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'free',
    nameKey: 'plan-free-name',
    descriptionKey: 'plan-free-description',
    basePriceUSD: 0,
    features: [
      'feature-basic-ai-access',
      'feature-limited-credits',
      'feature-community-support'
    ],
    creditsPerDay: 5,
  },
  {
    id: 'starter',
    nameKey: 'plan-starter-name',
    descriptionKey: 'plan-starter-description',
    basePriceUSD: 1,
    features: [
      'feature-standard-ai-access',
      'feature-increased-credits',
      'feature-email-support',
      'feature-no-ads'
    ],
    creditsPerDay: 15,
    isPopular: false,
  },
  {
    id: 'plus',
    nameKey: 'plan-plus-name',
    descriptionKey: 'plan-plus-description',
    basePriceUSD: 3,
    features: [
      'feature-advanced-ai-access',
      'feature-high-credits',
      'feature-priority-support',
      'feature-custom-tools'
    ],
    creditsPerDay: 50,
    isPopular: true,
  },
  {
    id: 'pro',
    nameKey: 'plan-pro-name',
    descriptionKey: 'plan-pro-description',
    basePriceUSD: 21,
    features: [
      'feature-premium-ai-access',
      'feature-unlimited-credits',
      'feature-dedicated-support',
      'feature-early-access-features',
      'feature-api-access'
    ],
    creditsPerDay: 200,
    isPopular: false,
  },
  {
    id: 'enterprise',
    nameKey: 'plan-enterprise-name',
    descriptionKey: 'plan-enterprise-description',
    basePriceUSD: 0, // Custom pricing
    features: [
      'feature-custom-ai-solutions',
      'feature-unlimited-everything',
      'feature-white-labeling',
      'feature-dedicated-account-manager'
    ],
    creditsPerDay: 999999,
    isEnterprise: true,
  }
];

export const getPlanById = (id: string) => SUBSCRIPTION_PLANS.find(p => p.id === id) || SUBSCRIPTION_PLANS[0];
