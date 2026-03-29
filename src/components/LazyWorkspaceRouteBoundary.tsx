import * as React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { ErrorBoundary } from './ErrorBoundary';
import { RouteLoader } from './RouteLoader';
import { cn } from '../utils';
import { logger } from '../utils/logger';
import { useLoadLifecycle } from '../hooks/useLoadLifecycle';
import { runtimeTimeouts } from '../config/runtime';

const DEFAULT_ROUTE_TIMEOUT_MS = runtimeTimeouts.routeLoadMs;
const ROUTE_IMPORT_PREPARING_MS = 500;

type LazyWorkspaceRouteBoundaryProps = {
  children: React.ReactNode;
  routeId: string;
  routeLabel?: string;
  fullscreen?: boolean;
  timeoutMs?: number;
};

const RouteResolvedSignal: React.FC<{
  routeId: string;
  onResolved: () => void;
}> = ({ routeId, onResolved }) => {
  React.useEffect(() => {
    logger.debug('Workspace route resolved', {
      area: 'routing',
      event: 'workspace-route-resolved',
      routeId,
    });
    onResolved();
  }, [onResolved, routeId]);

  return null;
};

const TimedRouteLoader: React.FC<{
  routeId: string;
  routeLabel: string;
  fullscreen?: boolean;
  timeoutMs: number;
  elapsedSeconds: number;
  onProgressed: () => void;
  onTimeout: () => void;
}> = ({
  routeId,
  routeLabel,
  fullscreen = false,
  timeoutMs,
  elapsedSeconds,
  onProgressed,
  onTimeout,
}) => {
  React.useEffect(() => {
    const progressId = window.setTimeout(() => {
      onProgressed();
    }, ROUTE_IMPORT_PREPARING_MS);

    const timeoutId = window.setTimeout(() => {
      logger.warn('Workspace route loading timed out', {
        area: 'routing',
        event: 'workspace-route-timeout',
        routeId,
        timeoutMs,
      });
      onTimeout();
    }, timeoutMs);

    return () => {
      window.clearTimeout(progressId);
      window.clearTimeout(timeoutId);
    };
  }, [onProgressed, onTimeout, routeId, timeoutMs]);

  return (
    <RouteLoader
      fullscreen={fullscreen}
      label={`Loading ${routeLabel}`}
      detail={`Preparing the ${routeLabel.toLowerCase()} workspace so it can render without blocking the rest of the platform.`}
      reason="route import"
      elapsedSeconds={elapsedSeconds}
    />
  );
};

const RouteLoadErrorState: React.FC<{
  routeId: string;
  routeLabel: string;
  fullscreen?: boolean;
  onRetry: () => void;
  reason: 'timeout' | 'error';
  elapsedSeconds: number;
}> = ({ routeId, routeLabel, fullscreen = false, onRetry, reason, elapsedSeconds }) => {
  const title =
    reason === 'timeout'
      ? `${routeLabel} is taking longer than expected`
      : `${routeLabel} failed to load`;
  const description =
    reason === 'timeout'
      ? 'The route import did not complete in time. Retry loading this workspace without refreshing the whole platform.'
      : 'This workspace hit an unexpected route-loading error. Retry the route or refresh if the problem persists.';

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-[2rem] border border-amber-200/80 bg-white/75 p-6 backdrop-blur-sm dark:border-amber-900/40 dark:bg-zinc-900/60',
        fullscreen ? 'min-h-screen rounded-none border-0 px-8' : 'min-h-[320px]'
      )}
    >
      <div className="w-full max-w-lg rounded-[2rem] border border-amber-300/60 bg-amber-50/80 p-6 text-center shadow-lg shadow-amber-900/5 dark:border-amber-900/50 dark:bg-amber-950/20">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[1.25rem] bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <AlertTriangle size={24} />
        </div>
        <h2 className="text-sm font-black uppercase tracking-[0.18em] text-amber-900 dark:text-amber-200">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-amber-800/90 dark:text-amber-200/80">
          {description}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <span className="rounded-full border border-amber-300/70 bg-white/70 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-amber-700 dark:border-amber-800/70 dark:bg-zinc-950/40 dark:text-amber-300">
            route import
          </span>
          <span className="rounded-full border border-amber-300/70 bg-white/70 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-amber-700 dark:border-amber-800/70 dark:bg-zinc-950/40 dark:text-amber-300">
            {elapsedSeconds}s elapsed
          </span>
        </div>
        <div className="mt-5 flex items-center justify-center">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-white transition-all hover:bg-emerald-500"
          >
            <RefreshCw size={14} />
            Retry Workspace
          </button>
        </div>
        <p className="mt-4 text-[11px] text-amber-700/80 dark:text-amber-300/70">
          Route: {routeId}
        </p>
      </div>
    </div>
  );
};

/**
 * Keep lazy route loading observable and bounded. Suspense alone can leave a
 * route parked on the workspace loader forever when a dynamic import stalls,
 * so this boundary adds timeout diagnostics plus a local retry path without
 * forcing a full-app reload.
 */
export const LazyWorkspaceRouteBoundary: React.FC<LazyWorkspaceRouteBoundaryProps> = ({
  children,
  routeId,
  routeLabel,
  fullscreen = false,
  timeoutMs = DEFAULT_ROUTE_TIMEOUT_MS,
}) => {
  const [attempt, setAttempt] = React.useState(0);
  const [timedOut, setTimedOut] = React.useState(false);
  const routeDisplayLabel = routeLabel || routeId;
  const { elapsedSeconds, setPhase } = useLoadLifecycle();

  React.useEffect(() => {
    setTimedOut(false);
    setPhase({
      phase: 'preparing',
      reason: `Opening ${routeDisplayLabel}`,
      message: `Preparing the ${routeDisplayLabel.toLowerCase()} workspace.`,
    });
    logger.debug('Workspace route load started', {
      area: 'routing',
      event: 'workspace-route-load-started',
      routeId,
      attempt,
    });
  }, [attempt, routeDisplayLabel, routeId, setPhase]);

  const handleRetry = React.useCallback(() => {
    logger.info('Retrying workspace route load', {
      area: 'routing',
      event: 'workspace-route-load-retry',
      routeId,
      attempt: attempt + 1,
    });
    setTimedOut(false);
    setAttempt((current) => current + 1);
  }, [attempt, routeId]);

  const handleResolved = React.useCallback(() => {
    setTimedOut(false);
    setPhase({
      phase: 'ready',
      reason: `${routeDisplayLabel} ready`,
      message: `${routeDisplayLabel} finished loading.`,
      preserveElapsed: true,
    });
  }, [routeDisplayLabel, setPhase]);

  const handleProgressed = React.useCallback(() => {
    setPhase({
      phase: 'loading',
      reason: `Loading ${routeDisplayLabel}`,
      message: `Loading the ${routeDisplayLabel.toLowerCase()} workspace bundle.`,
      preserveElapsed: true,
    });
  }, [routeDisplayLabel, setPhase]);

  const handleTimeout = React.useCallback(() => {
    setTimedOut(true);
    setPhase({
      phase: 'failed',
      reason: `${routeDisplayLabel} timed out`,
      message: `The ${routeDisplayLabel.toLowerCase()} workspace did not finish loading in time.`,
      preserveElapsed: true,
    });
  }, [routeDisplayLabel, setPhase]);

  return (
    <ErrorBoundary
      key={`${routeId}:${attempt}`}
      fallback={
        <RouteLoadErrorState
          routeId={routeId}
          routeLabel={routeDisplayLabel}
          fullscreen={fullscreen}
          onRetry={handleRetry}
          reason="error"
          elapsedSeconds={elapsedSeconds}
        />
      }
    >
      <React.Suspense
        fallback={
          timedOut ? (
            <RouteLoadErrorState
              routeId={routeId}
              routeLabel={routeDisplayLabel}
              fullscreen={fullscreen}
              onRetry={handleRetry}
              reason="timeout"
              elapsedSeconds={elapsedSeconds}
            />
          ) : (
            <TimedRouteLoader
              routeId={routeId}
              routeLabel={routeDisplayLabel}
              fullscreen={fullscreen}
              timeoutMs={timeoutMs}
              elapsedSeconds={elapsedSeconds}
              onProgressed={handleProgressed}
              onTimeout={handleTimeout}
            />
          )
        }
      >
        <React.Fragment key={`${routeId}:${attempt}`}>
          <RouteResolvedSignal routeId={routeId} onResolved={handleResolved} />
          {children}
        </React.Fragment>
      </React.Suspense>
    </ErrorBoundary>
  );
};
