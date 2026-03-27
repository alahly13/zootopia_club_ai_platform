import React, { useState, useEffect } from 'react';
import { Key, Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { AdminModal } from './AdminModal';
import { auth } from '../../firebase';

interface GiftCode {
  id: string;
  code: string;
  amount: number;
  isActive: boolean;
  createdAt: string;
  expiresAt?: string | null;
  maxRedemptions?: number;
  redemptionCount?: number;
  revokedAt?: string | null;
}

export const GiftCodeManager: React.FC = () => {
  const [codes, setCodes] = useState<GiftCode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newCode, setNewCode] = useState({ code: '', amount: 3, isActive: true, maxRedemptions: 1, expiresAt: '' });

  useEffect(() => {
    fetchCodes();
  }, []);

  const fetchCodes = async () => {
    setIsLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        throw new Error('missing-auth-token');
      }

      const response = await fetch('/api/admin/gift-codes', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) {
        throw new Error('fetch-failed');
      }
      const data = await response.json();
      setCodes(data);
    } catch (error) {
      toast.error('Failed to fetch gift codes');
    } finally {
      setIsLoading(false);
    }
  };

  const addCode = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        throw new Error('missing-auth-token');
      }

      const response = await fetch('/api/admin/gift-codes', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          code: newCode.code,
          amount: newCode.amount,
          isActive: newCode.isActive,
          maxRedemptions: newCode.maxRedemptions,
          expiresAt: newCode.expiresAt || undefined,
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'add-failed');
      }

      toast.success('Gift code added');
      setIsAdding(false);
      setNewCode({ code: '', amount: 3, isActive: true, maxRedemptions: 1, expiresAt: '' });
      fetchCodes();
    } catch (error) {
      toast.error('Failed to add gift code');
    }
  };

  const toggleCodeState = async (code: GiftCode) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        throw new Error('missing-auth-token');
      }

      const response = await fetch(`/api/admin/gift-codes/${code.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          code: code.code,
          amount: code.amount,
          isActive: !code.isActive,
          maxRedemptions: code.maxRedemptions || 1,
          expiresAt: code.expiresAt || undefined,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'toggle-failed');
      }

      toast.success(`Gift code ${code.isActive ? 'deactivated' : 'activated'}`);
      fetchCodes();
    } catch {
      toast.error('Failed to update gift code');
    }
  };

  const deleteCode = async (id: string) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        throw new Error('missing-auth-token');
      }

      await fetch(`/api/admin/gift-codes/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Gift code deleted');
      fetchCodes();
    } catch (error) {
      toast.error('Failed to delete gift code');
    }
  };

  return (
    <div className="bg-white/40 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-4xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
          <Key className="text-purple-500" size={20} />
          Gift Codes
        </h3>
        <button onClick={() => setIsAdding(true)} className="p-2 bg-purple-600 text-white rounded-xl hover:bg-purple-500">
          <Plus size={20} />
        </button>
      </div>

      {isLoading ? <Loader2 className="animate-spin mx-auto" /> : (
        <div className="space-y-4">
          {codes.map(code => (
            <div key={code.id} className="flex items-center justify-between p-4 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
              <div>
                <p className="font-bold">{code.code}</p>
                <p className="text-xs text-zinc-500">
                  Amount: {code.amount} | {code.isActive ? 'Active' : 'Inactive'} | Redeemed: {code.redemptionCount || 0}/{code.maxRedemptions || 1}
                </p>
                {code.expiresAt && (
                  <p className="text-[11px] text-zinc-400">Expires: {new Date(code.expiresAt).toLocaleString()}</p>
                )}
                {code.revokedAt && (
                  <p className="text-[11px] text-rose-400">Revoked: {new Date(code.revokedAt).toLocaleString()}</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => toggleCodeState(code)} className="text-amber-500 hover:text-amber-400 text-xs font-bold">
                  {code.isActive ? 'Deactivate' : 'Activate'}
                </button>
                <button onClick={() => deleteCode(code.id)} className="text-red-500 hover:text-red-400">
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AdminModal isOpen={isAdding} onClose={() => setIsAdding(false)} title="Add Gift Code">
        <div className="space-y-4">
          <input type="text" placeholder="Code" value={newCode.code} onChange={e => setNewCode({...newCode, code: e.target.value})} className="w-full p-2 border rounded" />
          <input type="number" placeholder="Amount" value={newCode.amount} onChange={e => setNewCode({...newCode, amount: parseInt(e.target.value)})} className="w-full p-2 border rounded" />
          <input type="number" placeholder="Max Redemptions" value={newCode.maxRedemptions} onChange={e => setNewCode({...newCode, maxRedemptions: Math.max(1, parseInt(e.target.value) || 1)})} className="w-full p-2 border rounded" />
          <input type="datetime-local" value={newCode.expiresAt} onChange={e => setNewCode({...newCode, expiresAt: e.target.value})} className="w-full p-2 border rounded" />
          <button onClick={addCode} className="w-full py-2 bg-purple-600 text-white rounded">Add</button>
        </div>
      </AdminModal>
    </div>
  );
};
