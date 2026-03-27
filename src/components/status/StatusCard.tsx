import * as React from 'react';
import { 
  AlertCircle, 
  RefreshCw, 
  X, 
  CheckCircle2,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../utils';
import { AppStatus, ErrorCategory } from '../../types/status';

interface StatusCardProps {
  status: AppStatus;
  title?: string;
  message?: string;
  category?: ErrorCategory;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}

export const StatusCard: React.FC<StatusCardProps> = ({
  status,
  title,
  message,
  category,
  onRetry,
  onDismiss,
  className
}) => {
  const isError = status.includes('error') || status === 'timeout';
  const isSuccess = status === 'success' || status === 'uploaded';
  const isWarning = status === 'warning';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={cn(
          "relative p-4 rounded-2xl border flex gap-4 items-start transition-all",
          isError ? "bg-red-500/10 dark:bg-red-500/5 border-red-500/25 dark:border-red-500/20 text-red-700 dark:text-red-200" :
          isSuccess ? "bg-emerald-500/10 dark:bg-emerald-500/5 border-emerald-500/25 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-200" :
          isWarning ? "bg-amber-500/12 dark:bg-amber-500/5 border-amber-500/30 dark:border-amber-500/20 text-amber-800 dark:text-amber-200" :
          "bg-zinc-100 dark:bg-zinc-900/50 border-zinc-300 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300",
          className
        )}
      >
        <div className={cn(
          "mt-0.5 p-2 rounded-xl",
          isError ? "bg-red-500/10 text-red-500" :
          isSuccess ? "bg-emerald-500/10 text-emerald-500" :
          isWarning ? "bg-amber-500/10 text-amber-500" :
          "bg-zinc-800 text-zinc-400"
        )}>
          {isError ? <AlertCircle size={20} /> :
           isSuccess ? <CheckCircle2 size={20} /> :
           isWarning ? <AlertCircle size={20} /> :
           <Info size={20} />}
        </div>

        <div className="flex-1 space-y-1">
          {title && <h4 className="font-bold text-sm">{title}</h4>}
          {message && <p className="text-xs opacity-80 leading-relaxed">{message}</p>}
          
          {onRetry && isError && (
            <button
              onClick={onRetry}
              className="mt-3 flex items-center gap-2 text-xs font-bold text-red-600 dark:text-red-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
            >
              <RefreshCw size={14} />
              Try Again
            </button>
          )}
        </div>

        {onDismiss && (
          <button
            onClick={onDismiss}
            className="p-1 hover:bg-zinc-200 dark:hover:bg-white/5 rounded-lg transition-colors"
          >
            <X size={16} className="opacity-50" />
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  );
};
