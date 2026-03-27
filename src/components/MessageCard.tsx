import * as React from 'react';
import { motion } from 'motion/react';
import { MessageSquare, Bell, Info, AlertCircle, Copy, Check, Key } from 'lucide-react';
import { useState } from 'react';
import { InternalCommunication } from '../services/communicationService';
import { GiftCard } from './GiftCard';
import { cn } from '../utils';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

interface MessageCardProps {
  message: InternalCommunication;
  onDismiss?: (id: string) => void;
}

export const MessageCard: React.FC<MessageCardProps> = ({ message, onDismiss }) => {
  const [copied, setCopied] = useState(false);
  const { t } = useTranslation();

  const handleCopy = () => {
    if (message.code) {
      navigator.clipboard.writeText(message.code);
      setCopied(true);
      toast.success('Code copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getIcon = () => {
    switch (message.type) {
      case 'message': return <MessageSquare className="w-5 h-5" />;
      case 'notification': return <Bell className="w-5 h-5" />;
      case 'popup': return <Info className="w-5 h-5" />;
      case 'toast': return <AlertCircle className="w-5 h-5" />;
      default: return <MessageSquare className="w-5 h-5" />;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-xl shadow-zinc-200/50 dark:shadow-none hover:border-emerald-500/30 transition-all duration-300"
    >
      <div className="flex items-start gap-4">
        <div className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded-2xl text-zinc-600 dark:text-zinc-400">
          {getIcon()}
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="font-black text-zinc-900 dark:text-white tracking-tight text-lg">{message.title}</h4>
            {onDismiss && (
              <button 
                onClick={() => onDismiss(message.id)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
              >
                ×
              </button>
            )}
          </div>
          <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">{message.message}</p>
          
          {message.purpose === 'gift-code' && message.code && (
            <div className="mt-4">
              <GiftCard title={message.title} code={message.code} description={message.message} />
            </div>
          )}
          
          {message.code && message.purpose !== 'gift-code' && message.purpose !== 'manual' && (
            <div className="mt-4 bg-gradient-to-br from-indigo-500 via-indigo-600 to-indigo-800 text-white p-6 rounded-3xl shadow-2xl shadow-indigo-500/20 space-y-4 border border-white/10">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white/20 rounded-2xl">
                  <Key className="text-white" size={24} />
                </div>
                <h4 className="font-black text-lg uppercase tracking-widest">{t('secret-code')}</h4>
              </div>
              <div className="bg-black/20 p-4 rounded-2xl font-mono text-center text-xl font-black tracking-[0.2em] border border-white/10 flex items-center justify-between">
                <span>{message.code}</span>
                <button 
                  onClick={handleCopy}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  {copied ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
                </button>
              </div>
            </div>
          )}

          {message.code && message.purpose === 'manual' && (
            <div className="mt-4 flex items-center gap-2 p-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700">
              <code className="font-mono text-sm text-zinc-900 dark:text-white flex-1">{message.code}</code>
              <button 
                onClick={handleCopy}
                className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          )}
          
          {message.ctaLink && (
            <a 
              href={message.ctaLink} 
              className="inline-block mt-4 px-6 py-3 bg-emerald-600 text-white font-black uppercase tracking-widest rounded-xl hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-500/20"
            >
              {message.ctaLabel || 'View'}
            </a>
          )}
        </div>
      </div>
    </motion.div>
  );
};
