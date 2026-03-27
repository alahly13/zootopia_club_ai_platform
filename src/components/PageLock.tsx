import React, { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Lock, Key, Send, ShieldAlert } from 'lucide-react';
import { motion } from 'motion/react';
import toast from 'react-hot-toast';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { verifyAndRedeemCode } from '../services/accessControl/codeService';

interface PageLockProps {
  pageId: string;
  pageName: string;
  children: React.ReactNode;
}

export const PageLock: React.FC<PageLockProps> = ({ pageId, pageName, children }) => {
  const { user, isAdmin } = useAuth();
  const { t } = useLanguage();
  const [isRequesting, setIsRequesting] = useState(false);
  const [unlockCode, setUnlockCode] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [showCodeInput, setShowCodeInput] = useState(false);

  // Admin and users with unlocked page have access
  if (isAdmin || user?.unlockedPages?.includes(pageId)) {
    return <>{children}</>;
  }

  const handleRequestAccess = async () => {
    if (!user) return;
    setIsRequesting(true);
    try {
      // Check if a pending request already exists
      const requestsRef = collection(db, 'requests');
      const q = query(requestsRef, where('userId', '==', user.id), where('targetPage', '==', pageId), where('status', '==', 'Pending'));
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        toast.error(t('requestAlreadyPending') || 'You already have a pending request for this page.');
        setIsRequesting(false);
        return;
      }

      await addDoc(collection(db, 'requests'), {
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        type: 'Page Access',
        targetPage: pageId,
        message: `Requesting access to ${pageName}`,
        status: 'Pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      toast.success(t('accessRequestSent') || 'Access request sent to admin.');
    } catch (error) {
      console.error('Error requesting access:', error);
      toast.error(t('errorSendingRequest') || 'Failed to send access request.');
    } finally {
      setIsRequesting(false);
    }
  };

  const handleUnlock = async () => {
    if (!user || !unlockCode.trim()) return;
    setIsUnlocking(true);
    try {
      const codeData = await verifyAndRedeemCode(unlockCode, user.id, 'Page Access', pageId);
      
      if (codeData) {
        if (codeData.targetId === pageId || codeData.targetId === 'all') {
          toast.success(t('pageUnlocked') || 'Page unlocked successfully!');
          window.location.reload();
          return;
        } else {
          toast.error(t('invalidUnlockCode') || 'This code is not valid for this page.');
          return;
        }
      }
      toast.error(t('invalidUnlockCode') || 'Invalid or expired unlock code.');
    } catch (error: any) {
      console.error('Error unlocking page:', error);
      toast.error(error.message || t('errorUnlocking') || 'Failed to unlock page.');
    } finally {
      setIsUnlocking(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] p-8 text-center">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="max-w-md w-full bg-white/60 dark:bg-zinc-900/60 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-2xl shadow-black/5"
      >
        <div className="w-20 h-20 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <ShieldAlert className="w-10 h-10 text-amber-500" />
        </div>
        
        <h2 className="text-2xl font-black text-zinc-900 dark:text-white mb-2">
          {t('pageLocked') || 'Page Locked'}
        </h2>
        <p className="text-zinc-500 dark:text-zinc-400 mb-8">
          {t('pageLockedDesc') || `You do not have access to the ${pageName} page. You can request access from an administrator or enter an unlock code if you have one.`}
        </p>

        {!showCodeInput ? (
          <div className="space-y-4">
            <button
              onClick={handleRequestAccess}
              disabled={isRequesting}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all disabled:opacity-50"
            >
              {isRequesting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Send size={18} />
                  {t('requestAccess') || 'Request Access'}
                </>
              )}
            </button>
            
            <button
              onClick={() => setShowCodeInput(true)}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white font-bold rounded-xl transition-all"
            >
              <Key size={18} />
              {t('enterUnlockCode') || 'Enter Unlock Code'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
              <input
                type="text"
                value={unlockCode}
                onChange={(e) => setUnlockCode(e.target.value)}
                placeholder={t('unlockCodePlaceholder') || 'Enter code here...'}
                className="w-full pl-10 pr-4 py-3 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
              />
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowCodeInput(false)}
                className="flex-1 py-3 px-4 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white font-bold rounded-xl transition-all"
              >
                {t('cancel') || 'Cancel'}
              </button>
              <button
                onClick={handleUnlock}
                disabled={isUnlocking || !unlockCode.trim()}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all disabled:opacity-50"
              >
                {isUnlocking ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  t('unlock') || 'Unlock'
                )}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};
