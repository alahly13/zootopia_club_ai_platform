import React, { useState, useEffect } from 'react';
import { Key, Plus, Trash2, Loader2, Copy, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { AdminModal } from './AdminModal';
import { useLanguage } from '../../contexts/LanguageContext';
import { AI_MODELS } from '../../constants/aiModels';
import { UnlockCode } from '../../utils';
import { getUnlockCodes, createUnlockCode, deleteUnlockCode } from '../../services/accessControl/codeService';

export const UnlockCodeManager: React.FC = () => {
  const { t } = useLanguage();
  const [codes, setCodes] = useState<UnlockCode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newCode, setNewCode] = useState<Partial<UnlockCode>>({ code: '', targetId: 'all', type: 'Page Access' });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const targets = [
    { id: 'all', name: 'All Pages & Models', type: 'system' },
    { id: 'images', name: 'Image Generator', type: 'Page Access' },
    { id: 'videos', name: 'Video Generator', type: 'Page Access' },
    { id: 'history', name: 'User History', type: 'Page Access' },
    { id: 'chat', name: 'Chatbot', type: 'Page Access' },
    { id: 'live', name: 'Live Voice', type: 'Page Access' },
    { id: 'tools', name: 'Study Tools', type: 'Page Access' },
    { id: 'premium-hub', name: 'Premium Hub', type: 'Page Access' },
    { id: 'secrets', name: 'Secrets Page', type: 'Secrets Access' },
    { id: 'internal-chat', name: 'Chat with Admin', type: 'Chat Unlock' },
    ...AI_MODELS.map(m => ({ id: m.id, name: `Model: ${m.name}`, type: 'Model Access' }))
  ];

  useEffect(() => {
    fetchCodes();
  }, []);

  const fetchCodes = async () => {
    setIsLoading(true);
    try {
      const fetchedCodes = await getUnlockCodes();
      setCodes(fetchedCodes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } catch (error) {
      console.error('Failed to fetch unlock codes:', error);
      toast.error('Failed to fetch unlock codes');
    } finally {
      setIsLoading(false);
    }
  };

  const generateRandomCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'ZOO-';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewCode(prev => ({ ...prev, code: result }));
  };

  const addCode = async () => {
    if (!newCode.code?.trim()) {
      toast.error('Please enter a code');
      return;
    }
    
    try {
      const target = targets.find(t => t.id === newCode.targetId);
      const type = target?.type === 'system' ? 'Page Access' : (target?.type as UnlockCode['type'] || 'Page Access');

      await createUnlockCode({
        code: newCode.code.trim(),
        targetId: newCode.targetId,
        type: type,
        isActive: true,
        createdBy: 'admin' // Should use actual admin ID
      });
      toast.success('Unlock code added');
      setIsAdding(false);
      setNewCode({ code: '', targetId: 'all', type: 'Page Access' });
      fetchCodes();
    } catch (error) {
      console.error('Failed to add unlock code:', error);
      toast.error('Failed to add unlock code');
    }
  };

  const deleteCode = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this code?')) return;
    try {
      await deleteUnlockCode(id);
      toast.success('Unlock code deleted');
      fetchCodes();
    } catch (error) {
      console.error('Failed to delete unlock code:', error);
      toast.error('Failed to delete unlock code');
    }
  };

  const copyToClipboard = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    toast.success('Code copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="bg-white/40 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-[2rem] p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
          <Key className="text-emerald-500" size={20} />
          Page & Model Unlock Codes
        </h3>
        <button 
          onClick={() => {
            generateRandomCode();
            setIsAdding(true);
          }} 
          className="p-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-500 transition-colors"
        >
          <Plus size={20} />
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="animate-spin text-emerald-500" />
        </div>
      ) : codes.length === 0 ? (
        <div className="text-center py-8 text-zinc-500">
          No unlock codes found. Create one to get started.
        </div>
      ) : (
        <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
          {codes.map(code => (
            <div key={code.id} className="flex items-center justify-between p-4 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-black text-zinc-900 dark:text-white tracking-wider">{code.code}</p>
                  <button 
                    onClick={() => copyToClipboard(code.code, code.id)}
                    className="p-1 text-zinc-400 hover:text-emerald-500 transition-colors"
                    title="Copy code"
                  >
                    {copiedId === code.id ? <CheckCircle size={14} className="text-emerald-500" /> : <Copy size={14} />}
                  </button>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-md font-medium">
                    {targets.find(t => t.id === code.targetId)?.name || code.targetId}
                  </span>
                  <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-md font-medium">
                    {code.type}
                  </span>
                  <span className={code.isActive ? 'text-emerald-500' : 'text-red-500'}>
                    {code.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
              <button 
                onClick={() => deleteCode(code.id)} 
                className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-colors"
                title="Delete code"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
      )}

      <AdminModal isOpen={isAdding} onClose={() => setIsAdding(false)} title="Create Unlock Code">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Code</label>
            <div className="flex gap-2">
              <input 
                type="text" 
                value={newCode.code} 
                onChange={e => setNewCode({...newCode, code: e.target.value.toUpperCase()})} 
                className="flex-1 p-3 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:border-emerald-500 font-mono"
                placeholder="e.g. ZOO-1234"
              />
              <button 
                onClick={generateRandomCode}
                className="px-4 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-300 rounded-xl font-bold transition-colors"
              >
                Generate
              </button>
            </div>
          </div>
          
          <div>
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Target</label>
            <select 
              value={newCode.targetId}
              onChange={e => setNewCode({...newCode, targetId: e.target.value})}
              className="w-full p-3 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:border-emerald-500"
            >
              <optgroup label="System">
                {targets.filter(p => p.type === 'system').map(page => (
                  <option key={page.id} value={page.id}>{page.name}</option>
                ))}
              </optgroup>
              <optgroup label="Pages">
                {targets.filter(p => p.type === 'Page Access').map(page => (
                  <option key={page.id} value={page.id}>{page.name}</option>
                ))}
              </optgroup>
              <optgroup label="Models">
                {targets.filter(p => p.type === 'Model Access').map(page => (
                  <option key={page.id} value={page.id}>{page.name}</option>
                ))}
              </optgroup>
              <optgroup label="Features">
                {targets.filter(p => p.type !== 'system' && p.type !== 'Page Access' && p.type !== 'Model Access').map(page => (
                  <option key={page.id} value={page.id}>{page.name}</option>
                ))}
              </optgroup>
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <button 
              onClick={() => setIsAdding(false)}
              className="flex-1 py-3 text-zinc-500 font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={addCode}
              disabled={!newCode.code?.trim()}
              className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-colors disabled:opacity-50"
            >
              Create Code
            </button>
          </div>
        </div>
      </AdminModal>
    </div>
  );
};
