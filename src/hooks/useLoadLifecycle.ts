import * as React from 'react';

export type LoadPhase = 'idle' | 'preparing' | 'loading' | 'ready' | 'failed';

type SetLoadPhaseInput = {
  phase: LoadPhase;
  reason?: string;
  message?: string;
  preserveElapsed?: boolean;
};

type LoadLifecycleState = {
  phase: LoadPhase;
  reason: string;
  message: string;
  startedAt: number | null;
  elapsedMs: number;
};

const ACTIVE_PHASES: LoadPhase[] = ['preparing', 'loading'];

export const useLoadLifecycle = (initialPhase: LoadPhase = 'idle') => {
  const [state, setState] = React.useState<LoadLifecycleState>({
    phase: initialPhase,
    reason: '',
    message: '',
    startedAt: ACTIVE_PHASES.includes(initialPhase) ? Date.now() : null,
    elapsedMs: 0,
  });

  React.useEffect(() => {
    if (!ACTIVE_PHASES.includes(state.phase) || !state.startedAt) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setState((current) => {
        if (!current.startedAt || !ACTIVE_PHASES.includes(current.phase)) {
          return current;
        }

        return {
          ...current,
          elapsedMs: Date.now() - current.startedAt,
        };
      });
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [state.phase, state.startedAt]);

  const setPhase = React.useCallback(
    ({ phase, reason = '', message = '', preserveElapsed = false }: SetLoadPhaseInput) => {
      setState((current) => {
        const nextStartedAt = ACTIVE_PHASES.includes(phase)
          ? preserveElapsed && current.startedAt
            ? current.startedAt
            : Date.now()
          : current.startedAt;

        const nextElapsedMs =
          ACTIVE_PHASES.includes(phase) || !nextStartedAt
            ? preserveElapsed
              ? current.elapsedMs
              : 0
            : Math.max(current.elapsedMs, Date.now() - nextStartedAt);

        return {
          phase,
          reason,
          message,
          startedAt: nextStartedAt,
          elapsedMs: nextElapsedMs,
        };
      });
    },
    []
  );

  const reset = React.useCallback(() => {
    setState({
      phase: 'idle',
      reason: '',
      message: '',
      startedAt: null,
      elapsedMs: 0,
    });
  }, []);

  return {
    ...state,
    elapsedSeconds: Math.max(0, Math.floor(state.elapsedMs / 1000)),
    isPreparing: state.phase === 'preparing',
    isLoading: state.phase === 'loading',
    isWorking: ACTIVE_PHASES.includes(state.phase),
    isReady: state.phase === 'ready',
    isFailed: state.phase === 'failed',
    setPhase,
    reset,
  };
};
