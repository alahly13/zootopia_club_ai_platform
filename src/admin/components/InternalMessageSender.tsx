import * as React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, Loader2, MessageSquare } from 'lucide-react';
import { communicationService, InternalCommunication } from '../../services/communicationService';
import { useAuth } from '../../auth/AuthContext';
import toast from 'react-hot-toast';
import { cn } from '../../utils';

export const InternalMessageSender: React.FC = () => {
  const { t } = useTranslation();
  const { allUsers } = useAuth();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [purpose, setPurpose] = useState('general admin announcement');
  const [type, setType] = useState<InternalCommunication['type']>('message');
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSendMessage = async () => {
    if (!title || !message || recipientIds.length === 0) {
      toast.error(t('please-fill-all-fields'));
      return;
    }

    setIsLoading(true);
    try {
      await Promise.all(recipientIds.map(userId => 
        communicationService.sendInternal({
          userId,
          type,
          purpose,
          title,
          message,
        })
      ));
      toast.success(t('message-sent-successfully'));
      setTitle('');
      setMessage('');
      setRecipientIds([]);
    } catch (error) {
      console.error('Failed to send message:', error);
      toast.error(t('error-sending-message'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white/40 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-sm space-y-6">
      <h3 className="text-lg font-black text-zinc-900 dark:text-white uppercase tracking-widest flex items-center gap-2"><MessageSquare className="w-5 h-5 text-emerald-500" /> {t('send-internal-message')}</h3>
      <div className="space-y-4">
        <input className="w-full p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800" placeholder={t('message-title')} value={title} onChange={e => setTitle(e.target.value)} />
        <textarea className="w-full p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 h-32" placeholder={t('message-body')} value={message} onChange={e => setMessage(e.target.value)} />
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <select className="w-full p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800" value={purpose} onChange={e => setPurpose(e.target.value)}>
            <option value="general admin announcement">{t('general-admin-announcement')}</option>
            <option value="plan/admin notice">{t('plan-admin-notice')}</option>
            <option value="gift code">{t('gift-code')}</option>
          </select>
          <select className="w-full p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800" value={type} onChange={e => setType(e.target.value as InternalCommunication['type'])}>
            <option value="message">{t('message')}</option>
            <option value="notification">{t('notification')}</option>
            <option value="popup">{t('popup')}</option>
            <option value="toast">{t('toast')}</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase">{t('recipients')} ({recipientIds.length})</label>
          {allUsers.length === 0 ? (
            <p className="text-sm text-zinc-500 italic">{t('no-users-found')}</p>
          ) : (
            <select multiple className="w-full p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 h-40" value={recipientIds} onChange={e => setRecipientIds(Array.from(e.target.selectedOptions, option => option.value))}>
              {allUsers.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
            </select>
          )}
        </div>
        
        <button className={cn(
          "w-full py-3 text-white rounded-xl font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-xl",
          isLoading ? "bg-zinc-400 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20"
        )} onClick={handleSendMessage} disabled={isLoading}>
          {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          {isLoading ? t('sending') : t('send-message')}
        </button>
      </div>
    </div>
  );
};
