import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CreditCard, RefreshCcw, Clock, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { auth } from '../firebase';
import { getPlanById } from '../constants/plans';
import { AI_MODELS } from '../constants/aiModels';
import { formatPrice } from '../services/billing/pricingDisplayService';
import { cleanString, getPaymentSessionId, hasSuccessfulPaymentFlag, stripPaymentCallbackParams } from '../utils/validators';

type BillingHistoryEntry = {
  id: string;
  type: string;
  status: string;
  amount: number;
  currency: string;
  provider: string;
  planId?: string | null;
  toolId?: string | null;
  modelId?: string | null;
  donationAmountMode?: string | null;
  donationTierId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  verifiedAt?: string | null;
};

const Billing = () => {
  const { user, notify } = useAuth();
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [verifying, setVerifying] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [transactions, setTransactions] = useState<BillingHistoryEntry[]>([]);
  const [verificationStatus, setVerificationStatus] = useState<'success' | 'pending' | 'cancelled' | 'failed' | 'error' | null>(null);
  const [verificationMessage, setVerificationMessage] = useState('');
  const verifiedSessionsRef = React.useRef<Set<string>>(new Set());
  const unlockTool = cleanString(searchParams.get('unlockTool'));
  const unlockModel = cleanString(searchParams.get('unlockModel'));

  const unlockToolName = React.useMemo(() => {
    if (unlockTool === 'quiz') return 'Assessment Generator';
    if (unlockTool === 'analyze') return 'Analyze';
    if (unlockTool === 'infographic') return 'Infographic Generator';
    return '';
  }, [unlockTool]);

  const unlockModelName = React.useMemo(() => {
    if (!unlockModel) return '';
    return AI_MODELS.find((model) => model.id === unlockModel)?.name || unlockModel;
  }, [unlockModel]);

  const fetchHistory = useCallback(async () => {
    if (!user) {
      setTransactions([]);
      setHistoryLoading(false);
      return;
    }

    setHistoryLoading(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/billing/history', {
        headers: {
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(String(data?.error || 'Failed to fetch billing history'));
      }

      setTransactions(Array.isArray(data.transactions) ? data.transactions : []);
    } catch (error) {
      console.error('Billing history error:', error);
      notify.error(error instanceof Error ? error.message : 'Failed to fetch billing history.');
    } finally {
      setHistoryLoading(false);
    }
  }, [notify, user]);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    const sessionId = getPaymentSessionId(searchParams);
    const success = hasSuccessfulPaymentFlag(searchParams);
    const cancelled = searchParams.get('cancelled') === 'true';

    if (cancelled) {
      setVerificationStatus('cancelled');
      setVerificationMessage('Payment was cancelled. No changes were applied.');
      notify.info('Payment was cancelled. No changes were applied.');
      setSearchParams(stripPaymentCallbackParams(searchParams));
      return;
    }

    if (sessionId && (success || !cancelled)) {
      if (verifiedSessionsRef.current.has(sessionId)) return;
      void verifyPayment(sessionId);
    }
  }, [searchParams, notify, setSearchParams]);

  const verifyPayment = async (sessionId: string) => {
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
        body: JSON.stringify({ sessionId: normalizedSessionId }),
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
          notify.success(confirmationMessage || t('payment-verified-successfully'));
          await fetchHistory();
        } else if (paymentState === 'pending') {
          setVerificationStatus('pending');
          verifiedSessionsRef.current.delete(normalizedSessionId);
          notify.info(confirmationMessage || 'Payment is still processing. Please retry shortly.');
        } else if (paymentState === 'cancelled') {
          setVerificationStatus('cancelled');
          notify.info(confirmationMessage || 'Payment was cancelled. No changes were applied.');
        } else {
          setVerificationStatus('failed');
          notify.warning(confirmationMessage || 'Payment failed. No access was granted.');
        }

        setSearchParams(stripPaymentCallbackParams(searchParams));
      } else {
        setVerificationMessage(String(data.error || t('failed-to-verify-payment')));
        setVerificationStatus('error');
        notify.error(data.error || t('failed-to-verify-payment'));
      }
    } catch (error) {
      verifiedSessionsRef.current.delete(normalizedSessionId);
      console.error('Verification error:', error);
      setVerificationStatus('error');
      notify.error(error instanceof Error ? error.message : t('failed-to-verify-payment'));
    } finally {
      setVerifying(false);
    }
  };

  const currentPlan = getPlanById(user?.plan || 'free');

  const describeTransaction = React.useCallback((transaction: BillingHistoryEntry) => {
    if (transaction.type === 'subscription') {
      const plan = getPlanById(transaction.planId || 'free');
      return {
        title: `Subscription: ${t(plan.nameKey)}`,
        subtitle: transaction.verifiedAt ? `Activated ${new Date(transaction.verifiedAt).toLocaleString()}` : 'Subscription payment',
      };
    }

    if (transaction.type === 'tool_unlock') {
      return {
        title: `Tool unlock: ${transaction.toolId || 'selected tool'}`,
        subtitle: `Provider: ${transaction.provider || 'payment'}`,
      };
    }

    if (transaction.type === 'model_unlock') {
      return {
        title: `Model unlock: ${transaction.modelId || 'selected model'}`,
        subtitle: `Provider: ${transaction.provider || 'payment'}`,
      };
    }

    if (transaction.type === 'donation') {
      const amountModeLabel = transaction.donationAmountMode === 'fixed' ? 'Fixed amount' : 'Custom amount';
      return {
        title: 'Donation',
        subtitle: transaction.donationTierId
          ? `${amountModeLabel} • ${transaction.donationTierId}`
          : amountModeLabel,
      };
    }

    return {
      title: transaction.type || 'Payment',
      subtitle: transaction.provider || 'Billing event',
    };
  }, [t]);

  const renderStatusBadge = (status: string) => {
    const normalizedStatus = String(status || '').toLowerCase();
    const classes =
      normalizedStatus === 'paid'
        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
        : normalizedStatus === 'pending'
          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
          : normalizedStatus === 'cancelled'
            ? 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300'
            : 'bg-amber-500/10 text-amber-700 dark:text-amber-400';

    return (
      <span className={`inline-flex items-center rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${classes}`}>
        {normalizedStatus}
      </span>
    );
  };

  return (
    <div className="max-w-7xl mx-auto space-y-12 pb-12 px-4">
      <div className="text-center space-y-4 pt-8">
        <AnimatePresence>
          {verifying && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-8 p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center gap-3 text-blue-600 dark:text-blue-400"
            >
              <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              <span className="font-bold">{t('verifying-your-payment')}</span>
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
                <h3 className="text-xl font-bold">{t('payment-successful')}</h3>
                <p className="text-sm opacity-80">{verificationMessage || t('your-account-has-been-updated')}</p>
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
              <Clock className="w-12 h-12" />
              <div className="text-center">
                <h3 className="text-xl font-bold">Payment pending</h3>
                <p className="text-sm opacity-80">{verificationMessage || 'Payment is still processing. Please retry shortly.'}</p>
              </div>
              <button
                onClick={() => setVerificationStatus(null)}
                className="mt-2 text-sm font-bold hover:underline"
              >
                {t('dismiss')}
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
                <h3 className="text-xl font-bold">Payment cancelled</h3>
                <p className="text-sm opacity-80">{verificationMessage || 'Payment was cancelled. No changes were applied.'}</p>
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
              <AlertCircle className="w-12 h-12" />
              <div className="text-center">
                <h3 className="text-xl font-bold">Payment not completed</h3>
                <p className="text-sm opacity-80">{verificationMessage || 'Payment failed. No access was granted.'}</p>
              </div>
              <button
                onClick={() => setVerificationStatus(null)}
                className="mt-2 text-sm font-bold hover:underline"
              >
                {t('dismiss')}
              </button>
            </motion.div>
          )}

          {verificationStatus === 'success' && unlockToolName && (
            <motion.div
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="mb-8 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
            >
              <p className="text-sm font-bold">
                Tool unlock confirmed: {unlockToolName} is now available on your account.
              </p>
            </motion.div>
          )}

          {verificationStatus === 'success' && unlockModelName && (
            <motion.div
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="mb-8 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
            >
              <p className="text-sm font-bold">
                Model unlock confirmed: {unlockModelName} is now available on your account.
              </p>
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
                <h3 className="text-xl font-bold">{t('payment-verification-failed')}</h3>
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

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl sm:text-5xl font-black tracking-tight text-zinc-900 dark:text-white"
        >
          {t('billing-and-subscriptions')}
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-lg text-zinc-500 max-w-2xl mx-auto"
        >
          {t('billing-description')}
        </motion.p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-1 space-y-6"
        >
          <div className={`p-8 rounded-3xl border ${currentPlan.id === 'pro' ? 'border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/10' : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50'}`}>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">{t('current-plan')}</h2>
            <div className="flex items-baseline gap-2 mb-6">
              <span className={`text-4xl font-black ${currentPlan.id === 'pro' ? 'text-amber-600 dark:text-amber-500' : 'text-zinc-900 dark:text-white'}`}>
                {t(currentPlan.nameKey)}
              </span>
              <span className="text-sm text-zinc-500">
                {currentPlan.basePriceUSD === 0
                  ? `/ ${t('forever')}`
                  : `/ ${formatPrice(currentPlan.basePriceUSD, 'USD')}/${t('per-month')}`}
              </span>
            </div>
            <ul className="space-y-3 mb-8">
              {currentPlan.features.slice(0, 3).map((feature, idx) => (
                <li key={idx} className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" /> {t(feature)}
                </li>
              ))}
            </ul>
            <Link
              to="/pricing"
              className="block w-full py-3 px-4 bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-100 text-white dark:text-zinc-900 font-bold rounded-xl transition-colors text-center"
            >
              {t('change-plan')}
            </Link>
            {currentPlan.id !== 'free' && (
              <p className="text-xs text-zinc-500 text-center mt-4">
                Renewal timing is managed by the payment provider and appears in your verified billing history after confirmation.
              </p>
            )}
          </div>

          <div className="p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-zinc-900 dark:text-white">{t('payment-method')}</h3>
            </div>
            <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
              <p className="text-sm text-zinc-500 italic">
                {t('payment-method-managed-by-provider')}
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="lg:col-span-2 p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50"
        >
          <div className="flex items-center justify-between mb-8 gap-4">
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">{t('billing-history')}</h2>
            <button
              type="button"
              onClick={() => void fetchHistory()}
              disabled={historyLoading}
              className="text-sm font-bold text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCcw className={`w-4 h-4 ${historyLoading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>

          {historyLoading ? (
            <div className="flex items-center justify-center py-16 text-zinc-500">
              <RefreshCcw className="w-5 h-5 animate-spin mr-3" />
              Loading billing history...
            </div>
          ) : transactions.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800 p-8 text-center text-zinc-500">
              No real billing records yet. Completed subscriptions, unlock payments, and donations will appear here after backend verification.
            </div>
          ) : (
            <div className="space-y-4">
              {transactions.map((transaction) => {
                const description = describeTransaction(transaction);
                const transactionDate = transaction.createdAt || transaction.updatedAt || null;

                return (
                  <div key={transaction.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800/50 hover:border-zinc-200 dark:hover:border-zinc-700 transition-colors">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                        {transaction.status === 'paid' ? <CheckCircle2 className="w-5 h-5" /> : <CreditCard className="w-5 h-5" />}
                      </div>
                      <div className="space-y-1">
                        <p className="font-bold text-zinc-900 dark:text-white">{description.title}</p>
                        <p className="text-sm text-zinc-500">{description.subtitle}</p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                          <span>{transactionDate ? new Date(transactionDate).toLocaleString() : 'No timestamp'}</span>
                          <span>•</span>
                          <span className="font-mono">{transaction.id}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-start sm:items-end gap-2">
                      <span className="font-bold text-zinc-900 dark:text-white">
                        {formatPrice(Number(transaction.amount || 0), (transaction.currency || 'EGP') as any)}
                      </span>
                      {renderStatusBadge(transaction.status)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-8 p-4 rounded-2xl bg-blue-500/5 border border-blue-500/20 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                {t('billing-help-notice')} <a href="mailto:support@zootopiaclub.com" className="text-blue-600 dark:text-blue-400 font-bold hover:underline">support@zootopiaclub.com</a>
              </p>
              <p className="text-xs text-zinc-500 italic">
                {t('refundPolicyNotice')}
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Billing;
