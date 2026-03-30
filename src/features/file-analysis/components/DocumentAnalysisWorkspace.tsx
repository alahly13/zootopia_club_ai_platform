import * as React from 'react';
import { ArrowLeft, ArrowUpRight, Brain, CheckCircle2, Download, Eye, EyeOff, FileText, Loader2, Moon, Sparkles, Sun, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useDocument } from '../../../contexts/DocumentContext';
import { useDocumentAnalysisWorkspace } from '../hooks/useDocumentAnalysisWorkspace';
import { useAuth } from '../../../auth/AuthContext';
import { AI_MODELS } from '../../../constants/aiModels';
import { MasterConnectionSystem } from '../../../ai/services/masterConnectionSystem';
import { cn } from '../../../utils';
import ModelSelector from '../../../components/ModelSelector';
import { ProgressTracker } from '../../../components/status/ProgressTracker';
import { OperationMetaCard } from '../../../components/status/OperationMetaCard';
import { ResultPreview } from '../../../components/status/ResultPreview';
import { ResultPreviewContent } from '../../../components/status/ResultPreviewContent';
import CompactDocumentInfoBar from '../../../upload/CompactDocumentInfoBar';
import { isFacultyFastAccessUser } from '../../../constants/fastAccessPolicy';

interface DocumentAnalysisWorkspaceProps {
  variant?: 'inline' | 'page';
  onHide?: () => void;
  showFullPageAction?: boolean;
  showBackToGenerator?: boolean;
  className?: string;
}

/**
 * Shared analysis workspace used by both the inline assessment flow and the
 * dedicated full-page analysis route. Keep document analysis logic here so the
 * platform does not drift into two different analysis implementations.
 */
const DocumentAnalysisWorkspace: React.FC<DocumentAnalysisWorkspaceProps> = ({
  variant = 'inline',
  onHide,
  showFullPageAction = false,
  showBackToGenerator = false,
  className,
}) => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { user, getModelConfig } = useAuth();
  const {
    hasDocument,
    isDocumentSummaryVisible,
    toggleDocumentSummaryVisible,
    documentStatus,
    documentPreparationError,
  } = useDocument();
  const isPage = variant === 'page';
  const isFastAccessUser = isFacultyFastAccessUser(user);
  const {
    analysisResult,
    analysisTrace,
    analysisModelId,
    setAnalysisModelId,
    analysisPreviewPayload,
    normalizedAnalysisPreview,
    analysisPresentationStage,
    analysisOutputMetaRows,
    analysisStatusLabel,
    currentDisplayedFileName,
    analysisPreviewThemeMode,
    setAnalysisPreviewThemeMode,
    isPreviewOpen,
    setIsPreviewOpen,
    analysisExportAction,
    status,
    message,
    error,
    stages,
    elapsed,
    startTime,
    endTime,
    durationMs,
    isLoading,
    isError,
    runAnalysis,
    handleOpenDetached,
    handleExportPdf,
    handleExportMarkdown,
    extractedText,
  } = useDocumentAnalysisWorkspace({
    sourceTool: isPage ? 'analysis-page' : 'dashboard-analysis',
  });

  const activeModelLabel =
    (getModelConfig(analysisModelId) ||
      AI_MODELS.find((model) => model.id === analysisModelId) ||
      AI_MODELS[0])?.name || t('uploadUI.defaultModelName');

  if (!hasDocument) {
    return (
      <div
        className={cn(
          'rounded-4xl border border-dashed border-zinc-200/80 bg-white/80 p-6 text-center shadow-sm dark:border-zinc-800/80 dark:bg-zinc-950/45',
          className
        )}
      >
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-500/10 text-emerald-500">
          <Brain size={30} />
        </div>
        <h2 className="mt-4 text-xl font-black tracking-tight text-zinc-900 dark:text-white">
          {t('uploadUI.analysisWorkspaceTitle', { defaultValue: 'Analysis Workspace' })}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
          {t('uploadUI.analysisWorkspaceClosedHint', {
            defaultValue:
              'Upload a document from the standalone upload home, then open analysis here whenever you want a full-page view.',
          })}
        </p>
        <button
          type="button"
          onClick={() => navigate('/home')}
          className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-emerald-500/20 transition-all hover:bg-emerald-500"
        >
          <ArrowLeft size={16} />
          <span>
            {t('uploadUI.openUploadHomeAction', {
              defaultValue: 'Open upload home',
            })}
          </span>
        </button>
      </div>
    );
  }

  return (
    <>
      <section
        className={cn(
          'overflow-hidden rounded-4xl border border-zinc-200/80 bg-white/82 shadow-xl shadow-zinc-900/5 backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-950/55',
          className
        )}
      >
        <div className="border-b border-zinc-200/80 p-5 dark:border-zinc-800/80 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <Brain size={18} />
                <p className="text-[11px] font-black uppercase tracking-[0.22em]">
                  {t('uploadUI.analysisWorkspaceTitle', { defaultValue: 'Analysis Workspace' })}
                </p>
              </div>
              <div>
                <h2 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
                  {isPage
                    ? t('uploadUI.fullAnalysisTitle', { defaultValue: 'Document Analysis' })
                    : t('uploadUI.analysisWorkspaceTitle', { defaultValue: 'Analysis Workspace' })}
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                  {isPage
                    ? t('uploadUI.fullAnalysisHint', {
                        defaultValue:
                          'Use the full page to inspect the document, run analysis manually, and export the result without crowding the separate assessment workspace.',
                      })
                    : t('uploadUI.analysisWorkspaceHint', {
                        defaultValue:
                          'Choose a model, start analysis when ready, then continue into generation.',
                      })}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 size={13} />
                <span>{analysisStatusLabel}</span>
              </div>

              <button
                type="button"
                onClick={toggleDocumentSummaryVisible}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-100 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-600 transition-all hover:bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <EyeOff size={14} />
                <span>
                  {isDocumentSummaryVisible
                    ? t('uploadUI.hideFileCard', { defaultValue: 'Hide file' })
                    : t('uploadUI.showFileCard', { defaultValue: 'Show file' })}
                </span>
              </button>

              {showFullPageAction ? (
                <button
                  type="button"
                  onClick={() => navigate('/analysis')}
                  className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-100 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-600 transition-all hover:bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <ArrowUpRight size={14} />
                  <span>{t('uploadUI.openFullAnalysisPage', { defaultValue: 'Open full page' })}</span>
                </button>
              ) : null}

              {showBackToGenerator ? (
                <button
                  type="button"
                  onClick={() => navigate('/generate')}
                  className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-100 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-600 transition-all hover:bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <ArrowLeft size={14} />
                  <span>{t('uploadUI.backToAssessment', { defaultValue: 'Back to assessment' })}</span>
                </button>
              ) : null}

              {onHide ? (
                <button
                  type="button"
                  onClick={onHide}
                  className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white transition-all hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
                >
                  <EyeOff size={14} />
                  <span>{t('uploadUI.hideAnalysisPanel', { defaultValue: 'Hide analysis' })}</span>
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          <CompactDocumentInfoBar
            statusLabel={
              documentPreparationError
                ? t('uploadUI.documentPreparationFailed', {
                    defaultValue: 'Document preparation failed',
                  })
                : documentStatus === 'preparing'
                ? t('uploadUI.filePreparing', { defaultValue: 'Preparing file' })
                : analysisStatusLabel
            }
            statusTone={
              documentPreparationError
                ? 'error'
                : documentStatus === 'preparing'
                  ? 'warning'
                  : 'success'
            }
          />

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
            <div className="space-y-5">
              <div className="rounded-3xl border border-zinc-200/80 bg-zinc-50/90 p-4 dark:border-zinc-800/80 dark:bg-zinc-900/55">
                <div className="space-y-1">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
                    {t('uploadUI.analysisReadyToStart', { defaultValue: 'Ready to start' })}
                  </p>
                  <p className="text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {t('uploadUI.analysisManualStartHint', {
                      defaultValue:
                        'Analysis will not run until you choose a model and click the start button.',
                    })}
                  </p>
                </div>

                <div className="mt-4">
                  <ModelSelector
                    selectedModelId={analysisModelId}
                    onModelSelect={(id) => {
                      setAnalysisModelId(id);
                    }}
                    toolId="analyze"
                    label={t('analysisModel')}
                    filter={(model) =>
                      MasterConnectionSystem.getCompatibleModels('analyze').includes(model.id) &&
                      (!isFastAccessUser || ['Google', 'Qwen'].includes(model.provider))
                    }
                  />
                </div>

                <button
                  type="button"
                  onClick={() => runAnalysis(extractedText, currentDisplayedFileName)}
                  disabled={isLoading || !extractedText}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black uppercase tracking-[0.16em] text-white shadow-lg shadow-emerald-500/20 transition-all hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoading ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Zap size={18} />
                  )}
                  <span>{t('startAnalysis')}</span>
                </button>

                <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                  {t('uploadUI.modelReadingDocument', {
                    model: activeModelLabel,
                    defaultValue: `Selected model: ${activeModelLabel}`,
                  })}
                </p>
              </div>

              <OperationMetaCard
                trace={analysisTrace}
                status={status}
                startTime={startTime}
                endTime={endTime}
                durationMs={durationMs}
                elapsedSeconds={isLoading ? elapsed : undefined}
                outputMetaRows={analysisOutputMetaRows}
                title="Analysis Summary"
              />

              <ProgressTracker
                stages={stages}
                isVisible={isLoading || !!analysisTrace || Boolean(analysisResult) || isError}
                elapsedTime={elapsed}
                trace={analysisTrace}
                presentationStage={analysisPresentationStage}
                status={status}
                message={message}
                onRetry={error?.retryAction}
                title={t('generationPipeline')}
              />
            </div>

            <div className="space-y-4">
              <div className="flex flex-col gap-4 rounded-3xl border border-zinc-200/80 bg-white/90 p-4 dark:border-zinc-800/80 dark:bg-zinc-950/55">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-2 text-emerald-500">
                    <Sparkles size={16} />
                    <h3 className="text-xs font-black uppercase tracking-[0.18em]">
                      {t('uploadUI.aiInsights', { defaultValue: 'AI Insights' })}
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex items-center rounded-xl border border-zinc-200 bg-zinc-100 p-1 dark:border-zinc-800 dark:bg-zinc-900">
                      <button
                        type="button"
                        onClick={() => setAnalysisPreviewThemeMode('light')}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] transition-all',
                          analysisPreviewThemeMode === 'light'
                            ? 'bg-white text-zinc-700 shadow-sm'
                            : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
                        )}
                      >
                        <Sun size={12} />
                        <span>{t('light', { defaultValue: 'Light' })}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setAnalysisPreviewThemeMode('dark')}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] transition-all',
                          analysisPreviewThemeMode === 'dark'
                            ? 'bg-zinc-800 text-zinc-200 shadow-sm'
                            : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
                        )}
                      >
                        <Moon size={12} />
                        <span>{t('dark', { defaultValue: 'Dark' })}</span>
                      </button>
                    </div>

                    {analysisResult?.modelUsed ? (
                      <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-100 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-800">
                        <span className="text-[9px] font-black uppercase tracking-tighter text-zinc-500">
                          Model:
                        </span>
                        <span className="text-[9px] font-bold text-emerald-500">
                          {analysisResult.modelUsed}
                        </span>
                      </div>
                    ) : null}

                    {analysisResult?.text ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setIsPreviewOpen(true)}
                          className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-emerald-500/20 transition-all hover:bg-emerald-500"
                        >
                          <Eye size={14} />
                          <span>{t('preview', { defaultValue: 'Preview' })}</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleOpenDetached}
                          className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-100 px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.18em] text-zinc-600 transition-all hover:bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          <ArrowUpRight size={14} />
                          <span>{t('openSeparately', { defaultValue: 'Open Separately' })}</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleExportPdf}
                          disabled={Boolean(analysisExportAction)}
                          className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-100 px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.18em] text-zinc-600 transition-all hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          {analysisExportAction === 'pdf' ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Download size={14} />
                          )}
                          <span>
                            {analysisExportAction === 'pdf'
                              ? t('exporting', { defaultValue: 'Exporting' })
                              : t('downloadPDF', { defaultValue: 'Download PDF' })}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={handleExportMarkdown}
                          disabled={Boolean(analysisExportAction)}
                          className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-100 px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.18em] text-zinc-600 transition-all hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          {analysisExportAction === 'markdown' ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <FileText size={14} />
                          )}
                          <span>
                            {analysisExportAction === 'markdown'
                              ? t('exporting', { defaultValue: 'Exporting' })
                              : t('markdown', { defaultValue: 'Markdown' })}
                          </span>
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>

                <div
                  className={cn(
                    'min-h-80 overflow-hidden rounded-3xl border p-5 shadow-inner',
                    analysisPreviewThemeMode === 'dark'
                      ? 'border-zinc-800 bg-zinc-950/90'
                      : 'border-zinc-200 bg-zinc-50/90'
                  )}
                >
                  {isLoading ? (
                    <div className="flex h-full min-h-60 flex-col items-center justify-center gap-4 text-center">
                      <div className="relative">
                        <Loader2 className="animate-spin text-emerald-500" size={34} />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-[10px] font-bold text-emerald-600">{elapsed}s</span>
                        </div>
                      </div>
                      <p
                        className={cn(
                          'text-sm font-bold',
                          analysisPreviewThemeMode === 'dark' ? 'text-zinc-100' : 'text-zinc-900'
                        )}
                      >
                        {t('uploadUI.modelReadingDocument', {
                          model: activeModelLabel,
                          defaultValue: `Analyzing with ${activeModelLabel}`,
                        })}
                      </p>
                    </div>
                  ) : normalizedAnalysisPreview ? (
                    <div className="space-y-5">
                      <div
                        className={cn(
                          'rounded-2xl border p-4',
                          analysisPreviewThemeMode === 'dark'
                            ? 'border-zinc-700 bg-zinc-900'
                            : 'border-zinc-200 bg-white'
                        )}
                      >
                        <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-500">
                          <CheckCircle2 size={14} />
                          <span>{t('analysisReady', { defaultValue: 'Analysis Ready' })}</span>
                        </div>
                        <p
                          className={cn(
                            'mt-2 text-sm leading-relaxed',
                            analysisPreviewThemeMode === 'dark'
                              ? 'text-zinc-300'
                              : 'text-zinc-600'
                          )}
                        >
                          {normalizedAnalysisPreview.summary}
                        </p>
                      </div>

                      <ResultPreviewContent
                        preview={normalizedAnalysisPreview}
                        exportThemeMode={analysisPreviewThemeMode}
                      />
                    </div>
                  ) : (
                    <div className="flex h-full min-h-60 flex-col items-center justify-center gap-4 py-12 text-center opacity-75">
                      <div
                        className={cn(
                          'flex h-16 w-16 items-center justify-center rounded-full',
                          analysisPreviewThemeMode === 'dark'
                            ? 'bg-zinc-800 text-zinc-400'
                            : 'bg-zinc-200 text-zinc-500'
                        )}
                      >
                        <Brain size={30} />
                      </div>
                      <div className="space-y-1">
                        <p
                          className={cn(
                            'text-sm font-bold',
                            analysisPreviewThemeMode === 'dark'
                              ? 'text-zinc-100'
                              : 'text-zinc-900'
                          )}
                        >
                          {t('waitingForAction')}
                        </p>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">
                          {t('uploadUI.analysisManualStartHint', {
                            defaultValue:
                              'Analysis will not run until you choose a model and click the start button.',
                          })}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {analysisPreviewPayload ? (
        <ResultPreview
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          title={`Analysis: ${currentDisplayedFileName}`}
          type="text"
          data={analysisPreviewPayload}
          sourceTool={isPage ? 'analysis-page' : 'dashboard-analysis'}
          previewThemeMode={analysisPreviewThemeMode}
          onPreviewThemeModeChange={setAnalysisPreviewThemeMode}
        />
      ) : null}
    </>
  );
};

export default DocumentAnalysisWorkspace;
