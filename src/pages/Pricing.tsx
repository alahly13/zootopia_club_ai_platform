import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Check, Star, Zap, Shield, Crown, Globe, Info, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { useSearchParams } from 'react-router-dom';
import { auth } from '../firebase';
import { SUBSCRIPTION_PLANS } from '../constants/plans';
import { getLocalizedPrice, resolveUserCurrency } from '../services/billing/pricingDisplayService';
import { CurrencyCode } from '../types/billing';
import { buildAppUrl } from '../config/runtime';

const Pricing = () => {
  const { t } = useTranslation();
  const { user, notify } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyCode>(resolveUserCurrency());
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('cancelled') === 'true') {
      notify.info(t('subscription-cancelled'));
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('cancelled');
      setSearchParams(newParams);
    }
  }, [searchParams]);

  const handleSubscribe = async (planId: string) => {
    if (!user) {
      notify.error(t('please-log-in-to-subscribe'));
      return;
    }

    if (planId === 'enterprise') {
      notify.info(t('please-contact-support-for-this-plan'));
      return;
    }

    if (user.plan === planId) {
      notify.success(t('you-are-already-on-this-plan'));
      return;
    }

    setLoading(planId);
    try {
      const idToken = await auth.currentUser?.getIdToken();

      const response = await fetch('/api/billing/create-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          planId,
          userId: user.id,
          userEmail: user.email,
          currency: selectedCurrency,
          successUrl: buildAppUrl('/billing?success=true'),
          cancelUrl: buildAppUrl('/pricing?cancelled=true'),
        }),
      });

      const data = await response.json();
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        throw new Error(data.error || t('failed-to-initiate-subscription'));
      }
    } catch (error: any) {
      console.error('Subscription error:', error);
      notify.error(error.message || t('failed-to-initiate-subscription'));
    } finally {
      setLoading(null);
    }
  };

  const getPlanIcon = (planId: string) => {
    switch (planId) {
      case 'free': return <Zap className="w-6 h-6 text-zinc-400" />;
      case 'starter': return <Star className="w-6 h-6 text-emerald-500" />;
      case 'plus': return <Shield className="w-6 h-6 text-indigo-500" />;
      case 'pro': return <Crown className="w-6 h-6 text-amber-500" />;
      case 'enterprise': return <Globe className="w-6 h-6 text-blue-500" />;
      default: return <Zap className="w-6 h-6" />;
    }
  };

  return (
    <div className="bg-zinc-50 dark:bg-zinc-950 px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <motion.h1 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl font-bold text-zinc-900 dark:text-white mb-4"
          >
            {t('plansPricing')}
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto"
          >
            {t('ultimatePlatform')}
          </motion.p>

          {/* Currency Selector */}
          <div className="mt-8 flex items-center justify-center gap-4">
            <span className="text-sm font-medium text-zinc-500 dark:text-zinc-500 flex items-center gap-2">
              <Globe className="w-4 h-4" />
              {t('choose-currency')}:
            </span>
            <select
              value={selectedCurrency}
              onChange={(e) => setSelectedCurrency(e.target.value as CurrencyCode)}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="USD">USD ($)</option>
              <option value="EGP">EGP (ج.م)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
          {SUBSCRIPTION_PLANS.map((plan, index) => {
            const localizedPrice = getLocalizedPrice(plan.basePriceUSD, selectedCurrency);
            const isCurrentPlan = user?.plan === plan.id;

            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`relative flex flex-col p-6 rounded-2xl border transition-all duration-300 ${
                  plan.isPopular 
                    ? 'bg-white dark:bg-zinc-900 border-emerald-500 shadow-xl scale-105 z-10' 
                    : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                }`}
              >
                {plan.isPopular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                    Most Popular
                  </div>
                )}

                <div className="flex items-center gap-3 mb-4">
                  {getPlanIcon(plan.id)}
                  <h3 className="text-xl font-bold text-zinc-900 dark:text-white">
                    {t(plan.nameKey)}
                  </h3>
                </div>

                <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6 min-h-10">
                  {t(plan.descriptionKey)}
                </p>

                <div className="mb-6">
                  {plan.isEnterprise ? (
                    <span className="text-3xl font-bold text-zinc-900 dark:text-white">
                      {t('contact-sales')}
                    </span>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold text-zinc-900 dark:text-white">
                          {localizedPrice.formatted}
                        </span>
                        <span className="text-zinc-500 dark:text-zinc-500 text-sm">
                          /{t('per-month')}
                        </span>
                      </div>
                      {localizedPrice.isEstimated && (
                        <div className="mt-1 flex items-center gap-1 text-[10px] text-zinc-400 uppercase tracking-tighter">
                          <Info className="w-3 h-3" />
                          {t('estimated-price')}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <ul className="flex-1 space-y-3 mb-8">
                  {plan.features.map((feature, fIndex) => (
                    <li key={fIndex} className="flex items-start gap-3 text-sm text-zinc-600 dark:text-zinc-400">
                      <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                      <span>{t(feature)}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSubscribe(plan.id)}
                  disabled={isCurrentPlan || loading !== null}
                  className={`w-full py-3 px-4 rounded-xl font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
                    isCurrentPlan
                      ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-default'
                      : plan.isPopular
                        ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20'
                        : 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:opacity-90'
                  }`}
                >
                  {loading === plan.id ? (
                    <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : isCurrentPlan ? (
                    t('current-plan')
                  ) : (
                    <>
                      {t('select-plan')}
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </motion.div>
            );
          })}
        </div>

        {/* Credits Info */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-16 p-8 rounded-3xl bg-linear-to-br from-emerald-500/5 to-indigo-500/5 border border-zinc-200 dark:border-zinc-800 text-center"
        >
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4">
            {t('yourCredits')}
          </h2>
          <div className="flex items-center justify-center gap-8">
            <div className="text-center">
              <div className="text-4xl font-bold text-emerald-500 mb-1">
                {user?.credits || 0}
              </div>
              <div className="text-sm text-zinc-500 uppercase tracking-widest">
                {t('currentBalance')}
              </div>
            </div>
            <div className="h-12 w-px bg-zinc-200 dark:bg-zinc-800" />
            <div className="text-left max-w-md">
              <p className="text-zinc-600 dark:text-zinc-400 text-sm leading-relaxed">
                {t('creditRequestNotice')}
              </p>
              <p className="text-zinc-500 dark:text-zinc-500 text-xs mt-2 italic">
                {t('refundPolicyNotice')}
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Pricing;
