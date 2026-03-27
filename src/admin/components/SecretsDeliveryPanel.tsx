import React, { useState } from 'react';
import { Send, Mail, MessageSquare, Key, FileText, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { getBearerAuthHeaders } from '../../utils/authHeaders';

export const SecretsDeliveryPanel: React.FC = () => {
  const [deliveryChannel, setDeliveryChannel] = useState<'email' | 'internal'>('email');
  const [recipient, setRecipient] = useState('');
  const [code, setCode] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!recipient || !code) {
      toast.error('Please fill in all required fields');
      return;
    }

    setLoading(true);
    try {
      const headers = await getBearerAuthHeaders({
        'Content-Type': 'application/json',
      });
      const response = await fetch('/api/admin/secrets/send', {
        method: 'POST',
        headers,
        body: JSON.stringify({ deliveryChannel, recipient, code, notes })
      });

      if (response.ok) {
        toast.success('Secret code sent successfully');
        setRecipient('');
        setCode('');
        setNotes('');
      } else {
        toast.error('Failed to send secret code');
      }
    } catch (error) {
      toast.error('Error sending secret code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white/40 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
        <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
          <Send size={20} /> Issue & Deliver Secret Code
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest mb-2">Delivery Channel</label>
              <div className="flex gap-4">
                <button 
                  onClick={() => setDeliveryChannel('email')}
                  className={cn("flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border transition-all", deliveryChannel === 'email' ? "bg-emerald-500 text-white border-emerald-500" : "bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700")}
                >
                  <Mail size={16} /> Email
                </button>
                <button 
                  onClick={() => setDeliveryChannel('internal')}
                  className={cn("flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border transition-all", deliveryChannel === 'internal' ? "bg-emerald-500 text-white border-emerald-500" : "bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700")}
                >
                  <MessageSquare size={16} /> Internal Message
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest mb-2">Recipient (Email or Username)</label>
              <input 
                placeholder="Enter recipient..." 
                value={recipient} 
                onChange={e => setRecipient(e.target.value)} 
                className="w-full p-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800" 
              />
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest mb-2">Secret Code</label>
              <input 
                placeholder="Enter or generate code..." 
                value={code} 
                onChange={e => setCode(e.target.value)} 
                className="w-full p-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800" 
              />
            </div>

            <div>
              <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest mb-2">Admin Notes (Optional)</label>
              <textarea 
                placeholder="Add notes..." 
                value={notes} 
                onChange={e => setNotes(e.target.value)} 
                className="w-full p-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800"
                rows={3}
              />
            </div>
          </div>
        </div>

        <button 
          onClick={handleSend} 
          disabled={loading}
          className="w-full mt-6 px-6 py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />} Send Code
        </button>
      </div>
    </div>
  );
};

// Helper for class names
function cn(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}
