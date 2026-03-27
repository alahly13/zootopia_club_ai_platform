import React, { useState, useEffect } from 'react';
import { Key, Plus, Trash2, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { cleanString, toPositiveInteger } from '../../utils/validators';
import { getBearerAuthHeaders } from '../../utils/authHeaders';

export const SecretCodeManager: React.FC = () => {
  const [codes, setCodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [newCode, setNewCode] = useState({ code: '', userId: '', purpose: 'unlock_secrets', maxUsage: 1 });

  const fetchCodes = async () => {
    setLoading(true);
    try {
      const headers = await getBearerAuthHeaders();
      const response = await fetch('/api/admin/secret-codes', {
        headers,
      });
      const data = await response.json();
      setCodes(data);
    } catch (error) {
      toast.error('Failed to fetch secret codes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCodes(); }, []);

  const handleIssueCode = async () => {
    const normalizedCode = cleanString(newCode.code);
    const normalizedUserId = cleanString(newCode.userId);
    const normalizedPurpose = cleanString(newCode.purpose) || 'unlock_secrets';
    const normalizedMaxUsage = toPositiveInteger(newCode.maxUsage);

    if (!normalizedCode) {
      toast.error('Code is required');
      return;
    }

    if (!normalizedUserId) {
      toast.error('User ID is required');
      return;
    }

    if (!normalizedMaxUsage) {
      toast.error('Max usage must be a positive integer');
      return;
    }

    try {
      const headers = await getBearerAuthHeaders({
        'Content-Type': 'application/json',
      });
      const response = await fetch('/api/secrets/issue-code', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          code: normalizedCode,
          userId: normalizedUserId,
          purpose: normalizedPurpose,
          maxUsage: normalizedMaxUsage,
        })
      });
      if (response.ok) {
        toast.success('Code issued');
        fetchCodes();
        setNewCode({ code: '', userId: '', purpose: 'unlock_secrets', maxUsage: 1 });
      } else {
        toast.error('Failed to issue code');
      }
    } catch (error) {
      toast.error('Error issuing code');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white/40 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
        <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
          <Key size={20} /> Issue Secret Code
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <input placeholder="Code" value={newCode.code} onChange={e => setNewCode({...newCode, code: e.target.value})} className="p-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800" />
          <input placeholder="User ID" value={newCode.userId} onChange={e => setNewCode({...newCode, userId: e.target.value})} className="p-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800" />
          <input type="number" placeholder="Max Usage" value={newCode.maxUsage} onChange={e => setNewCode({...newCode, maxUsage: Number(e.target.value) || 1})} className="p-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800" />
          <button onClick={handleIssueCode} className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700">Issue</button>
        </div>
      </div>

      <div className="bg-white/40 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm">
        <table className="w-full text-start">
          <thead>
            <tr className="bg-zinc-50/50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800">
              <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Code</th>
              <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">User ID</th>
              <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Status</th>
              <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Usage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {codes.map(c => (
              <tr key={c.id}>
                <td className="px-6 py-4 font-mono">{c.code}</td>
                <td className="px-6 py-4">{c.userId}</td>
                <td className="px-6 py-4">{c.status}</td>
                <td className="px-6 py-4">{c.usageCount}/{c.maxUsage}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
