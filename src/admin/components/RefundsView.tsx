import * as React from 'react';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, RefreshCcw, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { auth } from '../../firebase';
import { cn } from '../../utils';

const REFUND_REASON_PRESETS = [
  { code: 'duplicate_charge', label: 'Duplicate charge', description: 'Customer was charged more than once.' },
  { code: 'fraud_suspected', label: 'Fraud suspected', description: 'Suspicious payment activity was detected.' },
  { code: 'user_request', label: 'User request', description: 'Customer explicitly requested a refund.' },
  { code: 'service_issue', label: 'Service issue', description: 'Paid feature or service did not work as expected.' },
  { code: 'compliance', label: 'Compliance', description: 'Policy or legal compliance requirement.' },
  { code: 'other_custom', label: 'Other (custom)', description: 'Use a custom explanation.' },
];

export const RefundsView: React.FC = () => {
  const { t } = useTranslation();
  const [refunds, setRefunds] = useState<any[]>([]);
  const [refundableTransactions, setRefundableTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<any | null>(null);
  const [reasonCode, setReasonCode] = useState<string>('user_request');
  const [reasonDetails, setReasonDetails] = useState('');
  const [confirmEntitlementImpact, setConfirmEntitlementImpact] = useState(false);

  const fetchRefunds = async () => {
    setLoading(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const headers = { 'Authorization': `Bearer ${idToken}` };
      const response = await fetch('/api/admin/refunds', { headers });
      if (!response.ok) throw new Error('Failed to fetch refunds');
      const data = await response.json();
      setRefunds(data.refunds || []);
      setRefundableTransactions(data.refundableTransactions || []);
    } catch (error) {
      toast.error(t('error-fetching-refunds'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRefunds();
  }, []);

  const openRefundConfirmation = (tx: any) => {
    setSelectedTransaction(tx);
    setReasonCode('user_request');
    setReasonDetails('');
    setConfirmEntitlementImpact(false);
  };

  const closeRefundConfirmation = () => {
    if (submitting) return;
    setSelectedTransaction(null);
  };

  const handleRefund = async () => {
    if (!selectedTransaction) return;
    if (reasonCode === 'other_custom' && !reasonDetails.trim()) {
      toast.error('Please provide a custom reason.');
      return;
    }
    if (!confirmEntitlementImpact) {
      toast.error('Please confirm entitlement impact before submitting.');
      return;
    }

    try {
      setSubmitting(true);
      const idToken = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/admin/refunds', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          transactionId: selectedTransaction.id,
          amountCents: Math.round(Number(selectedTransaction.amount || 0) * 100),
          reasonCode,
          reasonDetails: reasonDetails.trim() || undefined,
        })
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Refund failed');
      }
      toast.success(t('refund-successful'));
      closeRefundConfirmation();
      fetchRefunds();
    } catch (error: any) {
      toast.error(error?.message || t('refund-failed'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-black text-zinc-900 dark:text-white uppercase tracking-widest">{t('refunds')}</h2>
      
      <div className="bg-white/40 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm overflow-x-auto custom-scrollbar">
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-900/40">
          <p className="text-xs text-zinc-500">
            Refunded subscriptions are reverted to free plan by current business policy. Use refunds carefully.
          </p>
        </div>
        <table className="w-full text-start min-w-200">
          <thead>
            <tr className="bg-zinc-50/50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800">
              <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t('transaction-id')}</th>
              <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t('amount')}</th>
              <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t('status')}</th>
              <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest text-end">{t('actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {refunds.map((refund) => (
              <tr key={refund.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors">
                <td className="px-6 py-4 text-sm font-bold text-zinc-900 dark:text-white">{refund.transactionId}</td>
                <td className="px-6 py-4 text-sm text-zinc-700 dark:text-zinc-300">{refund.amount}</td>
                <td className="px-6 py-4">
                  <span className={cn(
                    "px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider",
                    refund.status === 'refunded' ? "bg-emerald-500/10 text-emerald-600" :
                    refund.status === 'refund_failed' ? "bg-red-500/10 text-red-600" :
                    refund.status === 'refund_processing' ? "bg-blue-500/10 text-blue-600" :
                    "bg-amber-500/10 text-amber-600"
                  )}>
                    {t(refund.status)}
                  </span>
                </td>
                <td className="px-6 py-4 text-end">
                  <span className="text-xs text-zinc-500">-</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white/40 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm overflow-x-auto custom-scrollbar">
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-900/40">
          <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200">Paid Transactions (Refund Candidates)</h3>
        </div>
        <table className="w-full text-start min-w-225">
          <thead>
            <tr className="bg-zinc-50/50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800">
              <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Session</th>
              <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Type</th>
              <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">User</th>
              <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Amount</th>
              <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest text-end">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {refundableTransactions.map((tx) => (
              <tr key={tx.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors">
                <td className="px-6 py-4 text-xs font-mono text-zinc-700 dark:text-zinc-300">{tx.id}</td>
                <td className="px-6 py-4 text-sm text-zinc-700 dark:text-zinc-300">{tx.type || '-'}</td>
                <td className="px-6 py-4 text-sm text-zinc-700 dark:text-zinc-300">{tx.userId || '-'}</td>
                <td className="px-6 py-4 text-sm font-bold text-zinc-900 dark:text-white">{tx.amount} {tx.currency || ''}</td>
                <td className="px-6 py-4 text-end">
                  <button
                    onClick={() => openRefundConfirmation(tx)}
                    className="p-2 hover:bg-emerald-500/10 rounded-lg text-emerald-600 transition-all"
                    title="Refund paid transaction"
                  >
                    <RefreshCcw size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedTransaction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-xl rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl p-6 space-y-5">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5" />
              <div>
                <h3 className="text-lg font-black text-zinc-900 dark:text-white">Confirm Refund Request</h3>
                <p className="text-sm text-zinc-500">Please verify details before issuing this refund.</p>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 bg-zinc-50/60 dark:bg-zinc-950/60 text-sm space-y-2">
              <div><span className="font-bold">Session:</span> {selectedTransaction.id}</div>
              <div><span className="font-bold">Type:</span> {selectedTransaction.type || '-'}</div>
              <div><span className="font-bold">User:</span> {selectedTransaction.userId || '-'}</div>
              <div><span className="font-bold">Amount:</span> {selectedTransaction.amount} {selectedTransaction.currency || ''}</div>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">Refund Reason</label>
              <select
                value={reasonCode}
                onChange={(e) => setReasonCode(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
              >
                {REFUND_REASON_PRESETS.map((preset) => (
                  <option key={preset.code} value={preset.code}>{preset.label}</option>
                ))}
              </select>
              <p className="text-xs text-zinc-500">
                {REFUND_REASON_PRESETS.find((preset) => preset.code === reasonCode)?.description}
              </p>

              {reasonCode === 'other_custom' && (
                <textarea
                  value={reasonDetails}
                  onChange={(e) => setReasonDetails(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2 text-sm min-h-24"
                  placeholder="Provide refund explanation"
                />
              )}
            </div>

            <label className="flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={confirmEntitlementImpact}
                onChange={(e) => setConfirmEntitlementImpact(e.target.checked)}
                className="mt-1"
              />
              <span>I confirm this refund may impact subscription access and entitlement state according to current policy.</span>
            </label>

            <div className="flex justify-end gap-3">
              <button
                onClick={closeRefundConfirmation}
                disabled={submitting}
                className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300"
              >
                Cancel
              </button>
              <button
                onClick={handleRefund}
                disabled={submitting}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold disabled:opacity-60"
              >
                {submitting ? 'Submitting...' : 'Confirm Refund'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
