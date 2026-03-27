import * as React from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Heart, Loader2, RefreshCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { auth } from '../../firebase';
import { formatPrice } from '../../services/billing/pricingDisplayService';
import { cn } from '../../utils';

type DonationRecord = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  provider: string;
  donationAmountMode?: string | null;
  donationTierId?: string | null;
  isAnonymousDonation?: boolean;
  userId?: string | null;
  userEmail?: string | null;
  createdAt?: string | null;
  verifiedAt?: string | null;
};

type DonationSummary = {
  total: number;
  successful: number;
  pending: number;
  unsuccessful: number;
  totalAmount: number;
};

export const DonationsView: React.FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [donations, setDonations] = useState<DonationRecord[]>([]);
  const [summary, setSummary] = useState<DonationSummary>({
    total: 0,
    successful: 0,
    pending: 0,
    unsuccessful: 0,
    totalAmount: 0,
  });

  const fetchDonations = async () => {
    setLoading(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/admin/donations', {
        headers: {
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(String(data?.error || 'Failed to fetch donations'));
      }

      setDonations(Array.isArray(data.donations) ? data.donations : []);
      setSummary({
        total: Number(data.summary?.total || 0),
        successful: Number(data.summary?.successful || 0),
        pending: Number(data.summary?.pending || 0),
        unsuccessful: Number(data.summary?.unsuccessful || 0),
        totalAmount: Number(data.summary?.totalAmount || 0),
      });
    } catch (error) {
      console.error('Failed to fetch donations:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to fetch donations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchDonations();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-zinc-900 dark:text-white uppercase tracking-widest">Donations</h2>
          <p className="text-sm text-zinc-500 mt-2">
            Donation records stay inside the shared transaction ledger so admin audit views do not drift away from the verified payment source of truth.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchDonations()}
          className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 px-4 py-2 text-sm font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900/60 transition-colors"
        >
          <RefreshCcw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/50 p-5">
          <p className="text-xs font-black uppercase tracking-widest text-zinc-500">Total Donations</p>
          <p className="mt-3 text-3xl font-black text-zinc-900 dark:text-white">{summary.total}</p>
        </div>
        <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/50 p-5">
          <p className="text-xs font-black uppercase tracking-widest text-zinc-500">Verified</p>
          <p className="mt-3 text-3xl font-black text-emerald-600 dark:text-emerald-400">{summary.successful}</p>
        </div>
        <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/50 p-5">
          <p className="text-xs font-black uppercase tracking-widest text-zinc-500">Pending</p>
          <p className="mt-3 text-3xl font-black text-blue-600 dark:text-blue-400">{summary.pending}</p>
        </div>
        <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/50 p-5">
          <p className="text-xs font-black uppercase tracking-widest text-zinc-500">Verified Amount</p>
          <p className="mt-3 text-3xl font-black text-zinc-900 dark:text-white">{formatPrice(summary.totalAmount, 'EGP')}</p>
        </div>
      </div>

      <div className="bg-white/40 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm overflow-x-auto custom-scrollbar">
        <table className="w-full text-start min-w-[920px]">
          <thead>
            <tr className="bg-zinc-50/50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800">
              <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Donation</th>
              <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Donor</th>
              <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t('amount')}</th>
              <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Mode</th>
              <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t('status')}</th>
              <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {donations.map((donation) => {
              const normalizedStatus = String(donation.status || '').toLowerCase();
              const donorLabel = donation.userEmail || donation.userId || (donation.isAnonymousDonation ? 'Anonymous donor' : '-');
              const modeLabel = donation.donationAmountMode === 'fixed' ? 'Fixed' : 'Custom';

              return (
                <tr key={donation.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 rounded-full bg-rose-500/10 p-2 text-rose-500">
                        <Heart className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-zinc-900 dark:text-white">{donation.id}</p>
                        <p className="text-xs text-zinc-500">Provider: {donation.provider || 'paymob'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-zinc-700 dark:text-zinc-300">{donorLabel}</td>
                  <td className="px-6 py-4 text-sm font-bold text-zinc-900 dark:text-white">
                    {formatPrice(Number(donation.amount || 0), (donation.currency || 'EGP') as any)}
                  </td>
                  <td className="px-6 py-4 text-sm text-zinc-700 dark:text-zinc-300">
                    {modeLabel}
                    {donation.donationTierId ? <span className="block text-xs text-zinc-500">{donation.donationTierId}</span> : null}
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      'px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider',
                      normalizedStatus === 'paid'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : normalizedStatus === 'pending'
                          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                          : normalizedStatus === 'cancelled'
                            ? 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300'
                            : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                    )}>
                      {normalizedStatus || 'pending'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-zinc-700 dark:text-zinc-300">
                    {donation.createdAt ? new Date(donation.createdAt).toLocaleString() : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
