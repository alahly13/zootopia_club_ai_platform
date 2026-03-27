import * as React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, BookOpen, Sparkles, AlertCircle, Info, Zap, CheckCircle, Trash2, MailOpen, ShieldAlert, X } from 'lucide-react';
import { useNotifications, NotificationType } from '../notifications/NotificationContext';
import { cn } from '../utils';
import { usePopupBlocker } from '../contexts/PopupOrchestratorContext';
import { NOTIFICATION_DROPDOWN_FLOW_ID, POPUP_FLOW_PRIORITY } from '../constants/popupFlows';

const getIcon = (type: NotificationType) => {
  switch (type) {
    case 'analysis':
      return <Sparkles size={16} className="text-emerald-500" />;
    case 'credit':
      return <Zap size={16} className="text-amber-500" />;
    case 'subscription':
      return <CheckCircle size={16} className="text-emerald-500" />;
    case 'update':
    case 'system':
      return <Bell size={16} className="text-blue-500" />;
    case 'request':
      return <BookOpen size={16} className="text-purple-500" />;
    case 'admin':
      return <ShieldAlert size={16} className="text-red-500" />;
    case 'success':
      return <CheckCircle size={16} className="text-emerald-500" />;
    case 'warning':
      return <AlertCircle size={16} className="text-amber-500" />;
    case 'error':
      return <AlertCircle size={16} className="text-red-500" />;
    default:
      return <Info size={16} className="text-zinc-400" />;
  }
};

export const NotificationDropdown: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearNotifications, removeNotification } = useNotifications();

  usePopupBlocker({
    id: NOTIFICATION_DROPDOWN_FLOW_ID,
    isActive: isOpen,
    priority: POPUP_FLOW_PRIORITY.helper,
  });

  if (!isOpen) return null;

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(date).toLocaleDateString();
  };

  const dropdownContent = (
    <>
      <div className="fixed inset-0 z-[100]" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: -10, scale: 0.95, filter: 'blur(10px)' }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: -10, scale: 0.95, filter: 'blur(10px)' }}
        className="fixed end-4 sm:end-6 top-20 w-[calc(100vw-2rem)] sm:w-[420px] bg-white/96 dark:bg-zinc-900/90 backdrop-blur-xl border border-zinc-300 dark:border-zinc-800 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.12)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.2)] z-[105] overflow-hidden flex flex-col max-h-[85vh]"
      >
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-white/95 dark:bg-zinc-900/50">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500">
              <Bell size={20} />
            </div>
            <div>
              <h3 className="font-black text-xs uppercase tracking-[0.2em] text-zinc-900 dark:text-white leading-none">Intelligence</h3>
              <p className="text-[10px] font-bold text-zinc-500 mt-1 uppercase tracking-widest">System Updates & Alerts</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <span className="bg-emerald-500 text-white text-[10px] px-2.5 py-1 rounded-full font-black shadow-lg shadow-emerald-500/20 animate-pulse">
                {unreadCount} NEW
              </span>
            )}
            <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 mx-1" />
            <button 
              onClick={markAllAsRead}
              className="p-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl text-zinc-500 hover:text-emerald-500 transition-all cursor-pointer active:scale-90"
              title="Mark all as read"
            >
              <MailOpen size={18} />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto custom-scrollbar flex-1 py-2">
          {notifications.length === 0 ? (
            <div className="py-24 px-10 text-center">
              <div className="w-20 h-20 bg-zinc-50 dark:bg-zinc-800/50 rounded-[2rem] flex items-center justify-center mx-auto mb-6 border border-zinc-100 dark:border-zinc-800">
                <Bell size={32} className="text-zinc-200 dark:text-zinc-700" />
              </div>
              <h4 className="text-zinc-900 dark:text-white font-black uppercase tracking-widest text-xs">Clear Horizon</h4>
              <p className="text-zinc-500 text-xs mt-2 leading-relaxed max-w-[200px] mx-auto">Your intelligence feed is currently empty. We'll notify you of any breakthroughs.</p>
            </div>
          ) : (
            notifications.map((n) => (
              <motion.div 
                layout
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                key={n.id} 
                onClick={() => markAsRead(n.id)}
                className={cn(
                  "px-6 py-5 hover:bg-zinc-100 dark:hover:bg-zinc-800/40 cursor-pointer flex gap-5 border-b border-zinc-100 dark:border-zinc-800/50 last:border-0 transition-all group relative",
                  !n.read && "bg-emerald-500/[0.05] dark:bg-emerald-500/[0.02]"
                )}
              >
                {!n.read && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500 rounded-r-full" />
                )}
                
                <div className="mt-1 shrink-0">
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 group-hover:rotate-6 group-hover:scale-110",
                    n.read 
                      ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400" 
                      : "bg-white dark:bg-zinc-900 shadow-xl shadow-zinc-900/5 border border-zinc-100 dark:border-zinc-800"
                  )}>
                    {getIcon(n.type)}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        "text-sm font-black truncate tracking-tight", 
                        n.read ? "text-zinc-600 dark:text-zinc-400" : "text-zinc-900 dark:text-white"
                      )}>
                        {n.title}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1 line-clamp-2 leading-relaxed font-medium">
                        {n.message}
                      </p>
                    </div>
                    
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        removeNotification(n.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-2 hover:bg-red-500/10 rounded-xl text-zinc-400 hover:text-red-500 transition-all active:scale-90"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between mt-4">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-600 font-black uppercase tracking-widest">
                        {formatTime(n.time)}
                      </span>
                      {n.priority === 'high' && (
                        <span className="flex items-center gap-1 text-[8px] px-2 py-0.5 bg-red-500/10 text-red-500 rounded-full font-black uppercase tracking-[0.2em] ring-1 ring-red-500/20">
                          <AlertCircle size={8} />
                          Urgent
                        </span>
                      )}
                    </div>
                    {!n.read && (
                      <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">New</span>
                    )}
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
        
        <div className="p-5 bg-zinc-100/80 dark:bg-zinc-950/50 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-4">
          <button 
            onClick={clearNotifications}
            className="flex items-center gap-2 text-[10px] font-black text-zinc-400 hover:text-red-500 uppercase tracking-widest transition-colors cursor-pointer"
          >
            <Trash2 size={12} />
            Clear All
          </button>
          <button className="px-5 py-2.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl hover:scale-[1.02] active:scale-95 transition-all cursor-pointer shadow-lg shadow-zinc-900/10">
            View Archive
          </button>
        </div>
      </motion.div>
    </>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(dropdownContent, document.body);
};
