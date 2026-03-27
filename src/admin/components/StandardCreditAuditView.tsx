import * as React from 'react';
import { useMemo, useState } from 'react';
import { RefreshCw, Search, User, Clock, Hash, Coins, CheckCircle2, AlertTriangle, Download } from 'lucide-react';
import { auth } from '../../firebase';
import { cn } from '../../utils';

type StandardCreditEvent = {
  id: string;
  userId: string;
  operationId: string;
  traceId: string;
  status: 'deducted' | string;
  amount: number;
  beforeCredits: number;
  afterCredits: number;
  toolId: string;
  modelId: string;
  promptHash?: string;
  fallbackHappened?: boolean;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  } | null;
  resultTextLength?: number;
  creditedSystem?: string;
  createdAt: string;
  updatedAt?: string;
};

const formatDateTime = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
};

const short = (value: string, size = 12) => {
  const v = String(value || '');
  if (v.length <= size) return v;
  return `${v.slice(0, size)}...`;
};

const toDateInputValue = (date: Date) => date.toISOString().slice(0, 10);

const startDateFromPreset = (days: number) => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
  return toDateInputValue(start);
};

const csvEscape = (value: unknown) => {
  const text = String(value ?? '').replace(/"/g, '""');
  return `"${text}"`;
};

export const StandardCreditAuditView: React.FC = () => {
  const today = new Date();
  const sevenDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);

  const [events, setEvents] = useState<StandardCreditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(80);
  const [fromDate, setFromDate] = useState(toDateInputValue(sevenDaysAgo));
  const [toDate, setToDate] = useState(toDateInputValue(today));
  const [activePreset, setActivePreset] = useState<'today' | '7d' | '30d' | 'custom'>('7d');

  const fetchEvents = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        throw new Error('Missing admin auth token.');
      }

      const params = new URLSearchParams({ limit: String(limit) });
      if (fromDate) params.set('fromDate', fromDate);
      if (toDate) params.set('toDate', toDate);

      const response = await fetch(`/api/admin/credits/events?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Failed to load standard credit events.');
      }

      setEvents(Array.isArray(payload.events) ? payload.events : []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load events.');
    } finally {
      setLoading(false);
    }
  }, [limit, fromDate, toDate]);

  React.useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return events;

    return events.filter((event) => {
      return [event.userId, event.operationId, event.traceId, event.toolId, event.modelId, event.status]
        .some((value) => String(value || '').toLowerCase().includes(normalized));
    });
  }, [events, query]);

  const stats = useMemo(() => {
    const total = events.length;
    const deducted = events.filter((event) => event.status === 'deducted').length;
    const exhausted = events.filter((event) => event.afterCredits <= 0).length;
    const consumed = events.reduce((sum, event) => sum + (Number.isFinite(event.amount) ? event.amount : 0), 0);
    return { total, deducted, exhausted, consumed };
  }, [events]);

  const handleCsvExport = () => {
    const rows = filtered.map((event) => [
      event.id,
      event.createdAt,
      event.userId,
      event.operationId,
      event.traceId,
      event.toolId,
      event.modelId,
      event.status,
      event.amount,
      event.beforeCredits,
      event.afterCredits,
      event.fallbackHappened ? 'true' : 'false',
      event.usage?.promptTokens ?? 0,
      event.usage?.completionTokens ?? 0,
      event.usage?.totalTokens ?? 0,
      event.resultTextLength ?? 0,
      event.promptHash || '',
    ]);

    const header = [
      'id',
      'createdAt',
      'userId',
      'operationId',
      'traceId',
      'toolId',
      'modelId',
      'status',
      'amount',
      'beforeCredits',
      'afterCredits',
      'fallbackHappened',
      'promptTokens',
      'completionTokens',
      'totalTokens',
      'resultTextLength',
      'promptHash',
    ];

    const csv = [header, ...rows]
      .map((row) => row.map((cell) => csvEscape(cell)).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `standard-credit-audit-${fromDate || 'all'}-to-${toDate || 'all'}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const applyPreset = (preset: 'today' | '7d' | '30d') => {
    const todayValue = toDateInputValue(new Date());
    const fromValue = preset === 'today' ? todayValue : preset === '7d' ? startDateFromPreset(7) : startDateFromPreset(30);
    setFromDate(fromValue);
    setToDate(todayValue);
    setActivePreset(preset);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white/40 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">Standard Accounts</p>
            <h3 className="text-lg font-black text-zinc-900 dark:text-white uppercase tracking-wider mt-1">Credit Events Audit</h3>
            <p className="text-xs text-zinc-500 mt-2">Trace of standard-account credit deductions with operation and trace identifiers.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute inset-s-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by userId, operationId, traceId, tool..."
                className="w-72 max-w-[70vw] ps-9 pe-3 py-2 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-xl bg-zinc-100/70 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700">
              <div className="flex items-center gap-1 me-1">
                {[
                  { id: 'today' as const, label: 'Today' },
                  { id: '7d' as const, label: '7D' },
                  { id: '30d' as const, label: '30D' },
                ].map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset.id)}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-colors',
                      activePreset === preset.id
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400'
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">From</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => { setFromDate(e.target.value); setActivePreset('custom'); }}
                className="px-2 py-1 rounded-lg text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 focus:outline-none focus:border-emerald-500"
              />
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">To</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => { setToDate(e.target.value); setActivePreset('custom'); }}
                className="px-2 py-1 rounded-lg text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <select
              value={String(limit)}
              onChange={(e) => setLimit(Number(e.target.value) || 80)}
              className="px-3 py-2 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="40">40</option>
              <option value="80">80</option>
              <option value="120">120</option>
            </select>
            <button
              type="button"
              onClick={fetchEvents}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
            >
              <RefreshCw size={14} className={cn(loading && 'animate-spin')} /> Refresh
            </button>
            <button
              type="button"
              onClick={handleCsvExport}
              disabled={filtered.length === 0}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-zinc-900 hover:bg-zinc-700 dark:bg-zinc-100 dark:hover:bg-zinc-300 text-white dark:text-zinc-900 disabled:opacity-50"
            >
              <Download size={14} /> CSV
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/60 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Events</p>
            <p className="text-2xl font-black text-zinc-900 dark:text-white tabular-nums">{stats.total}</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/60 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Deducted</p>
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">{stats.deducted}</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/60 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Credits Used</p>
            <p className="text-2xl font-black text-amber-600 dark:text-amber-400 tabular-nums">{stats.consumed}</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/60 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Reached Zero</p>
            <p className="text-2xl font-black text-rose-600 dark:text-rose-400 tabular-nums">{stats.exhausted}</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-300/70 dark:border-rose-700/60 bg-rose-50 dark:bg-rose-900/20 p-4 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      <div className="bg-white/40 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-start min-w-245">
            <thead>
              <tr className="bg-zinc-50/60 dark:bg-zinc-900/60 border-b border-zinc-200 dark:border-zinc-800">
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Time</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">User</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Operation</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Trace</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Tool / Model</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Credits</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {filtered.map((event) => (
                <tr key={event.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-300 whitespace-nowrap">{formatDateTime(event.createdAt)}</td>
                  <td className="px-4 py-3 text-xs">
                    <div className="inline-flex items-center gap-2 px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 font-bold">
                      <User size={12} /> {short(event.userId, 14)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-300 font-mono">{short(event.operationId, 20)}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400 font-mono">{short(event.traceId, 18)}</td>
                  <td className="px-4 py-3 text-xs text-zinc-700 dark:text-zinc-200">
                    <div className="flex flex-col">
                      <span className="font-black uppercase tracking-wider">{event.toolId || '-'}</span>
                      <span className="text-zinc-500 dark:text-zinc-400">{event.modelId || '-'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-700 dark:text-zinc-200">
                    <div className="flex items-center gap-2">
                      <Coins size={12} className="text-amber-500" />
                      <span className="font-black tabular-nums">{event.beforeCredits}{' -> '}{event.afterCredits}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <div className="flex items-center gap-2">
                      {event.status === 'deducted' ? (
                        <>
                          <CheckCircle2 size={12} className="text-emerald-500" />
                          <span className="text-emerald-600 dark:text-emerald-400 font-black uppercase tracking-wider">Deducted</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle size={12} className="text-amber-500" />
                          <span className="text-amber-600 dark:text-amber-400 font-black uppercase tracking-wider">{event.status || 'unknown'}</span>
                        </>
                      )}
                    </div>
                    <div className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                      <Clock size={10} />
                      <span>tokens: {event.usage?.totalTokens ?? 0}</span>
                      <Hash size={10} />
                      <span>len: {event.resultTextLength ?? 0}</span>
                    </div>
                  </td>
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-zinc-500 italic">
                    {loading ? 'Loading events...' : 'No standard credit events found for the current filter.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
