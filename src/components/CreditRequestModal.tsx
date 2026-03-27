import * as React from 'react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../auth/AuthContext';
import { Coins, Send, X, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '../utils';
import { useLanguage } from '../contexts/LanguageContext';
import { useStatus } from '../hooks/useStatus';
import { StatusIndicator } from './status/StatusIndicator';
import { StatusCard } from './status/StatusCard';
import { auth } from '../firebase';

interface CreditRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  isSidebarCollapsed?: boolean;
}

const CreditRequestModal: React.FC<CreditRequestModalProps> = ({ isOpen, onClose, isSidebarCollapsed = false }) => {
  const { user, submitRequest, isAdmin, updateUser, notify } = useAuth();
  const { t } = useLanguage();
  const [amount, setAmount] = useState<number>(3);
  const [message, setMessage] = useState('');
  const [giftCode, setGiftCode] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);
  const { status, message: statusMessage, error, setStatus, setError, isLoading, isSuccess, isError, reset } = useStatus();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('processing', t('submittingYourRequest'));
    try {
      await submitRequest('Credit Request', message || `Requesting ${amount} AI credits for educational purposes.`, amount);
      setStatus('success', t('requestSubmittedSuccessfully'));
      setTimeout(() => {
        reset();
        onClose();
      }, 3000);
    } catch (err: any) {
      console.error(err);
      setError(err, () => handleSubmit({ preventDefault: () => {} } as any));
    }
  };

  const mapGiftRedeemError = (errorCode: string): string => {
    switch (errorCode) {
      case 'gift-code-invalid':
        return 'Gift code not found. Check the code and try again.';
      case 'gift-code-expired':
        return 'This gift code is expired.';
      case 'gift-code-fully-redeemed':
        return 'This gift code has reached its redemption limit.';
      case 'gift-code-already-used-by-user':
        return 'You already redeemed this gift code.';
      case 'gift-code-inactive':
        return 'This gift code is inactive.';
      case 'gift-code-type-mismatch':
        return 'This code is not a gift-credit code.';
      default:
        return 'Failed to redeem gift code. Please try again.';
    }
  };

  const handleRedeemGiftCode = async () => {
    const normalizedCode = giftCode.trim().toUpperCase();
    if (!normalizedCode) {
      notify.error('Please enter a gift code.');
      return;
    }

    try {
      setIsRedeeming(true);
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        notify.error('Please sign in again to redeem this code.');
        return;
      }

      const response = await fetch('/api/credits/redeem-gift-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code: normalizedCode }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(String(payload?.error || 'gift-code-redeem-failed'));
      }

      const amountGranted = Number(payload?.amount || 0);
      const creditsAfter = Number(payload?.creditsAfter);
      if (user?.id && Number.isFinite(creditsAfter)) {
        await updateUser(user.id, { credits: creditsAfter });
      }

      setGiftCode('');
      notify.success(
        amountGranted > 0
          ? `Gift code redeemed successfully. +${amountGranted} credits added.`
          : 'Gift code already redeemed.'
      );
    } catch (err: any) {
      notify.error(mapGiftRedeemError(String(err?.message || '')));
    } finally {
      setIsRedeeming(false);
    }
  };

  const creditOptions = [3, 6, 9, 12, 15, 18, 21];

  const modalContent = (
    <div className={cn("fixed inset-0 z-100 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200", isSidebarCollapsed ? "md:ps-20" : "md:ps-64")}> 
      <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden animate-in zoom-in-95 duration-200">
        {isSuccess ? (
          <div className="p-12 text-center space-y-4">
            <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="text-emerald-500" size={40} />
            </div>
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">{t('requestSent')}</h2>
            <p className="text-zinc-500 dark:text-zinc-400">
              {t('requestSentDesc', { amount })}
            </p>
          </div>
        ) : (
          <>
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-800/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center">
                  <Coins className="text-amber-500" size={20} />
                </div>
                <div>
                  <h2 className="font-bold text-zinc-900 dark:text-white">{t('requestCreditsTitle')}</h2>
                  <p className="text-xs text-zinc-500">{t('currentBalance')}: {isAdmin ? '∞' : user?.credits || 0} {t('credits')}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusIndicator status={status} message={statusMessage} />
                <button 
                  onClick={onClose}
                  className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition-colors text-zinc-500"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {isError && (
                <StatusCard 
                  status={status}
                  title={t('submissionError')}
                  message={error?.message}
                  onRetry={error?.retryAction}
                  onDismiss={reset}
                />
              )}
              <div className="space-y-3">
                <label className="text-sm font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                  {t('selectAmount')}
                  <span className="text-[10px] font-normal text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full uppercase tracking-wider">
                    {t('multiplesOf3')}
                  </span>
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {creditOptions.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setAmount(opt)}
                      className={cn(
                        "py-2.5 rounded-xl text-sm font-bold transition-all border",
                        amount === opt 
                          ? "bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-900/20" 
                          : "bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-emerald-500"
                      )}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
                  Redeem Gift Code
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={giftCode}
                    onChange={(e) => setGiftCode(e.target.value)}
                    placeholder="Enter gift code"
                    className="flex-1 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl px-4 py-3 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 transition-all"
                    disabled={isRedeeming}
                  />
                  <button
                    type="button"
                    onClick={handleRedeemGiftCode}
                    disabled={isRedeeming}
                    className="px-4 py-3 bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 text-white text-sm font-bold rounded-2xl transition-all"
                  >
                    {isRedeeming ? <Loader2 size={16} className="animate-spin" /> : 'Redeem'}
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
                  {t('noteToAdmin')}
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t('notePlaceholder')}
                  className="w-full h-24 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl px-4 py-3 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 transition-all resize-none"
                />
              </div>

              <div className="bg-amber-500/5 border border-amber-500/10 p-4 rounded-2xl flex gap-3">
                <AlertCircle className="text-amber-500 shrink-0" size={18} />
                <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-400/80">
                  {t('creditRequestNotice')}
                </p>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 text-white rounded-2xl font-bold transition-all shadow-xl shadow-emerald-900/20 flex items-center justify-center gap-2 group cursor-pointer"
              >
                {isLoading ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Send size={18} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                )}
                {isLoading ? t('submitting') : t('submitCreditRequest')}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};

export default CreditRequestModal;
