import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, User, Sparkles, Loader2, Search, Clock } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { chatAdminService } from '../../services/chatAdminService';
import { cn } from '../../utils';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { handleFirestoreError, OperationType } from '../../utils/firestoreError';

export const ChatCenter: React.FC = () => {
  const { allUsers, isAdmin, isAuthReady } = useAuth();
  const [activeChatUserId, setActiveChatUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [chatList, setChatList] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch unique users who have chat messages
  useEffect(() => {
    if (!isAuthReady) return;
    if (!isAdmin) {
      setError('You do not have permission to view chat messages.');
      return;
    }

    const path = 'admin_chat_messages';
    const q = query(collection(db, path), orderBy('timestamp', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allMsgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Group by userId and get the latest message
      const latestMessages: Record<string, any> = {};
      allMsgs.forEach((msg: any) => {
        if (!latestMessages[msg.userId]) {
          latestMessages[msg.userId] = msg;
        }
      });

      const list = Object.values(latestMessages).map((msg: any) => {
        const user = allUsers.find(u => u.id === msg.userId);
        return {
          userId: msg.userId,
          userName: user?.name || 'Unknown User',
          userEmail: user?.email || msg.userId,
          lastMessage: msg.message,
          timestamp: msg.timestamp,
          unreadCount: allMsgs.filter((m: any) => m.userId === msg.userId && m.senderRole === 'user' && !m.read).length
        };
      });

      setChatList(list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, path);
      setError('Failed to load chat messages. Please check your permissions.');
    });

    return () => unsubscribe();
  }, [allUsers, isAdmin, isAuthReady]);

  // Subscribe to active chat
  useEffect(() => {
    if (!activeChatUserId) return;

    const unsubscribe = chatAdminService.subscribeToChat(activeChatUserId, (msgs) => {
      setMessages(msgs);
      // Mark unread user messages as read
      msgs.forEach(msg => {
        if (msg.senderRole === 'user' && !msg.read) {
          chatAdminService.markChatMessageAsRead(msg.id);
        }
      });
    });

    return () => unsubscribe();
  }, [activeChatUserId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !activeChatUserId || isLoading) return;

    const msg = input;
    setInput('');
    setIsLoading(true);

    try {
      await chatAdminService.sendChatMessage(activeChatUserId, msg, 'admin');
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredChatList = chatList.filter(chat => 
    chat.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    chat.userEmail.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeChatUser = allUsers.find(u => u.id === activeChatUserId);

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-center p-10">
        <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-3xl">
          <p className="text-red-500 font-bold">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-12rem)] bg-white/40 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-[2.5rem] overflow-hidden shadow-sm">
      {/* Sidebar - Chat List */}
      <div className="w-80 border-e border-zinc-200 dark:border-zinc-800 flex flex-col bg-white/20 dark:bg-zinc-900/20">
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800">
          <h3 className="text-lg font-black text-zinc-900 dark:text-white uppercase tracking-widest mb-4">Conversations</h3>
          <div className="relative group">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-blue-500 transition-colors" size={14} />
            <input 
              type="text"
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl ps-9 pe-4 py-2 text-xs focus:outline-none focus:border-blue-500 transition-all"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {filteredChatList.length === 0 ? (
            <div className="p-10 text-center text-zinc-500 text-xs italic">
              No conversations found
            </div>
          ) : (
            filteredChatList.map((chat) => (
              <button
                key={chat.userId}
                onClick={() => setActiveChatUserId(chat.userId)}
                className={cn(
                  "w-full p-4 flex items-start gap-3 transition-all border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-white/50 dark:hover:bg-zinc-800/50",
                  activeChatUserId === chat.userId ? "bg-white dark:bg-zinc-800 shadow-sm z-10" : ""
                )}
              >
                <div className="w-10 h-10 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-500 font-bold shrink-0">
                  {chat.userName.charAt(0)}
                </div>
                <div className="flex-1 min-w-0 text-start">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-zinc-900 dark:text-white truncate">{chat.userName}</p>
                    <span className="text-[9px] text-zinc-400 font-medium whitespace-nowrap">
                      {new Date(chat.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 truncate mt-0.5">{chat.lastMessage}</p>
                  {chat.unreadCount > 0 && (
                    <span className="inline-block mt-2 px-1.5 py-0.5 bg-blue-600 text-white text-[8px] font-black rounded-full">
                      {chat.unreadCount} NEW
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-white/10 dark:bg-zinc-900/10">
        {activeChatUserId ? (
          <>
            {/* Chat Header */}
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-white/30 dark:bg-zinc-900/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-500/10 text-blue-500 rounded-xl flex items-center justify-center font-bold">
                  {activeChatUser?.name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white">{activeChatUser?.name}</h3>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">{activeChatUser?.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest",
                  activeChatUser?.status === 'Active' ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                )}>
                  {activeChatUser?.status}
                </span>
              </div>
            </div>

            {/* Messages */}
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar"
            >
              {messages.map((msg, i) => (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={msg.id || i}
                  className={cn(
                    "flex gap-3 max-w-[80%]",
                    msg.senderRole === 'admin' ? "ms-auto flex-row-reverse" : ""
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                    msg.senderRole === 'admin' ? "bg-blue-600 text-white" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400"
                  )}>
                    {msg.senderRole === 'admin' ? <Sparkles size={14} /> : <User size={14} />}
                  </div>
                  <div className="space-y-1">
                    <div className={cn(
                      "p-3 rounded-2xl text-sm shadow-sm",
                      msg.senderRole === 'admin' 
                        ? "bg-blue-600 text-white rounded-tr-none" 
                        : "bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-100 dark:border-zinc-700 rounded-tl-none"
                    )}>
                      {msg.message}
                    </div>
                    <p className={cn(
                      "text-[9px] text-zinc-400 font-medium",
                      msg.senderRole === 'admin' ? "text-right" : "text-left"
                    )}>
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Input */}
            <div className="p-6 bg-white/30 dark:bg-zinc-900/30 border-t border-zinc-200 dark:border-zinc-800">
              <div className="relative">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Type your reply..."
                  className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-2xl ps-4 pe-12 py-3 text-sm focus:outline-none focus:border-blue-500 transition-all shadow-sm"
                  disabled={isLoading}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className="absolute end-2 top-1/2 -translate-y-1/2 p-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 text-white rounded-xl transition-all cursor-pointer"
                >
                  {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 opacity-30">
            <div className="p-6 bg-zinc-100 dark:bg-zinc-800 rounded-full">
              <MessageSquare size={48} className="text-zinc-400" />
            </div>
            <div>
              <h3 className="text-xl font-black text-zinc-900 dark:text-white uppercase tracking-widest">Select a Conversation</h3>
              <p className="text-sm text-zinc-500">Choose a user from the sidebar to start chatting.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
