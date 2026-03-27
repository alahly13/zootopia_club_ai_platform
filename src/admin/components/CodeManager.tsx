import * as React from 'react';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Loader2, CheckCircle2, XCircle, Clock, ShieldCheck } from 'lucide-react';
import { IssuedCode, CodeStatus } from '../../types/code';
import toast from 'react-hot-toast';
import { auth } from '../../firebase';
import { cn } from '../../utils';

type UnlockUsageMode = 'single-use' | 'limited-use' | 'unlimited-use';

const TOOL_UNLOCK_OPTIONS = [
  { id: 'quiz', label: 'Assessment Generator' },
  { id: 'analyze', label: 'Analyze' },
  { id: 'infographic', label: 'Infographic Generator' },
  { id: 'all', label: 'All Eligible Tools' },
];

export const CodeManager: React.FC = () => {
  const { t } = useTranslation();
  const [codes, setCodes] = useState<IssuedCode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreatingUnlockCode, setIsCreatingUnlockCode] = useState(false);
  const [targetToolId, setTargetToolId] = useState('quiz');
  const [usageMode, setUsageMode] = useState<UnlockUsageMode>('single-use');
  const [maxUsesInput, setMaxUsesInput] = useState('');
  const [expiresAtInput, setExpiresAtInput] = useState('');
  const [neverExpires, setNeverExpires] = useState(true);
  const [recipientEmail, setRecipientEmail] = useState('');

  useEffect(() => {
    fetchCodes();
  }, []);

  const fetchCodes = async () => {
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/admin/codes', {
        headers: { 'Authorization': `Bearer ${idToken}` }
      });
      const data = await res.json();
      if (data.success) {
        setCodes(data.codes);
      }
    } catch (error) {
      toast.error('Failed to fetch codes');
    } finally {
      setIsLoading(false);
    }
  };

  const updateStatus = async (id: string, status: CodeStatus) => {
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/admin/codes/${id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error('Failed to update status');
      toast.success('Status updated');
      fetchCodes();
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const createToolUnlockCode = async () => {
    if (usageMode === 'limited-use') {
      const parsedMaxUses = Number(maxUsesInput);
      if (!Number.isInteger(parsedMaxUses) || parsedMaxUses <= 0) {
        toast.error('Max uses must be a positive integer for limited-use codes.');
        return;
      }
    }

    if (!neverExpires && !expiresAtInput.trim()) {
      toast.error('Please select an expiry date/time or enable never expires.');
      return;
    }

    setIsCreatingUnlockCode(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Missing authentication token. Please sign in again.');

      const body: Record<string, unknown> = {
        purpose: 'tool-unlock',
        usageMode,
        neverExpires,
        metadata: {
          targetToolId,
        },
        title: `Tool Unlock: ${targetToolId}`,
        description: 'Admin-issued tool unlock entitlement code.',
      };

      if (usageMode === 'limited-use') {
        body.maxUses = Number(maxUsesInput);
      }
      if (!neverExpires) {
        body.expiresAt = new Date(expiresAtInput).toISOString();
      }
      if (recipientEmail.trim()) {
        body.recipientEmail = recipientEmail.trim().toLowerCase();
      }

      const createResponse = await fetch('/api/admin/generate-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(body),
      });

      const createData = await createResponse.json().catch(() => ({}));
      if (!createResponse.ok || !createData?.id) {
        throw new Error(createData?.error || 'Failed to generate unlock code.');
      }

      const activateResponse = await fetch(`/api/admin/codes/${createData.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ status: 'active' }),
      });

      if (!activateResponse.ok) {
        throw new Error('Code was created but could not be activated.');
      }

      toast.success(`Unlock code created: ${createData.code}`);
      setUsageMode('single-use');
      setMaxUsesInput('');
      setExpiresAtInput('');
      setNeverExpires(true);
      setRecipientEmail('');
      await fetchCodes();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to create unlock code.');
    } finally {
      setIsCreatingUnlockCode(false);
    }
  };

  const filteredCodes = codes.filter(c => 
    c.codeValue.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.purpose.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) return <div className="p-8 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto" /></div>;

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-xl overflow-hidden">
      <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 bg-emerald-50/50 dark:bg-emerald-900/10">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          <h3 className="text-sm font-black uppercase tracking-widest text-zinc-900 dark:text-white">
            Admin Tool Unlock Code Issuer
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Target Tool</label>
            <select
              value={targetToolId}
              onChange={(event) => setTargetToolId(event.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-sm"
            >
              {TOOL_UNLOCK_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Usage Mode</label>
            <select
              value={usageMode}
              onChange={(event) => setUsageMode(event.target.value as UnlockUsageMode)}
              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-sm"
            >
              <option value="single-use">Single Use</option>
              <option value="limited-use">Limited Use</option>
              <option value="unlimited-use">Unlimited Use</option>
            </select>
          </div>

          {usageMode === 'limited-use' && (
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Max Uses</label>
              <input
                type="number"
                min={1}
                value={maxUsesInput}
                onChange={(event) => setMaxUsesInput(event.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-sm"
                placeholder="e.g. 25"
              />
            </div>
          )}

          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={neverExpires}
                onChange={(event) => setNeverExpires(event.target.checked)}
              />
              Never Expires
            </label>
          </div>

          {!neverExpires && (
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Expires At</label>
              <input
                type="datetime-local"
                value={expiresAtInput}
                onChange={(event) => setExpiresAtInput(event.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-sm"
              />
            </div>
          )}

          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Recipient Email (Optional)</label>
            <input
              type="email"
              value={recipientEmail}
              onChange={(event) => setRecipientEmail(event.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-sm"
              placeholder="student@example.com"
            />
          </div>
        </div>

        <div className="mt-4">
          <button
            onClick={createToolUnlockCode}
            disabled={isCreatingUnlockCode}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-widest disabled:opacity-60"
          >
            {isCreatingUnlockCode ? 'Generating...' : 'Generate Tool Unlock Code'}
          </button>
        </div>
      </div>

      <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <h3 className="text-xl font-black text-zinc-900 dark:text-white uppercase tracking-tight">Issued Codes</h3>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input 
            className="pl-9 pr-4 py-2 bg-zinc-100 dark:bg-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
            placeholder="Search codes..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-zinc-50 dark:bg-zinc-800 text-zinc-500 uppercase text-xs font-bold">
            <tr>
              <th className="px-6 py-4">Code</th>
              <th className="px-6 py-4">Purpose</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Uses</th>
              <th className="px-6 py-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {filteredCodes.map(code => (
              <tr key={code.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                <td className="px-6 py-4 font-mono font-bold text-blue-600 dark:text-blue-400">{code.codeValue}</td>
                <td className="px-6 py-4">{code.purpose}</td>
                <td className="px-6 py-4">
                  <span className={cn("px-2 py-1 rounded-full text-[10px] font-bold uppercase", 
                    code.status === 'active' ? "bg-green-100 text-green-700" :
                    code.status === 'consumed' ? "bg-zinc-100 text-zinc-700" :
                    "bg-red-100 text-red-700"
                  )}>{code.status}</span>
                </td>
                <td className="px-6 py-4">{code.currentUses} / {code.maxUses || '∞'}</td>
                <td className="px-6 py-4">
                  <div className="flex gap-2">
                    {code.status === 'active' && (
                      <button onClick={() => updateStatus(code.id, 'paused')} className="p-1 hover:bg-zinc-200 rounded"><Clock size={16} /></button>
                    )}
                    {code.status === 'paused' && (
                      <button onClick={() => updateStatus(code.id, 'active')} className="p-1 hover:bg-zinc-200 rounded"><CheckCircle2 size={16} /></button>
                    )}
                    <button onClick={() => updateStatus(code.id, 'revoked')} className="p-1 hover:bg-zinc-200 rounded text-red-500"><XCircle size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
