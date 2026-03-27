import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Coffee, Gift, ArrowRight, ShieldCheck, Info, CheckCircle2, XCircle } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { auth } from '../firebase';
import { formatPrice } from '../services/billing/pricingDisplayService';
import { cleanString, getPaymentSessionId, hasSuccessfulPaymentFlag, stripPaymentCallbackParams } from '../utils/validators';

const DONATION_CURRENCY = 'EGP' as const;
const DONATION_CONTEXT_STORAGE_KEY = 'zootopia_donation_payment_context';
const RECEIPT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const DONATION_TIERS = [
  { id: 'coffee', icon: <Coffee className="w-6 h-6" />, amount: 250, labelKey: 'buy-us-a-coffee', descKey: 'coffee-desc' },
  { id: 'sponsor', icon: <Gift className="w-6 h-6" />, amount: 750, labelKey: 'sponsor-a-student', descKey: 'sponsor-desc' },
  { id: 'server', icon: <ShieldCheck className="w-6 h-6" />, amount: 2500, labelKey: 'server-supporter', descKey: 'server-desc' },
] as const;

type DonationPaymentContext = {
  sessionId: string;
  verificationToken: string;
  amount: number;
  amountMode: 'fixed' | 'custom';
  tierId?: string;
  createdAt: string;
};

const parseDonationAmount = (value: string): number | null => {
  const normalized = value.replace(/,/g, '.').trim();
  if (!normalized || !/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
};

const readDonationPaymentContext = (): DonationPaymentContext | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(DONATION_CONTEXT_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as DonationPaymentContext;
  } catch {
    return null;
  }
};

const writeDonationPaymentContext = (context: DonationPaymentContext) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(DONATION_CONTEXT_STORAGE_KEY, JSON.stringify(context));
};

const clearDonationPaymentContext = () => {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.removeItem(DONATION_CONTEXT_STORAGE_KEY);
};

const Donation = () => {
  const { user, notify } = useAuth();
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [customAmount, setCustomAmount] = useState('');
  const [receiptEmail, setReceiptEmail] = useState(user?.email || '');
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<'success' | 'pending' | 'cancelled' | 'failed' | 'error' | null>(null);
  const [verificationMessage, setVerificationMessage] = useState('');
  const verifiedSessionsRef = React.useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!receiptEmail && user?.email) {
      setReceiptEmail(user.email);
    }
  }, [receiptEmail, user?.email]);

  const verifyPayment = async (sessionId: string, verificationToken?: string | null) => {
    const normalizedSessionId = cleanString(sessionId);
    if (!normalizedSessionId || verifiedSessionsRef.current.has(normalizedSessionId)) {
      return;
    }

    verifiedSessionsRef.current.add(normalizedSessionId);
    setVerifying(true);

    try {
      const idToken = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/billing/verify-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        /**
         * Backend verification remains authoritative for donations. Anonymous
         * donors do not get a frontend-only success path; they use the short-
         * lived verification token issued by the server at checkout creation.
         */
        body: JSON.stringify({
          sessionId: normalizedSessionId,
          verificationToken: verificationToken || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(String(data?.error || `Verification request failed with status ${response.status}`));
      }

      if (data.success) {
        const paymentState = String(data.paymentState || data.status || '').toLowerCase();
        const confirmationMessage = String(data?.confirmation?.message || '');
        setVerificationMessage(confirmationMessage);

        if (paymentState === 'success') {
          setVerificationStatus('success');
          notify.success(confirmationMessage || t('donation-verified-successfully'));
        } else if (paymentState === 'pending') {
          setVerificationStatus('pending');
          verifiedSessionsRef.current.delete(normalizedSessionId);
          notify.info(confirmationMessage || 'Donation is still processing. Please retry shortly.');
        } else if (paymentState === 'cancelled') {
          setVerificationStatus('cancelled');
          notify.info(confirmationMessage || 'Donation was cancelled. No charge was applied.');
        } else {
          setVerificationStatus('failed');
          notify.warning(confirmationMessage || 'Donation was not completed. No charge was applied.');
        }

        if (paymentState !== 'pending') {
          clearDonationPaymentContext();
        }

        setSearchParams(stripPaymentCallbackParams(searchParams));
      } else {
        setVerificationMessage(String(data.error || t('failed-to-verify-donation')));
        setVerificationStatus('error');
        notify.error(data.error || t('failed-to-verify-donation'));
      }
    } catch (error) {
      verifiedSessionsRef.current.delete(normalizedSessionId);
      console.error('Verification error:', error);
      setVerificationStatus('error');
      notify.error(error instanceof Error ? error.message : t('failed-to-verify-donation'));
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    const paymentContext = readDonationPaymentContext();
    const callbackSessionId = getPaymentSessionId(searchParams);
    const success = hasSuccessfulPaymentFlag(searchParams);
    const cancelled = searchParams.get('cancelled') === 'true';
    const sessionId = callbackSessionId || ((success || cancelled) ? paymentContext?.sessionId || null : null);

    if (cancelled) {
      setVerificationStatus('cancelled');
      setVerificationMessage('Donation was cancelled. No charge was applied.');
      notify.info('Donation was cancelled. No charge was applied.');
      clearDonationPaymentContext();
      setSearchParams(stripPaymentCallbackParams(searchParams));
      return;
    }

    if (sessionId && (success || Boolean(callbackSessionId))) {
      void verifyPayment(sessionId, paymentContext?.verificationToken || null);
    }
  }, [searchParams, notify, setSearchParams]);

  const handleDonate = async (params: {
    amount: number;
    amountMode: 'fixed' | 'custom';
    tierId?: string;
    loadingKey: string;
  }) => {
    const normalizedEmail = receiptEmail.trim().toLowerCase();
    if (normalizedEmail && !RECEIPT_EMAIL_PATTERN.test(normalizedEmail)) {
      notify.error('Please enter a valid receipt email or leave it blank.');
      return;
    }

    const amount = Number(params.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      notify.error(t('please-enter-a-valid-amount'));
      return;
    }

    setIsLoading(params.loadingKey);

    try {
      const idToken = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/billing/create-donation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        /**
         * Fixed and custom donations intentionally converge into one backend
         * route so the stored transaction shape, Paymob session creation, and
         * later verification logic cannot drift apart.
         */
        body: JSON.stringify({
          amount,
          userId: user?.id || null,
          userEmail: user?.email || null,
          receiptEmail: normalizedEmail || null,
          currency: DONATION_CURRENCY,
          amountMode: params.amountMode,
          tierId: params.tierId || null,
          successUrl: `${window.location.origin}/donation?success=true`,
          cancelUrl: `${window.location.origin}/donation?cancelled=true`,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.checkoutUrl || !data.sessionId || !data.verificationToken) {
        throw new Error(String(data?.error || t('failed-to-initiate-donation')));
      }

      writeDonationPaymentContext({
        sessionId: String(data.sessionId),
        verificationToken: String(data.verificationToken),
        amount,
        amountMode: params.amountMode,
        tierId: params.tierId,
        createdAt: new Date().toISOString(),
      });

      window.location.assign(String(data.checkoutUrl));
    } catch (error) {
      console.error('Donation error:', error);
      notify.error(error instanceof Error ? error.message : t('failed-to-initiate-donation'));
    } finally {
      setIsLoading(null);
    }
  };

  const parsedCustomAmount = parseDonationAmount(customAmount);

  return (
    <div className="max-w-4xl mx-auto space-y-12 pb-12 px-4">
      <div className="text-center space-y-6 pt-8">
        <AnimatePresence>
          {verifying && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-8 p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center gap-3 text-blue-600 dark:text-blue-400"
            >
              <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              <span className="font-bold">{t('verifying-your-donation')}</span>
            </motion.div>
          )}

          {verificationStatus === 'success' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="mb-8 p-6 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 flex flex-col items-center gap-3 text-emerald-600 dark:text-emerald-400"
            >
              <CheckCircle2 className="w-12 h-12" />
              <div className="text-center">
                <h3 className="text-xl font-bold">{t('donation-successful')}</h3>
                <p className="text-sm opacity-80">{verificationMessage || t('thank-you-for-your-generous-support')}</p>
              </div>
              <button
                onClick={() => setVerificationStatus(null)}
                className="mt-2 text-sm font-bold hover:underline"
              >
                {t('dismiss')}
              </button>
            </motion.div>
          )}

          {verificationStatus === 'pending' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="mb-8 p-6 rounded-3xl bg-blue-500/10 border border-blue-500/20 flex flex-col items-center gap-3 text-blue-600 dark:text-blue-400"
            >
              <Info className="w-12 h-12" />
              <div className="text-center">
                <h3 className="text-xl font-bold">Donation pending</h3>
                <p className="text-sm opacity-80">{verificationMessage || 'Donation is still processing. Please retry shortly.'}</p>
              </div>
              <button
                onClick={() => {
                  const paymentContext = readDonationPaymentContext();
                  if (paymentContext?.sessionId) {
                    void verifyPayment(paymentContext.sessionId, paymentContext.verificationToken);
                  }
                }}
                className="mt-2 text-sm font-bold hover:underline"
              >
                Check again
              </button>
            </motion.div>
          )}

          {verificationStatus === 'cancelled' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="mb-8 p-6 rounded-3xl bg-zinc-500/10 border border-zinc-500/20 flex flex-col items-center gap-3 text-zinc-600 dark:text-zinc-300"
            >
              <XCircle className="w-12 h-12" />
              <div className="text-center">
                <h3 className="text-xl font-bold">Donation cancelled</h3>
                <p className="text-sm opacity-80">{verificationMessage || 'Donation was cancelled. No charge was applied.'}</p>
              </div>
              <button
                onClick={() => setVerificationStatus(null)}
                className="mt-2 text-sm font-bold hover:underline"
              >
                {t('dismiss')}
              </button>
            </motion.div>
          )}

          {verificationStatus === 'failed' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="mb-8 p-6 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex flex-col items-center gap-3 text-amber-700 dark:text-amber-400"
            >
              <XCircle className="w-12 h-12" />
              <div className="text-center">
                <h3 className="text-xl font-bold">Donation not completed</h3>
                <p className="text-sm opacity-80">{verificationMessage || 'Donation was not completed. No charge was applied.'}</p>
              </div>
              <button
                onClick={() => setVerificationStatus(null)}
                className="mt-2 text-sm font-bold hover:underline"
              >
                {t('dismiss')}
              </button>
            </motion.div>
          )}

          {verificationStatus === 'error' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="mb-8 p-6 rounded-3xl bg-rose-500/10 border border-rose-500/20 flex flex-col items-center gap-3 text-rose-600 dark:text-rose-400"
            >
              <XCircle className="w-12 h-12" />
              <div className="text-center">
                <h3 className="text-xl font-bold">{t('donation-verification-failed')}</h3>
                <p className="text-sm opacity-80">{verificationMessage || t('please-contact-support-if-this-persists')}</p>
              </div>
              <button
                onClick={() => setVerificationStatus(null)}
                className="mt-2 text-sm font-bold hover:underline"
              >
                {t('dismiss')}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="w-20 h-20 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto text-rose-500 mb-6"
        >
          <Heart className="w-10 h-10" />
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl sm:text-5xl font-black tracking-tight text-zinc-900 dark:text-white"
        >
          {t('support-zootopia')}
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-lg text-zinc-500 max-w-2xl mx-auto"
        >
          {t('donation-description')}
        </motion.p>
      </div>

      <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-6 sm:p-8 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Donation Checkout</h3>
            <p className="text-sm text-zinc-500">
              Fixed and custom donations share one authoritative backend flow so the UI amount, Paymob checkout amount, and verified transaction amount stay aligned.
            </p>
          </div>
          <span className="inline-flex items-center justify-center rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
            Paymob • {DONATION_CURRENCY}
          </span>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-black uppercase tracking-widest text-zinc-500">Receipt Email</label>
          <input
            type="email"
            value={receiptEmail}
            onChange={(event) => setReceiptEmail(event.target.value)}
            placeholder="Optional for anonymous donations"
            className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-3 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-rose-500"
          />
          <p className="text-xs text-zinc-500">
            We send confirmation only after the backend verifies the final Paymob payment state.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {DONATION_TIERS.map((tier, index) => (
          <motion.div
            key={tier.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 + 0.2 }}
            className="p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 flex flex-col items-center text-center hover:border-rose-500/50 transition-colors cursor-pointer group"
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center text-rose-500 mb-4 group-hover:scale-110 transition-transform">
              {tier.icon}
            </div>
            <h3 className="text-2xl font-black text-zinc-900 dark:text-white mb-1">
              {formatPrice(tier.amount, DONATION_CURRENCY)}
            </h3>
            <div className="flex items-center gap-1 text-[10px] text-zinc-400 uppercase tracking-tighter mb-2">
              <Info className="w-3 h-3" />
              Fixed amount
            </div>
            <p className="font-bold text-zinc-700 dark:text-zinc-300 mb-2">{t(tier.labelKey)}</p>
            <p className="text-sm text-zinc-500 mb-6 flex-1">{t(tier.descKey)}</p>
            <button
              onClick={() => handleDonate({ amount: tier.amount, amountMode: 'fixed', tierId: tier.id, loadingKey: tier.id })}
              disabled={isLoading !== null}
              className={`w-full py-2 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 font-bold ${
                isLoading === tier.id
                  ? 'bg-rose-500 text-white opacity-70 cursor-not-allowed'
                  : 'bg-zinc-100 dark:bg-zinc-800 hover:bg-rose-500 hover:text-white text-zinc-900 dark:text-white'
              }`}
            >
              {isLoading === tier.id ? (
                <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  {t('donate')}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </motion.div>
        ))}
      </div>

      <div className="p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-center space-y-6">
        <h3 className="text-2xl font-bold text-zinc-900 dark:text-white">{t('custom-amount')}</h3>
        <p className="text-zinc-500">{t('custom-donation-desc')}</p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 max-w-md mx-auto">
          <div className="relative flex-1 w-full">
            <span className="absolute inset-s-4 top-1/2 -translate-y-1/2 text-zinc-500 font-bold">
              {DONATION_CURRENCY}
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={customAmount}
              onChange={(event) => setCustomAmount(event.target.value)}
              placeholder="0.00"
              className="w-full ps-16 pe-4 py-3 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none text-zinc-900 dark:text-white font-bold"
            />
          </div>
          <button
            onClick={() => parsedCustomAmount && handleDonate({ amount: parsedCustomAmount, amountMode: 'custom', loadingKey: 'custom' })}
            disabled={isLoading !== null || parsedCustomAmount === null}
            className="w-full sm:w-auto px-8 py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl transition-colors shadow-lg shadow-rose-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading === 'custom' ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
            ) : (
              t('donate')
            )}
          </button>
        </div>
        <p className="text-xs text-zinc-500">
          Custom donations must be positive and use at most two decimal places.
        </p>
      </div>

      <div className="text-center text-sm text-zinc-500 space-y-2">
        <p>Donations are processed securely through Paymob and confirmed only after backend verification.</p>
        <p className="italic">{t('refundPolicyNotice')}</p>
      </div>
    </div>
  );
};

export default Donation;
