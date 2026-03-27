import * as React from 'react';
import { AlertTriangle, LogOut, RefreshCw } from 'lucide-react';
import { cn } from '../utils';

type AppStartupRecoveryProps = {
  title: string;
  message: string;
  detail?: string;
  onRetry?: () => void | Promise<void>;
  onClearSession?: () => void | Promise<void>;
  retryLabel?: string;
  clearSessionLabel?: string;
  tone?: 'warning' | 'error';
};

/**
 * Shared startup recovery surface for boot-time failures.
 *
 * Keep this component independent from auth/theme/language providers so it can
 * render even when the provider tree itself is the source of the failure.
 */
export const AppStartupRecovery: React.FC<AppStartupRecoveryProps> = ({
  title,
  message,
  detail,
  onRetry,
  onClearSession,
  retryLabel = 'Retry Startup',
  clearSessionLabel = 'Reset Session',
  tone = 'warning',
}) => {
  const isErrorTone = tone === 'error';

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-10 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl items-center justify-center">
        <div
          className={cn(
            'w-full rounded-[2rem] border p-8 shadow-2xl backdrop-blur-xl sm:p-10',
            isErrorTone
              ? 'border-red-200 bg-white/92 shadow-red-950/10 dark:border-red-950/40 dark:bg-zinc-950/88'
              : 'border-amber-200 bg-white/92 shadow-amber-950/10 dark:border-amber-950/40 dark:bg-zinc-950/88'
          )}
        >
          <div className="flex flex-col gap-6">
            <div className="flex items-start gap-4">
              <div
                className={cn(
                  'flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.25rem]',
                  isErrorTone
                    ? 'bg-red-500/12 text-red-600 dark:text-red-300'
                    : 'bg-amber-500/12 text-amber-600 dark:text-amber-300'
                )}
              >
                <AlertTriangle size={26} />
              </div>

              <div className="space-y-2">
                <p
                  className={cn(
                    'text-[11px] font-black uppercase tracking-[0.24em]',
                    isErrorTone
                      ? 'text-red-700 dark:text-red-300'
                      : 'text-amber-700 dark:text-amber-300'
                  )}
                >
                  Startup Recovery
                </p>
                <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{title}</h1>
                <p className="max-w-2xl text-sm leading-7 text-zinc-600 dark:text-zinc-300">
                  {message}
                </p>
              </div>
            </div>

            {detail ? (
              <div className="rounded-[1.35rem] border border-zinc-200/90 bg-zinc-100/80 px-4 py-3 text-xs leading-6 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-300">
                {detail}
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row">
              {onRetry ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-white transition-all hover:bg-emerald-500"
                >
                  <RefreshCw size={16} />
                  {retryLabel}
                </button>
              ) : null}

              {onClearSession ? (
                <button
                  type="button"
                  onClick={onClearSession}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-300 bg-white px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-zinc-700 transition-all hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  <LogOut size={16} />
                  {clearSessionLabel}
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-300 bg-transparent px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-zinc-600 transition-all hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                <RefreshCw size={16} />
                Reload Page
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
