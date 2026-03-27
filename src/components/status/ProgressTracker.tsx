import * as React from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { cn } from '../../utils';
import { useLanguage } from '../../contexts/LanguageContext';
import { AppStatus, Stage } from '../../types/status';
import { ExecutionTrace } from '../../ai/types';
import { useTrackingDiagnosticsAccess } from './useTrackingDiagnosticsAccess';

export type { Stage };

type LooseStage = Stage & {
  status?: Stage['status'] | 'loading' | 'success' | 'error';
  time?: number | null;
};

interface PresentationStageDescriptor {
  id?: string;
  label: string;
  status: Stage['status'];
  progress?: number;
  message?: string;
  durationMs?: number;
  details?: Record<string, unknown>;
}

interface ProgressTrackerProps {
  stages: LooseStage[];
  isVisible: boolean;
  elapsedTime: number;
  title?: string;
  trace?: ExecutionTrace | null;
  presentationStage?: PresentationStageDescriptor | null;
  status?: AppStatus;
  message?: string;
  onRetry?: () => void;
}

interface TrackerStageView {
  id: string;
  label: string;
  status: Stage['status'];
  progress?: number;
  durationMs?: number;
  message?: string;
  details?: Record<string, unknown>;
  source: 'lifecycle' | 'execution' | 'presentation';
}

type TrackerVisualState = 'idle' | 'running' | 'success' | 'error';

type TrackingCopy = {
  preparingFile: string;
  readingContent: string;
  preparingRequest: string;
  analyzingWithAI: string;
  generatingResults: string;
  finalizing: string;
  working: string;
  ready: string;
  completed: string;
  failed: string;
  uploadFailed: string;
  retry: string;
};

const TRACKING_COPY: Record<'en' | 'ar', TrackingCopy> = {
  en: {
    preparingFile: 'Preparing file...',
    readingContent: 'Reading content...',
    preparingRequest: 'Preparing...',
    analyzingWithAI: 'Analyzing with AI...',
    generatingResults: 'Generating results...',
    finalizing: 'Finalizing...',
    working: 'Working...',
    ready: 'Ready when you are.',
    completed: 'Completed successfully in',
    failed: 'Generation stopped. Please try again.',
    uploadFailed: 'Upload stopped. Please try again.',
    retry: 'Retry',
  },
  ar: {
    preparingFile: 'جارٍ تجهيز الملف...',
    readingContent: 'جارٍ قراءة المحتوى...',
    preparingRequest: 'جارٍ التحضير...',
    analyzingWithAI: 'جارٍ التحليل بالذكاء الاصطناعي...',
    generatingResults: 'جارٍ إنشاء النتائج...',
    finalizing: 'جارٍ الإنهاء...',
    working: 'جارٍ التنفيذ...',
    ready: 'جاهز عندما تكون مستعدًا.',
    completed: 'اكتمل بنجاح خلال',
    failed: 'توقفت العملية. يُرجى المحاولة مرة أخرى.',
    uploadFailed: 'توقف الرفع. يُرجى المحاولة مرة أخرى.',
    retry: 'إعادة المحاولة',
  },
};

const RUNNING_STATUSES = new Set<AppStatus>([
  'processing',
  'uploading',
  'validating',
  'queued',
  'acknowledged',
  'retrying',
]);

const SUCCESS_STATUSES = new Set<AppStatus>(['success', 'uploaded']);
const ERROR_STATUSES = new Set<AppStatus>(['recoverable_error', 'blocking_error', 'timeout']);

const formatTimer = (seconds: number): string => {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const formatElapsedSecondsLabel = (seconds: number): string => {
  return `${Math.max(0, seconds)}s`;
};

const formatDurationMsToElapsedSecondsLabel = (durationMs?: number): string => {
  if (!durationMs || durationMs <= 0) {
    return '0s';
  }

  return `${Math.max(1, Math.round(durationMs / 1000))}s`;
};

const formatDurationMs = (durationMs?: number): string => {
  if (!durationMs || durationMs <= 0) {
    return '00:00';
  }

  return formatTimer(Math.max(1, Math.round(durationMs / 1000)));
};

const normalizeStageStatus = (status?: string): Stage['status'] => {
  switch (status) {
    case 'active':
    case 'loading':
    case 'running':
      return 'active';
    case 'completed':
    case 'success':
      return 'completed';
    case 'failed':
    case 'error':
      return 'failed';
    default:
      return 'pending';
  }
};

const mapLifecycleStage = (stage: LooseStage): TrackerStageView => ({
  id: stage.id,
  label: stage.label,
  status: normalizeStageStatus(stage.status),
  progress: stage.progress,
  durationMs: typeof stage.durationMs === 'number'
    ? stage.durationMs
    : typeof stage.time === 'number'
      ? stage.time * 1000
      : undefined,
  message: stage.message,
  details: stage.details,
  source: 'lifecycle',
});

const mapExecutionStage = (stage: ExecutionTrace['stages'][number]): TrackerStageView => ({
  id: stage.id,
  label: stage.label,
  status: normalizeStageStatus(stage.status),
  durationMs: stage.durationMs,
  message: stage.message,
  details: stage.details,
  source: 'execution',
});

const mapPresentationStage = (stage: PresentationStageDescriptor): TrackerStageView => ({
  id: stage.id || 'presentation',
  label: stage.label,
  status: stage.status,
  progress: stage.progress,
  durationMs: stage.durationMs,
  message: stage.message,
  details: stage.details,
  source: 'presentation',
});

const resolveVisualState = (
  status: AppStatus | undefined,
  trace: ExecutionTrace | null | undefined,
  presentationStage: PresentationStageDescriptor | null | undefined,
  visibleStages: TrackerStageView[]
): TrackerVisualState => {
  if ((status && ERROR_STATUSES.has(status)) || trace?.status === 'failed' || presentationStage?.status === 'failed' || visibleStages.some((stage) => stage.status === 'failed')) {
    return 'error';
  }

  if ((status && SUCCESS_STATUSES.has(status)) || (trace?.status === 'success' && !visibleStages.some((stage) => stage.status === 'active')) || presentationStage?.status === 'completed') {
    return 'success';
  }

  if ((status && RUNNING_STATUSES.has(status)) || trace?.status === 'running' || visibleStages.some((stage) => stage.status === 'active')) {
    return 'running';
  }

  return 'idle';
};

const resolveActiveStage = (
  lifecycleStages: TrackerStageView[],
  executionStages: TrackerStageView[],
  deliveryStages: TrackerStageView[]
): TrackerStageView | undefined => {
  return [...deliveryStages, ...executionStages, ...lifecycleStages].find((stage) => stage.status === 'active');
};

const getStageSearchText = (stage?: TrackerStageView | null): string => {
  if (!stage) {
    return '';
  }

  return `${stage.id} ${stage.label} ${stage.message || ''}`.toLowerCase();
};

const resolveRunningMessage = (
  stage: TrackerStageView | undefined | null,
  fallbackMessage: string | undefined,
  copy: TrackingCopy
): string => {
  if (stage?.message?.trim()) {
    return stage.message;
  }

  if (stage?.label?.trim()) {
    return stage.label;
  }

  if (fallbackMessage?.trim()) {
    return fallbackMessage;
  }

  const stageText = `${getStageSearchText(stage)} ${String(fallbackMessage || '').toLowerCase()}`;

  if (/(upload|prepare file|selected file)/.test(stageText)) {
    return copy.preparingFile;
  }

  if (/(extract|read|ocr|processing file|processing material|content|document|material)/.test(stageText)) {
    return copy.readingContent;
  }

  if (/(validate|cache|resolve|route|build|prompt|send|dispatch|request|connection)/.test(stageText)) {
    return copy.preparingRequest;
  }

  if (/(provider|generate|analyz|model|question|summary|reply|response|study|image|infographic|video|chat)/.test(stageText)) {
    return copy.analyzingWithAI;
  }

  if (/(render|display|result|structure|format|preview)/.test(stageText)) {
    return copy.generatingResults;
  }

  if (/(final|complete|delivery)/.test(stageText)) {
    return copy.finalizing;
  }

  return copy.working;
};

const resolveFriendlyMessage = (
  visualState: TrackerVisualState,
  params: {
    activeStage?: TrackerStageView;
    failedStage?: TrackerStageView;
    fallbackMessage?: string;
    elapsedLabel: string;
  },
  copy: TrackingCopy
): string => {
  if (visualState === 'success') {
    return `${copy.completed} ${params.elapsedLabel}`;
  }

  if (visualState === 'error') {
    if (params.failedStage?.message?.trim()) {
      return params.failedStage.message;
    }

    if (params.failedStage?.label?.trim()) {
      return params.failedStage.label;
    }

    const failureText = getStageSearchText(params.failedStage);
    if (/(upload|file)/.test(failureText)) {
      return copy.uploadFailed;
    }

    return copy.failed;
  }

  if (visualState === 'running') {
    return resolveRunningMessage(params.activeStage, params.fallbackMessage, copy);
  }

  return copy.ready;
};

const getReliableProgress = (
  visualState: TrackerVisualState,
  activeStage?: TrackerStageView,
  presentationStage?: PresentationStageDescriptor | null
): number | null => {
  if (visualState !== 'running') {
    return null;
  }

  const candidates = [
    {
      progress: presentationStage?.progress,
      reliable: presentationStage?.details?.progressReliable !== false,
    },
    {
      progress: activeStage?.progress,
      reliable: activeStage?.details?.progressReliable !== false,
    },
  ];

  for (const candidate of candidates) {
    if (!candidate.reliable || typeof candidate.progress !== 'number') {
      continue;
    }

    return Math.min(100, Math.max(0, candidate.progress));
  }

  return null;
};

const formatDiagnosticsValue = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (value == null) {
    return '--';
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const getDiagnosticsRows = (trace?: ExecutionTrace | null): Array<{ label: string; value: string }> => {
  if (!trace) {
    return [];
  }

  return [
    { label: 'Trace', value: trace.traceId },
    { label: 'Operation', value: trace.operationMeta?.operationId || '--' },
    { label: 'Tool', value: trace.operationMeta?.toolName || trace.toolId || '--' },
    { label: 'Model', value: trace.provider?.modelResolved || trace.provider?.modelRequested || trace.resultMeta?.modelUsed || '--' },
    { label: 'Provider', value: trace.provider?.family || trace.resultMeta?.providerFamily || '--' },
    { label: 'Cache', value: trace.cache?.status || '--' },
    { label: 'Fallback', value: trace.fallback?.attempted ? (trace.fallback.usedModelId || 'attempted') : '--' },
    { label: 'Failure', value: trace.failure?.code || trace.failure?.category || '--' },
  ].filter((row) => row.value !== '--');
};

export const ProgressTracker: React.FC<ProgressTrackerProps> = ({
  stages,
  isVisible,
  elapsedTime,
  trace,
  presentationStage,
  status,
  message,
  onRetry,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const { language } = useLanguage();
  const { canAccessDiagnostics, diagnosticsEnabled, toggleDiagnostics } = useTrackingDiagnosticsAccess();
  const trackingCopy = language === 'ar' ? TRACKING_COPY.ar : TRACKING_COPY.en;

  const lifecycleStages = React.useMemo(() => stages.map(mapLifecycleStage), [stages]);
  const executionStages = React.useMemo(() => (trace?.stages || []).map(mapExecutionStage), [trace]);
  const deliveryStages = React.useMemo(
    () => (presentationStage ? [mapPresentationStage(presentationStage)] : []),
    [presentationStage]
  );

  const visibleStages = React.useMemo(
    () => [...lifecycleStages, ...executionStages, ...deliveryStages],
    [deliveryStages, executionStages, lifecycleStages]
  );

  const activeStage = React.useMemo(
    () => resolveActiveStage(lifecycleStages, executionStages, deliveryStages),
    [deliveryStages, executionStages, lifecycleStages]
  );

  const failedStage = React.useMemo(
    () => [...deliveryStages, ...executionStages, ...lifecycleStages].find((stage) => stage.status === 'failed'),
    [deliveryStages, executionStages, lifecycleStages]
  );

  const visualState = resolveVisualState(status, trace, presentationStage, visibleStages);
  const elapsedLabel =
    visualState === 'success' || visualState === 'error'
      ? trace?.elapsedMs !== undefined
        ? formatDurationMsToElapsedSecondsLabel(trace.elapsedMs)
        : formatElapsedSecondsLabel(elapsedTime)
      : formatElapsedSecondsLabel(elapsedTime);
  const progressValue = getReliableProgress(visualState, activeStage, presentationStage);
  const friendlyMessage = resolveFriendlyMessage(visualState, {
    activeStage,
    failedStage,
    fallbackMessage: message,
    elapsedLabel,
  }, trackingCopy);
  const diagnosticsRows = React.useMemo(() => getDiagnosticsRows(trace), [trace]);

  const handleTimerDoubleClick = React.useCallback(() => {
    if (!canAccessDiagnostics) {
      return;
    }

    /**
     * Hidden admin/dev affordance:
     * Keep diagnostics out of the normal user surface, but allow trusted users
     * to reopen the deeper trace panel without reintroducing default clutter.
     */
    toggleDiagnostics();
  }, [canAccessDiagnostics, toggleDiagnostics]);

  return (
    <AnimatePresence initial={false}>
      {isVisible && (
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
          animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.2, ease: 'easeOut' }}
          className="w-full"
        >
          <div className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white/88 shadow-sm backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/65">
            <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center">
                {visualState === 'success' ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" aria-hidden="true" />
                ) : visualState === 'error' ? (
                  <AlertCircle className="h-5 w-5 text-red-500" aria-hidden="true" />
                ) : (
                  <Loader2 className="h-5 w-5 animate-spin text-emerald-500" aria-hidden="true" />
                )}
              </div>

              <div className="min-w-0 flex-1 space-y-2">
                <p
                  role="status"
                  aria-live={visualState === 'error' ? 'assertive' : 'polite'}
                  className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50"
                >
                  {friendlyMessage}
                </p>

                {visualState === 'running' && typeof progressValue === 'number' ? (
                  <div className="relative h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800" aria-hidden="true">
                    <motion.div
                      initial={false}
                      animate={{ width: `${progressValue}%` }}
                      transition={{ duration: prefersReducedMotion ? 0 : 0.25, ease: 'easeOut' }}
                      className="h-full rounded-full bg-emerald-500"
                    />
                  </div>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                {visualState === 'error' && onRetry && (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-semibold text-zinc-700 transition-colors hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:text-white"
                  >
                    {trackingCopy.retry}
                  </button>
                )}

                <span
                  onDoubleClick={handleTimerDoubleClick}
                  className={cn(
                    'shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold tabular-nums',
                    visualState === 'error'
                      ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300'
                      : visualState === 'success'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200'
                  )}
                >
                  {elapsedLabel}
                </span>
              </div>
            </div>
          </div>

          {diagnosticsEnabled && (diagnosticsRows.length > 0 || visibleStages.length > 0) && (
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, height: 0 }}
              animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.2, ease: 'easeOut' }}
              className="mt-3 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50/90 p-4 text-[11px] dark:border-zinc-800 dark:bg-zinc-950/70"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">Tracking Diagnostics</p>
                <button
                  type="button"
                  onClick={toggleDiagnostics}
                  className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 font-semibold text-zinc-600 transition-colors hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:text-white"
                >
                  Hide
                </button>
              </div>

              {diagnosticsRows.length > 0 && (
                <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
                  {diagnosticsRows.map((row) => (
                    <div key={row.label} className="rounded-xl border border-zinc-200 bg-white/85 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/70">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{row.label}</p>
                      <p className="mt-1 break-all font-mono text-zinc-800 dark:text-zinc-100">{row.value}</p>
                    </div>
                  ))}
                </div>
              )}

              {visibleStages.length > 0 && (
                <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
                  {visibleStages.map((stage) => (
                    <div key={`${stage.source}-${stage.id}`} className="rounded-xl border border-zinc-200 bg-white/85 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/70">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-zinc-800 dark:text-zinc-100">{stage.label}</p>
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                          {stage.status}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-3 text-zinc-500 dark:text-zinc-400">
                        <span>Source: {stage.source}</span>
                        {typeof stage.durationMs === 'number' && <span>Duration: {formatDurationMs(stage.durationMs)}</span>}
                        {typeof stage.progress === 'number' && <span>Progress: {stage.progress}%</span>}
                      </div>
                      {stage.message && (
                        <p className="mt-1 text-zinc-600 dark:text-zinc-300">{stage.message}</p>
                      )}
                      {stage.details && Object.keys(stage.details).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {Object.entries(stage.details).map(([key, value]) => (
                            <span
                              key={key}
                              className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                            >
                              {key}: {formatDiagnosticsValue(value)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
