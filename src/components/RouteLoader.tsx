import * as React from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { cn } from '../utils';

type RouteLoaderProps = {
  fullscreen?: boolean;
  compact?: boolean;
  label?: string;
  detail?: string;
  reason?: string;
  elapsedSeconds?: number;
};

export const RouteLoader: React.FC<RouteLoaderProps> = ({
  fullscreen = false,
  compact = false,
  label = 'Loading workspace',
  detail = 'Preparing the next view without blocking the rest of the app.',
  reason,
  elapsedSeconds,
}) => {
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-[2rem] border border-zinc-200/80 bg-white/70 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/50',
        fullscreen ? 'min-h-screen rounded-none border-0' : compact ? 'min-h-[180px]' : 'min-h-[320px]'
      )}
    >
      <div className="flex flex-col items-center gap-4 px-6 text-center">
        <div className="relative flex h-14 w-14 items-center justify-center rounded-[1.5rem] bg-emerald-500/10 text-emerald-500">
          <Sparkles size={22} className="opacity-80" />
          <Loader2 size={16} className="absolute -end-1 -bottom-1 animate-spin" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-zinc-700 dark:text-zinc-200">
            {label}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {detail}
          </p>
          {(reason || typeof elapsedSeconds === 'number') && (
            <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
              {reason ? (
                <span className="rounded-full border border-zinc-200 bg-zinc-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
                  {reason}
                </span>
              ) : null}
              {typeof elapsedSeconds === 'number' ? (
                <span className="rounded-full border border-emerald-200 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-600 dark:border-emerald-900/50 dark:text-emerald-300">
                  {elapsedSeconds}s elapsed
                </span>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
