import React from 'react';
import { AlertCircle, X, Info, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '../utils';
import { motion, AnimatePresence } from 'motion/react';

export type ErrorType = 'error' | 'warning' | 'info' | 'success';

interface ErrorDisplayProps {
  type?: ErrorType;
  title?: string;
  message: string;
  details?: string;
  onClose?: () => void;
  className?: string;
  autoHide?: boolean;
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ 
  type = 'error', 
  title, 
  message, 
  details, 
  onClose, 
  className,
  autoHide = false
}) => {
  const [showDetails, setShowDetails] = React.useState(false);

  const styles = {
    error: {
      bg: 'bg-red-50 dark:bg-red-900/10',
      border: 'border-red-200 dark:border-red-800/50',
      text: 'text-red-800 dark:text-red-200',
      icon: <AlertCircle className="text-red-500" size={20} />,
      accent: 'bg-red-500'
    },
    warning: {
      bg: 'bg-amber-50 dark:bg-amber-900/10',
      border: 'border-amber-200 dark:border-amber-800/50',
      text: 'text-amber-800 dark:text-amber-200',
      icon: <AlertTriangle className="text-amber-500" size={20} />,
      accent: 'bg-amber-500'
    },
    info: {
      bg: 'bg-blue-50 dark:bg-blue-900/10',
      border: 'border-blue-200 dark:border-blue-800/50',
      text: 'text-blue-800 dark:text-blue-200',
      icon: <Info className="text-blue-500" size={20} />,
      accent: 'bg-blue-500'
    },
    success: {
      bg: 'bg-emerald-50 dark:bg-emerald-900/10',
      border: 'border-emerald-200 dark:border-emerald-800/50',
      text: 'text-emerald-800 dark:text-emerald-200',
      icon: <CheckCircle2 className="text-emerald-500" size={20} />,
      accent: 'bg-emerald-500'
    }
  };

  const currentStyle = styles[type];

  return (
    <motion.div 
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={cn(
        "relative overflow-hidden border rounded-2xl shadow-lg backdrop-blur-sm",
        currentStyle.bg,
        currentStyle.border,
        className
      )}
    >
      <div className={cn("absolute top-0 start-0 w-1 h-full", currentStyle.accent)} />
      
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-4">
          <div className="shrink-0 mt-0.5">
            {currentStyle.icon}
          </div>
          
          <div className="flex-1 min-w-0">
            {title && (
              <h4 className={cn("text-sm font-bold uppercase tracking-wider mb-1", currentStyle.text)}>
                {title}
              </h4>
            )}
            <p className={cn("text-sm leading-relaxed", currentStyle.text)}>
              {message}
            </p>
            
            {details && (
              <div className="mt-3">
                <button 
                  onClick={() => setShowDetails(!showDetails)}
                  className={cn(
                    "text-[10px] font-bold uppercase tracking-widest hover:opacity-70 transition-opacity flex items-center gap-1",
                    currentStyle.text
                  )}
                >
                  {showDetails ? 'Hide Details' : 'View Details'}
                </button>
                
                <AnimatePresence>
                  {showDetails && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-2 p-3 bg-black/5 dark:bg-white/5 rounded-xl font-mono text-[10px] break-all whitespace-pre-wrap opacity-70">
                        {details}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
          
          {onClose && (
            <button 
              onClick={onClose}
              className={cn("shrink-0 p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors", currentStyle.text)}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
};
