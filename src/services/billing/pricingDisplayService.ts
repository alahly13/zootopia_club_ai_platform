/**
 * Zootopia Club Pricing Display Service
 * (c) 2026 Zootopia Club
 */

import { CurrencyCode, LocalizedPrice } from '../../types/billing';

// Mock exchange rates (USD to other currencies)
// In a real app, this would be fetched from an API or updated daily
const EXCHANGE_RATES: Record<CurrencyCode, number> = {
  USD: 1,
  EGP: 50.0, // Example rate for 2026
  EUR: 0.92,
  GBP: 0.79,
  SAR: 3.75,
  AED: 3.67,
};

// Mock currency symbols
const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  USD: '$',
  EGP: 'EGP',
  EUR: '€',
  GBP: '£',
  SAR: 'SR',
  AED: 'AED',
};

/**
 * Resolves the user's currency based on their locale or browser settings.
 * Fallback to EGP for Egyptian users, or USD as a global default.
 */
export const resolveUserCurrency = (): CurrencyCode => {
  try {
    const locale = navigator.language || 'en-US';
    if (locale.includes('ar-EG') || locale.includes('en-EG')) {
      return 'EGP';
    }
    // Add more logic here if needed (e.g., based on user profile)
    return 'USD';
  } catch (error) {
    return 'USD';
  }
};

/**
 * Calculates the localized price for a given USD amount.
 */
export const getLocalizedPrice = (amountUSD: number, targetCurrency?: CurrencyCode): LocalizedPrice => {
  const currency = targetCurrency || resolveUserCurrency();
  const rate = EXCHANGE_RATES[currency] || 1;
  const amount = amountUSD * rate;
  const isEstimated = currency !== 'USD'; // USD is our canonical currency

  const formatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });

  return {
    amount,
    currency,
    isEstimated,
    formatted: formatter.format(amount),
  };
};

/**
 * Formats a given amount and currency.
 */
export const formatPrice = (amount: number, currency: CurrencyCode): string => {
  const formatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return formatter.format(amount);
};
