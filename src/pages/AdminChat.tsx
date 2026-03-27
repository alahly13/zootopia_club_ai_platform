import React, { useState, useEffect, useRef } from 'react';
import { PageLock } from '../components/PageLock';
import { MessageSquare, Send, User, Sparkles, Loader2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { communicationService, OperationType, handleFirestoreError } from '../services/communicationService';
import { cn } from '../utils';
import { motion, AnimatePresence } from 'motion/react';

export const AdminChat: React.FC = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user?.id) return;

    const unsubscribe = communicationService.subscribeToChat(user.id, (msgs) => {
      setMessages(msgs);
      // Mark unread admin messages as read
      msgs.forEach(msg => {
        if (msg.senderRole === 'admin' && !msg.read) {
          communicationService.markChatMessageAsRead(msg.id).catch(err => 
            handleFirestoreError(err, OperationType.UPDATE, 'admin_chat_messages/' + msg.id)
          );
        }
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'admin_chat_messages');
    });

    return () => unsubscribe();
  }, [user?.id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !user?.id || isLoading) return;

    const msg = input;
    setInput('');
    setIsLoading(true);

    try {
      await communicationService.sendChatMessage(user.id, msg, 'user');
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <PageLock pageId="internal-chat" pageName="Chat with Admin">
      <div className="flex flex-col h-[calc(100vh-12rem)] bg-white/40 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm">
        {/* Header */}
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-500/10 text-blue-500 rounded-xl">
              <MessageSquare size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Chat with Admin</h2>
              <p className="text-sm text-zinc-500">Secure communication with the platform administrator</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-500 rounded-full text-[10px] font-bold uppercase tracking-wider">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              Admin Online
            </div>
          </div>
        </div>

        {/* Messages */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar"
        >
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
              <div className="p-4 bg-zinc-100 dark:bg-zinc-800 rounded-full">
                <MessageSquare size={32} className="text-zinc-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-white">No messages yet</p>
                <p className="text-xs text-zinc-500">Start a conversation with the administrator.</p>
              </div>
            </div>
          ) : (
            messages.map((msg, i) => (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={msg.id || i}
                className={cn(
                  "flex gap-3 max-w-[80%]",
                  msg.senderRole === 'user' ? "ms-auto flex-row-reverse" : ""
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                  msg.senderRole === 'user' ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400" : "bg-blue-600/20 text-blue-500"
                )}>
                  {msg.senderRole === 'user' ? <User size={16} /> : <Sparkles size={16} />}
                </div>
                <div className="space-y-1">
                  <div className={cn(
                    "p-3 rounded-2xl text-sm shadow-sm",
                    msg.senderRole === 'user' 
                      ? "bg-blue-600 text-white rounded-tr-none" 
                      : "bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-100 dark:border-zinc-700 rounded-tl-none"
                  )}>
                    {msg.message}
                  </div>
                  <p className={cn(
                    "text-[9px] text-zinc-400 font-medium",
                    msg.senderRole === 'user' ? "text-right" : "text-left"
                  )}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </motion.div>
            ))
          )}
        </div>

        {/* Input */}
        <div className="p-6 bg-white/50 dark:bg-zinc-900/50 border-t border-zinc-200 dark:border-zinc-800">
          <div className="relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Type your message to the admin..."
              className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-2xl ps-4 pe-12 py-4 focus:outline-none focus:border-blue-500 transition-all shadow-sm"
              disabled={isLoading}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="absolute end-2 top-1/2 -translate-y-1/2 p-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 text-white rounded-xl transition-all cursor-pointer shadow-lg shadow-blue-600/20"
            >
              {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
          <p className="mt-3 text-[10px] text-center text-zinc-400 font-medium italic">
            Messages are encrypted and visible only to the administrator.
          </p>
        </div>
      </div>
    </PageLock>
  );
};
