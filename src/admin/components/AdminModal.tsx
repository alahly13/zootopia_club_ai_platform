import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../utils';
import { useSidebar } from '../../components/SidebarContext';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: string;
  className?: string;
  showHeader?: boolean;
}

export const AdminModal: React.FC<AdminModalProps> = ({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  maxWidth = "max-w-lg",
  className,
  showHeader = true
}) => {
  const { isSidebarCollapsed } = useSidebar();
  
  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[110] flex">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <div className={cn(
            "relative flex-1 flex items-center justify-center p-4 transition-all duration-300",
            isSidebarCollapsed ? "md:ml-20" : "md:ml-64"
          )}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={cn(
                "relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[2.5rem] w-full shadow-2xl overflow-y-auto max-h-[90vh] custom-scrollbar",
                maxWidth,
                className,
                showHeader && "p-8"
              )}
            >
            {showHeader && (
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white">{title}</h3>
                <button onClick={onClose} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all cursor-pointer text-zinc-500">
                  <X size={20} />
                </button>
              </div>
            )}
            {children}
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
