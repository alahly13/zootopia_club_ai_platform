import * as React from 'react';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence } from 'motion/react';
import { InternalCommunication, communicationService } from '../services/communicationService';
import { useAuth } from '../auth/AuthContext';
import { MessageCard } from './MessageCard';

export const Inbox: React.FC = () => {
  const { t } = useTranslation();
  const { user, isProfileHydrating } = useAuth();
  const [messages, setMessages] = useState<InternalCommunication[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setLoading(isProfileHydrating);
      return;
    }

    const unsubscribe = communicationService.subscribeToUserCommunications(
      user.id,
      (comms) => {
        setMessages(comms);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isProfileHydrating, user?.id]);

  const handleDismiss = async (id: string) => {
    await communicationService.dismiss(id);
  };

  if (loading) {
    return <div className="p-8 text-center text-zinc-500">{t('loading')}</div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-black text-zinc-900 dark:text-white tracking-tighter">{t('inbox')}</h2>
      
      {messages.length === 0 ? (
        <div className="text-center py-12 bg-zinc-100 dark:bg-zinc-800 rounded-3xl border border-zinc-200 dark:border-zinc-700">
          <p className="text-zinc-500">{t('no-messages')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <AnimatePresence>
            {messages.map((message) => (
              <MessageCard 
                key={message.id} 
                message={message} 
                onDismiss={handleDismiss} 
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};
