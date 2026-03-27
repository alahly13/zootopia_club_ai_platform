import { useState, useCallback, useEffect } from 'react';
import { AppStatus, ErrorCategory, StatusState, Stage } from '../types/status';
import { classifyError } from '../utils/errorClassification';

export const useStatus = (initialStatus: AppStatus = 'idle') => {
  const [state, setState] = useState<StatusState>({
    status: initialStatus,
  });

  const [elapsed, setElapsed] = useState(0);

  const isRunningStatus = useCallback((status: AppStatus): boolean => {
    return ['processing', 'uploading', 'validating', 'queued'].includes(status);
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (state.startTime && isRunningStatus(state.status)) {
      interval = setInterval(() => {
        setElapsed(Math.floor((Date.now() - (state.startTime || 0)) / 1000));
      }, 1000);
    } else if (typeof state.durationMs === 'number') {
      setElapsed(Math.max(0, Math.floor(state.durationMs / 1000)));
    } else if (!state.startTime) {
      setElapsed(0);
    }
    return () => clearInterval(interval);
  }, [state.startTime, state.status, state.durationMs, isRunningStatus]);

  const setStatus = useCallback((status: AppStatus, message?: string) => {
    setState(prev => {
      const nextIsRunning = isRunningStatus(status);
      const prevIsRunning = isRunningStatus(prev.status);

      // Timing source-of-truth:
      // Start time is created at the first transition into a running state,
      // then preserved while running. When leaving running states, duration is
      // finalized once and kept stable for result/summary display.
      if (nextIsRunning) {
        const shouldStartFresh = !prev.startTime || !prevIsRunning;
        const nextStartTime = shouldStartFresh ? Date.now() : prev.startTime;

        return {
          ...prev,
          status,
          message,
          startTime: nextStartTime,
          endTime: undefined,
          durationMs: undefined,
        };
      }

      if (prevIsRunning && prev.startTime) {
        const endTime = Date.now();
        return {
          ...prev,
          status,
          message,
          endTime,
          durationMs: endTime - prev.startTime,
        };
      }

      return {
        ...prev,
        status,
        message,
      };
    });
  }, [isRunningStatus]);

  const setStages = useCallback((stages: Stage[]) => {
    setState(prev => ({ ...prev, stages }));
  }, []);

  const updateStage = useCallback((stageId: string, updates: Partial<Stage>) => {
    setState(prev => ({
      ...prev,
      stages: prev.stages?.map(s => s.id === stageId ? { ...s, ...updates } : s)
    }));
  }, []);

  const setProgress = useCallback((progress: number) => {
    setState(prev => ({ ...prev, progress }));
  }, []);

  const setError = useCallback((error: any, retryAction?: () => void) => {
    const classification = classifyError(error);
    const structured = error?.errorInfo || error?.details?.errorInfo;

    // Keep the generic status contract stable while enriching diagnostics payload.
    // This hook is the shared frontend boundary between user-safe copy and
    // developer-facing context (trace id, stage id, retryability). Do not append
    // raw stage/error metadata to the user-facing message; the compact tracker
    // and status cards should stay calm while diagnostics remain available in
    // technicalDetails and trace logs.
    setState(prev => {
      const finalizedAt = prev.startTime ? Date.now() : prev.endTime;
      return ({
      ...prev,
      status: classification.category === 'blocking_error' ? 'blocking_error' : 'recoverable_error',
      stages: prev.stages?.map(s => s.status === 'active' ? { ...s, status: 'failed' } : s),
      endTime: finalizedAt,
      durationMs: prev.startTime && finalizedAt ? finalizedAt - prev.startTime : prev.durationMs,
      error: {
        ...classification,
        message: classification.message,
        technicalDetails: structured
          ? JSON.stringify({
              traceId: structured.traceId,
              stage: structured.stage,
              code: structured.code,
              retryable: structured.retryable,
              rawMessage: error?.message,
            })
          : (error?.stack || String(error)),
        retryAction,
      },
      });
    });
  }, []);

  const reset = useCallback(() => {
    setState({ status: 'idle' });
    setElapsed(0);
  }, []);

  return {
    ...state,
    elapsed,
    setStatus,
    setStages,
    updateStage,
    setProgress,
    setError,
    reset,
    isIdle: state.status === 'idle',
    isLoading: ['processing', 'uploading', 'validating', 'queued'].includes(state.status),
    isError: state.status.includes('error') || state.status === 'timeout',
    isSuccess: state.status === 'success' || state.status === 'uploaded',
  };
};
