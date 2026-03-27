import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../utils';

interface LoadingOverlayProps {
  isVisible: boolean;
  message?: string;
  className?: string;
  blur?: boolean;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  isVisible,
  message,
  className,
  blur = true
}) => {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={cn(
            "absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 rounded-[inherit]",
            blur ? "backdrop-blur-sm bg-black/20" : "bg-black/40",
            className
          )}
        >
          <div className="relative">
            <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
            <div className="absolute inset-0 blur-xl bg-emerald-500/20 animate-pulse" />
          </div>
          {message && (
            <motion.p
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm font-medium text-white tracking-wide"
            >
              {message}
            </motion.p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
