import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Coffee, 
  MessageSquare, 
  ArrowRight, 
  X,
  Star
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useWelcomeAudio } from '../hooks/useWelcomeAudio';
import {
  markWelcomePopupShown,
  resolveWelcomeContextKey,
} from '../constants/welcomeFlow';
import { cn } from '../utils';

interface WelcomePopupProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Legacy alias preserved for older callers. The shared welcome flow now
   * exposes a single support CTA and falls back to `onDonate` if needed.
   */
  onDonate?: () => void;
  onSupport?: () => void;
  isSidebarCollapsed?: boolean;
}

export const WelcomePopup: React.FC<WelcomePopupProps> = ({
  isOpen,
  onClose,
  onDonate,
  onSupport,
  isSidebarCollapsed = false
}) => {
  const { user } = useAuth();
  const welcomeContextKey = React.useMemo(
    () => resolveWelcomeContextKey(user),
    [user]
  );
  const supportAction = onSupport || onDonate;

  useWelcomeAudio({
    isOpen,
    contextKey: welcomeContextKey,
  });

  React.useEffect(() => {
    if (!isOpen || !welcomeContextKey) {
      return;
    }

    /**
     * Persist the welcome cadence per authenticated user context so the popup
     * stays elegant on repeat visits while still reappearing after 24 hours.
     */
    markWelcomePopupShown(welcomeContextKey);
  }, [isOpen, welcomeContextKey]);

  const handleSupportClick = React.useCallback(() => {
    onClose();
    supportAction?.();
  }, [onClose, supportAction]);

  // Prevent body scroll when open
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className={cn("fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6", isSidebarCollapsed ? "md:ps-20" : "md:ps-64")}>
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
        />

        {/* Modal Content */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-[32px] shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800"
        >
          {/* Close Button */}
          <button 
            onClick={onClose}
            className="absolute top-6 right-6 p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors z-10"
          >
            <X size={20} className="text-zinc-400" />
          </button>

          <div className="p-8 md:p-10">
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-white">
                  <Star className="fill-white" size={24} />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Welcome to Zootopia Club</h2>
                  <p className="text-zinc-500 text-sm">Your premium AI-powered ecosystem.</p>
                </div>
              </div>

              {/* Developer Message Section */}
              <div className="space-y-4 p-6 rounded-[24px] bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center gap-2 mb-1">
                  <MessageSquare size={16} className="text-emerald-500" />
                  <h3 className="text-xs font-bold text-emerald-500 uppercase tracking-widest">Developer Message</h3>
                </div>
                
                <div className="space-y-4">
                  <p className="text-zinc-700 dark:text-zinc-300 text-sm leading-relaxed font-medium">
                    "This platform was designed, crafted, programmed, planned, and funded by the vision of Ebn Abdallah Yousef, Class of 2022, Faculty of Science, Chemistry-Zoology department. It represents a commitment to empowering students with advanced AI tools for their academic journey."
                  </p>
                  <p className="text-zinc-600 dark:text-zinc-400 text-sm leading-relaxed font-medium text-right" dir="rtl">
                    "تم تصميم وتصنيع وبرمجة وتخطيط وتمويل هذه المنصة برؤية ابن عبد الله يوسف، دفعة 2022، كلية العلوم، قسم الكيمياء والحيوان. إنها تمثل التزاماً بتمكين الطلاب بأدوات الذكاء الاصطناعي المتقدمة في رحلتهم الأكاديمية."
                  </p>
                  <p className="text-zinc-700 dark:text-zinc-300 text-sm leading-relaxed font-medium pt-2 border-t border-zinc-200 dark:border-zinc-800">
                    I am continuously crafting groundbreaking platforms, services, and useful projects. Connect with me and follow my journey at <a href="https://linktr.ee/ebnabdallah" target="_blank" rel="noopener noreferrer" className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline">linktr.ee/ebnabdallah</a> to stay updated and benefit from these developments.
                  </p>
                  <p className="text-zinc-600 dark:text-zinc-400 text-sm leading-relaxed font-medium text-right pt-2 border-t border-zinc-200 dark:border-zinc-800" dir="rtl">
                    أعمل باستمرار على تطوير منصات وخدمات ومشاريع مفيدة ومبتكرة. تواصل معي وتابع رحلتي عبر <a href="https://linktr.ee/ebnabdallah" target="_blank" rel="noopener noreferrer" className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline">linktr.ee/ebnabdallah</a> لتبقى على اطلاع دائم وتستفيد من هذه التطويرات.
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-3 pt-4">
                <button
                  onClick={onClose}
                  className="w-full px-6 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 group shadow-lg shadow-emerald-900/20"
                >
                  Continue to Platform
                  <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </button>
                
                {supportAction && (
                  <button
                    onClick={handleSupportClick}
                    className="w-full px-6 py-3.5 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-700 rounded-2xl font-bold text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-all flex items-center justify-center gap-2"
                  >
                    <Coffee size={18} className="text-amber-500" />
                    Support Zootopia Club
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
