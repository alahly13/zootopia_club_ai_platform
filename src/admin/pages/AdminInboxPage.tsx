import React, { useEffect, useState } from 'react';
import { communicationService, InternalCommunication } from '../../services/communicationService';
import { useAuth } from '../../auth/AuthContext';
import { ShieldAlert, Archive } from 'lucide-react';
import { toast } from 'react-hot-toast';

export const AdminInboxPage: React.FC = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<InternalCommunication[]>([]);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = communicationService.subscribeToAdminCommunications((comms) => {
      setMessages(comms.filter((m) => !m.dismissed));
    });
    return () => unsubscribe();
  }, [user]);

  const handleArchive = async (messageId: string) => {
    await communicationService.dismissAdmin(messageId);
    toast.success('Message archived');
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <ShieldAlert className="w-6 h-6 text-emerald-600" /> Admin Operations Inbox
      </h1>
      <div className="space-y-4">
        {messages.length === 0 ? (
          <p className="text-gray-500">No operational events found.</p>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="p-4 rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs font-semibold text-emerald-600 uppercase">{msg.purpose}</span>
                  <h3 className="font-semibold text-lg">{msg.title}</h3>
                  <p className="text-sm text-gray-700">{msg.message}</p>
                  <p className="text-xs text-gray-400 mt-2">{new Date(msg.createdAt).toLocaleString()}</p>
                </div>
                <button onClick={() => handleArchive(msg.id)} className="text-gray-400 hover:text-gray-600">
                  <Archive className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
