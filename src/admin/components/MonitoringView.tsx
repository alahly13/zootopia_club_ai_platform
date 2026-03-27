import * as React from 'react';
import { useState, useEffect } from 'react';
import { Activity, Database, Trash2, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { auth } from '../../firebase';

export const MonitoringView: React.FC = () => {
  const { t } = useTranslation();
  const [activeOps, setActiveOps] = useState<any[]>([]);
  const [providerUsage, setProviderUsage] = useState<any[]>([]);
  const [storedResults, setStoredResults] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [aggregated, setAggregated] = useState<any>({});
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const headers = { 'Authorization': `Bearer ${idToken}` };
      const [opsRes, usageRes, resultsRes, historyRes, aggRes] = await Promise.all([
        fetch('/api/admin/monitoring/active-operations', { headers }),
        fetch('/api/admin/monitoring/provider-usage', { headers }),
        fetch('/api/admin/monitoring/stored-results', { headers }),
        fetch('/api/admin/monitoring/history', { headers }),
        fetch('/api/admin/monitoring/aggregated', { headers })
      ]);
      setActiveOps(await opsRes.json().then(r => r.activeOperations || []));
      setProviderUsage(await usageRes.json().then(r => r.providerUsage || []));
      setStoredResults(await resultsRes.json().then(r => r.storedResults || []));
      setHistory(await historyRes.json().then(r => r.history || []));
      setAggregated(await aggRes.json().then(r => r.aggregated || {}));
    } catch (error) {
      toast.error(t('error-fetching-monitoring-data'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const deleteResult = async (id: string) => {
    try {
      const idToken = await auth.currentUser?.getIdToken();
      await fetch(`/api/admin/monitoring/stored-results/${id}`, { 
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${idToken}` }
      });
      toast.success(t('result-deleted'));
      fetchData();
    } catch (error) {
      toast.error(t('error-deleting-result'));
    }
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-black text-zinc-900 dark:text-white uppercase tracking-widest">{t('monitoring')}</h2>
      
      <div className="bg-white/40 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
        <h3 className="text-sm font-black text-zinc-500 uppercase tracking-widest mb-4">{t('aggregated-usage')}</h3>
        <pre className="text-xs text-zinc-700 dark:text-zinc-300">{JSON.stringify(aggregated, null, 2)}</pre>
      </div>

      <div className="bg-white/40 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
        <h3 className="text-sm font-black text-zinc-500 uppercase tracking-widest mb-4">{t('usage-history')}</h3>
        <ul className="space-y-2">
            {history.map((h: any) => (
                <li key={h.id} className="text-sm text-zinc-700 dark:text-zinc-300">
                    {h.timestamp} - {h.provider} - {h.model} - Tokens: {h.usage?.totalTokens || 0}
                </li>
            ))}
        </ul>
      </div>

      <div className="bg-white/40 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
        <h3 className="text-sm font-black text-zinc-500 uppercase tracking-widest mb-4">{t('active-operations')}</h3>
        {activeOps.length === 0 ? <p className="text-sm text-zinc-500">{t('no-active-ops')}</p> : (
            <ul className="space-y-2">
                {activeOps.map((op, i) => <li key={i} className="text-sm text-zinc-700 dark:text-zinc-300">{op.name} - {op.status}</li>)}
            </ul>
        )}
      </div>

      <div className="bg-white/40 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
        <h3 className="text-sm font-black text-zinc-500 uppercase tracking-widest mb-4">{t('provider-usage')}</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-zinc-500 uppercase tracking-widest text-[10px]">
              <th className="text-start p-2">{t('provider')}</th>
              <th className="text-start p-2">{t('requests')}</th>
              <th className="text-start p-2">{t('cost')}</th>
            </tr>
          </thead>
          <tbody>
            {providerUsage.map((usage, i) => (
              <tr key={i} className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="p-2">{usage.provider}</td>
                <td className="p-2">{usage.requests}</td>
                <td className="p-2">{usage.cost}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white/40 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
        <h3 className="text-sm font-black text-zinc-500 uppercase tracking-widest mb-4">{t('stored-results')}</h3>
        <ul className="space-y-2">
            {storedResults.map(res => (
                <li key={res.id} className="flex items-center justify-between text-sm text-zinc-700 dark:text-zinc-300">
                    {res.name}
                    <button onClick={() => deleteResult(res.id)} className="text-red-500 hover:text-red-700"><Trash2 size={16}/></button>
                </li>
            ))}
        </ul>
      </div>
    </div>
  );
};
