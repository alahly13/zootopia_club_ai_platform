import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../utils';
import { usePopupBlocker } from '../contexts/PopupOrchestratorContext';
import { POPUP_FLOW_PRIORITY, type PopupFlowPriority } from '../constants/popupFlows';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  isSidebarCollapsed?: boolean;
  flowId?: string;
  flowPriority?: PopupFlowPriority;
  canPreempt?: boolean;
  hideCloseButton?: boolean;
  closeOnBackdropClick?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  isSidebarCollapsed = false,
  flowId,
  flowPriority = POPUP_FLOW_PRIORITY.criticalBlocking,
  canPreempt = false,
  hideCloseButton = false,
  closeOnBackdropClick = true,
}) => {
  const generatedFlowId = React.useId();
  const resolvedFlowId = flowId || `shared-modal-${generatedFlowId}`;

  usePopupBlocker({
    id: resolvedFlowId,
    isActive: isOpen,
    priority: flowPriority,
    canPreempt,
  });

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn("fixed inset-0 bg-black/50 backdrop-blur-sm z-[100]", isSidebarCollapsed ? "md:ps-20" : "md:ps-64")}
            onClick={closeOnBackdropClick ? onClose : undefined}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={cn("fixed inset-0 flex items-center justify-center z-[100] p-4 pointer-events-none", isSidebarCollapsed ? "md:ps-20" : "md:ps-64")}
          >
            <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-zinc-200 dark:border-zinc-800 pointer-events-auto">
              {title && (
                <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
                  <h3 className="font-bold text-zinc-900 dark:text-white">{title}</h3>
                  {!hideCloseButton ? (
                    <button onClick={onClose} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">
                      <X size={20} className="text-zinc-500" />
                    </button>
                  ) : (
                    <div className="h-7 w-7" aria-hidden="true" />
                  )}
                </div>
              )}
              <div className="p-4">
                {children}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
