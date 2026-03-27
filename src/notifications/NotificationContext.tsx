import React, { createContext, useContext, useState, useEffect } from 'react';
import { logger } from '../utils/logger';
import { communicationService } from '../services/communicationService';
import { auth } from '../firebase';
import toast from 'react-hot-toast';
import { MessageCard } from '../components/MessageCard';
import {
  safeLocalStorageGetItem,
  safeLocalStorageSetItem,
} from '../utils/browserStorage';
import { usePopupOrchestrator } from '../contexts/PopupOrchestratorContext';

export type NotificationType = 'info' | 'success' | 'warning' | 'error' | 'system' | 'credit' | 'analysis' | 'request' | 'subscription' | 'update' | 'admin';

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  time: Date;
  read: boolean;
  link?: string;
  priority?: 'low' | 'medium' | 'high';
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (notification: Omit<Notification, 'id' | 'time' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
  removeNotification: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAttentionLocked } = usePopupOrchestrator();
  const [notifications, setNotifications] = useState<Notification[]>(() => {
    const saved = safeLocalStorageGetItem('zootopia_notifications');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.map((n: any) => ({ ...n, time: new Date(n.time) }));
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  useEffect(() => {
    safeLocalStorageSetItem('zootopia_notifications', JSON.stringify(notifications));
  }, [notifications]);

  const unreadCount = notifications.filter(n => !n.read).length;
  const deferredCommunicationToastsRef = React.useRef<any[]>([]);
  const deferredToastTimerIdsRef = React.useRef<number[]>([]);

  const addNotification = (n: Omit<Notification, 'id' | 'time' | 'read'> & { id?: string }) => {
    setNotifications(prev => {
      // Prevent duplicates if id is provided
      if (n.id && prev.some(existing => existing.id === n.id)) {
        return prev;
      }
      
      const newNotification: Notification = {
        ...n,
        id: n.id || Math.random().toString(36).substring(2, 11),
        time: new Date(),
        read: false,
      };
      
      logger.info('Notification added', { title: n.title, type: n.type });
      return [newNotification, ...prev].slice(0, 100); // Keep last 100
    });
  };

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const showCommunicationToast = React.useCallback((comm: any) => {
    toast.custom((t) => (
      <div
        className={`${
          t.visible ? 'animate-enter' : 'animate-leave'
        } max-w-md w-full pointer-events-auto`}
      >
        <MessageCard
          message={comm}
          onDismiss={() => {
            toast.dismiss(t.id);
            if (comm.type !== 'message') {
              communicationService.dismiss(comm.id);
            }
          }}
        />
      </div>
    ), {
      duration: comm.type === 'popup' ? 10000 : 5000,
      position: 'top-center'
    });
  }, []);

  useEffect(() => {
    if (isAttentionLocked || deferredCommunicationToastsRef.current.length === 0) {
      return;
    }

    const queuedToasts = deferredCommunicationToastsRef.current.splice(0);
    deferredToastTimerIdsRef.current = queuedToasts.map((comm, index) =>
      window.setTimeout(() => {
        showCommunicationToast(comm);
      }, index * 180)
    );

    return () => {
      deferredToastTimerIdsRef.current.forEach((timerId) => window.clearTimeout(timerId));
      deferredToastTimerIdsRef.current = [];
    };
  }, [isAttentionLocked, showCommunicationToast]);

  // Initial welcome notification if empty
  useEffect(() => {
    if (notifications.length === 0) {
      addNotification({
        title: 'Welcome to Zootopia Club!',
        message: 'Explore our AI-powered scientific tools and start your journey.',
        type: 'system',
        priority: 'medium'
      });
    }
  }, []);

  // Internal messaging subscription
  useEffect(() => {
    if (!auth.currentUser) return;
    
    const processedCommIds = new Set<string>();
    
    const unsubscribe = communicationService.subscribeToUserCommunications(
      auth.currentUser.uid,
      (comms) => {
        comms.forEach(comm => {
          if (!comm.read && !processedCommIds.has(comm.id)) {
            processedCommIds.add(comm.id);
            
            // Only add to the notification dropdown if it's explicitly a notification
            if (comm.type === 'notification') {
              addNotification({
                id: comm.id,
                title: comm.title,
                message: comm.message,
                type: 'admin',
                priority: 'high'
              });
            }
            
            if (isAttentionLocked) {
              deferredCommunicationToastsRef.current.push(comm);
            } else {
              showCommunicationToast(comm);
            }
            
            // Mark as read so it doesn't trigger a toast again on reload
            communicationService.markAsRead(comm.id);
            
            // Ephemeral types should be dismissed immediately from the inbox
            if (comm.type === 'toast' || comm.type === 'notification') {
              communicationService.dismiss(comm.id);
            }
          }
        });
      }
    );
    return () => unsubscribe();
  }, [auth.currentUser, isAttentionLocked, showCommunicationToast]);

  useEffect(() => {
    /**
     * Keep event-to-toast rendering centralized here so credit notifications
     * do not spawn ad-hoc toast subsystems in execution services/components.
     */
    const handleCreditDeducted = (event: Event) => {
      const customEvent = event as CustomEvent<{ amount?: number; remaining?: number | null; source?: string }>;
      const amount = Math.max(1, Number(customEvent.detail?.amount || 1));
      const remaining = Number(customEvent.detail?.remaining);
      const source = String(customEvent.detail?.source || 'standard');

      const message = Number.isFinite(remaining)
        ? `${amount} credit used. Remaining: ${remaining}.`
        : `${amount} credit used after successful operation.`;

      addNotification({
        title: source === 'fast-access' ? 'Faculty Credit Deducted' : 'Credit Deducted',
        message,
        type: 'credit',
        priority: 'low',
      });
      toast(message, { duration: 3200 });
    };

    window.addEventListener('zootopia:credit-deducted', handleCreditDeducted as EventListener);
    return () => {
      window.removeEventListener('zootopia:credit-deducted', handleCreditDeducted as EventListener);
    };
  }, []);

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      addNotification,
      markAsRead,
      markAllAsRead,
      clearNotifications,
      removeNotification
    }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
