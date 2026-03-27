import React, { useEffect, useState } from 'react';
import { communicationService, InternalCommunication } from '../services/communicationService';
import { useAuth } from '../auth/AuthContext';
import { Mail, Archive, Check, Copy } from 'lucide-react';
import { toast } from 'react-hot-toast';

export const InboxPage: React.FC = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<InternalCommunication[]>([]);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = communicationService.subscribeToUserCommunications(user.id, (comms) => {
      setMessages(comms.filter((m) => !m.dismissed));
    });
    return () => unsubscribe();
  }, [user]);

  const handleMarkAsRead = async (messageId: string) => {
    await communicationService.markAsRead(messageId);
    toast.success('Message marked as read');
  };

  const handleArchive = async (messageId: string) => {
    await communicationService.dismiss(messageId);
    toast.success('Message archived');
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success('Code copied to clipboard');
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Mail className="w-6 h-6" /> Inbox
      </h1>
      <div className="space-y-4">
        {messages.length === 0 ? (
          <p className="text-gray-500">No messages found.</p>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`p-4 rounded-xl border ${!msg.read ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-200'}`}>
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold">{msg.title}</h3>
                  <p className="text-sm text-gray-600">{msg.message}</p>
                  {msg.code && (
                    <div className="mt-2 p-2 bg-gray-100 rounded flex items-center justify-between">
                      <code className="font-mono">{msg.code}</code>
                      <button onClick={() => copyCode(msg.code!)} className="text-emerald-600 hover:text-emerald-800">
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  {!msg.read && (
                    <button onClick={() => handleMarkAsRead(msg.id)} className="text-emerald-600 hover:text-emerald-800">
                      <Check className="w-5 h-5" />
                    </button>
                  )}
                  <button onClick={() => handleArchive(msg.id)} className="text-gray-400 hover:text-gray-600">
                    <Archive className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
