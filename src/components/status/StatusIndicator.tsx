import * as React from 'react';
import { 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle, 
  Loader2, 
  RefreshCw, 
  Clock, 
  XCircle,
  Info
} from 'lucide-react';
import { cn } from '../../utils';
import { AppStatus } from '../../types/status';

interface StatusIndicatorProps {
  status: AppStatus;
  message?: string;
  className?: string;
  showIcon?: boolean;
  elapsedSeconds?: number;
  durationMs?: number;
}

const RUNNING_STATUSES = new Set<AppStatus>([
  'processing',
  'uploading',
  'validating',
  'queued',
  'acknowledged',
  'retrying',
]);

const formatSeconds = (seconds: number): string => {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  if (minutes === 0) {
    return `${remainingSeconds}s`;
  }

  return `${minutes}m ${remainingSeconds.toString().padStart(2, '0')}s`;
};

const formatDuration = (durationMs: number): string => {
  return formatSeconds(Math.max(1, Math.round(durationMs / 1000)));
};

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({ 
  status, 
  message, 
  className,
  showIcon = true,
  elapsedSeconds,
  durationMs,
}) => {
  const getStatusConfig = (status: AppStatus) => {
    switch (status) {
      case 'success':
      case 'uploaded':
        return {
          icon: <CheckCircle2 className="w-4 h-4" />,
          color: 'text-emerald-500',
          bgColor: 'bg-emerald-500/10',
          borderColor: 'border-emerald-500/20',
          label: 'Success'
        };
      case 'recoverable_error':
      case 'warning':
        return {
          icon: <AlertTriangle className="w-4 h-4" />,
          color: 'text-amber-500',
          bgColor: 'bg-amber-500/10',
          borderColor: 'border-amber-500/20',
          label: 'Warning'
        };
      case 'blocking_error':
      case 'timeout':
        return {
          icon: <XCircle className="w-4 h-4" />,
          color: 'text-red-500',
          bgColor: 'bg-red-500/10',
          borderColor: 'border-red-500/20',
          label: 'Error'
        };
      case 'processing':
      case 'uploading':
      case 'validating':
        return {
          icon: <Loader2 className="w-4 h-4 animate-spin" />,
          color: 'text-emerald-500',
          bgColor: 'bg-emerald-500/5',
          borderColor: 'border-emerald-500/20',
          label: 'Processing'
        };
      case 'retrying':
        return {
          icon: <RefreshCw className="w-4 h-4 animate-spin" />,
          color: 'text-indigo-500',
          bgColor: 'bg-indigo-500/10',
          borderColor: 'border-indigo-500/20',
          label: 'Retrying'
        };
      case 'queued':
      case 'acknowledged':
        return {
          icon: <Clock className="w-4 h-4" />,
          color: 'text-zinc-400',
          bgColor: 'bg-zinc-400/10',
          borderColor: 'border-zinc-400/20',
          label: 'Queued'
        };
      default:
        return {
          icon: <Info className="w-4 h-4" />,
          color: 'text-zinc-400',
          bgColor: 'bg-zinc-400/10',
          borderColor: 'border-zinc-400/20',
          label: 'Idle'
        };
    }
  };

  const config = getStatusConfig(status);
  const showLiveTimer = RUNNING_STATUSES.has(status) && typeof elapsedSeconds === 'number' && elapsedSeconds >= 0;
  const showDuration = !RUNNING_STATUSES.has(status) && typeof durationMs === 'number' && durationMs > 0;
  const timerLabel = showLiveTimer
    ? `Live ${formatSeconds(elapsedSeconds)}`
    : showDuration
      ? `Total ${formatDuration(durationMs)}`
      : null;

  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-300",
      config.bgColor,
      config.color,
      config.borderColor,
      className
    )}>
      {showIcon && config.icon}
      <span>{message || config.label}</span>
      {timerLabel && (
        <span className="rounded-full border border-current/10 bg-white/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide dark:bg-zinc-950/30">
          {timerLabel}
        </span>
      )}
    </div>
  );
};
