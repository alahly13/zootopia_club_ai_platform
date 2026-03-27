import * as React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, Loader2, Target } from 'lucide-react';
import { communicationService } from '../../services/communicationService';
import { useAuth } from '../../auth/AuthContext';
import toast from 'react-hot-toast';
import { Purpose } from '../../types/communication';
import { cn } from '../../utils';

export const PurposeCommunicationSender: React.FC = () => {
  const { t } = useTranslation();
  const { allUsers } = useAuth();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [purpose, setPurpose] = useState<Purpose>('manual');
  const [recipientId, setRecipientId] = useState('');
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async () => {
    if (!title || !message || !recipientId) {
      toast.error(t('please-fill-all-fields'));
      return;
    }

    const recipient = allUsers.find(u => u.id === recipientId);
    if (!recipient) {
      toast.error('Recipient not found');
      return;
    }

    setIsLoading(true);
    try {
      await communicationService.sendPurposeCommunication({
        userId: recipientId,
        purpose,
        title,
        message,
        code: code || undefined,
        email: recipient.email
      });
      toast.success(t('message-sent-successfully'));
      setTitle('');
      setMessage('');
      setRecipientId('');
      setCode('');
    } catch (error) {
      console.error('Failed to send purpose message:', error);
      toast.error(t('error-sending-message'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white/40 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-sm space-y-6">
      <h3 className="text-lg font-black text-zinc-900 dark:text-white uppercase tracking-widest flex items-center gap-2"><Target className="w-5 h-5 text-emerald-500" /> {t('send-purpose-message')}</h3>
      <div className="space-y-4">
        <select className="w-full p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800" value={purpose} onChange={e => setPurpose(e.target.value as Purpose)}>
          <option value="manual">{t('manual')}</option>
          <option value="gift-code">{t('gift-code')}</option>
          <option value="secrets-access">{t('secrets-access')}</option>
          <option value="model-unlock">{t('model-unlock')}</option>
          <option value="tool-unlock">{t('tool-unlock')}</option>
          <option value="chat-unlock">{t('chat-unlock')}</option>
        </select>
        
        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase">{t('recipient')}</label>
          {allUsers.length === 0 ? (
            <p className="text-sm text-zinc-500 italic">{t('no-users-found')}</p>
          ) : (
            <select className="w-full p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800" value={recipientId} onChange={e => setRecipientId(e.target.value)}>
              <option value="">{t('select-recipient')}</option>
              {allUsers.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
            </select>
          )}
        </div>

        <input className="w-full p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800" placeholder={t('message-title')} value={title} onChange={e => setTitle(e.target.value)} />
        <textarea className="w-full p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 h-32" placeholder={t('message-body')} value={message} onChange={e => setMessage(e.target.value)} />
        <input className="w-full p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800" placeholder={t('code-optional')} value={code} onChange={e => setCode(e.target.value)} />
        
        <button className={cn(
          "w-full py-3 text-white rounded-xl font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-xl",
          isLoading ? "bg-zinc-400 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20"
        )} onClick={handleSend} disabled={isLoading}>
          {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          {isLoading ? t('sending') : t('send-purpose-message')}
        </button>
      </div>
    </div>
  );
};
