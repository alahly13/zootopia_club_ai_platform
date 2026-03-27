import * as React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../utils';

interface AuthSecondaryActionsPanelProps {
  title: string;
  description: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

/**
 * Keeps secondary auth actions compact so the primary login path remains
 * visually dominant on smaller screens while still giving users a clear,
 * discoverable way to access alternate entry flows.
 */
export const AuthSecondaryActionsPanel: React.FC<AuthSecondaryActionsPanelProps> = ({
  title,
  description,
  isOpen,
  onToggle,
  children,
}) => {
  return (
    <div className="rounded-[1.75rem] border border-white/15 bg-black/15 backdrop-blur-md shadow-lg shadow-black/10">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-start transition-colors hover:bg-white/5 sm:px-5"
      >
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/70">
            {title}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-white/55">
            {description}
          </p>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/70">
          <ChevronDown
            size={16}
            className={cn('transition-transform duration-300', isOpen && 'rotate-180')}
          />
        </div>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="space-y-2 border-t border-white/10 px-4 pb-4 pt-3 sm:px-5">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
