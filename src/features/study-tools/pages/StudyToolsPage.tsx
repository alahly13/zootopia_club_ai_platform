import * as React from 'react';
import { useState } from 'react';
import { 
  BookOpen, 
  Brain, 
  Layers, 
  FileText, 
  Map as MapIcon, 
  Lightbulb,
  ChevronRight,
  Loader2,
  Sparkles
} from 'lucide-react';
import { cn } from '../../../utils';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../../../auth/AuthContext';
import { useStatus } from '../../../hooks/useStatus';
import { LoadingOverlay } from '../../../components/status/LoadingOverlay';
import { ProgressTracker } from '../../../components/status/ProgressTracker';
import { ModeSelector, Mode } from '../../../components/ModeSelector';
import { ModelSelector } from '../../../components/ModelSelector';
import { OperationMetaCard } from '../../../components/status/OperationMetaCard';
import { AIExecutor } from '../../../ai/services/aiExecutor';
import { ExecutionTrace } from '../../../ai/types';
import { ResultPreview, useResultPreviewThemeMode } from '../../../components/status/ResultPreview';
import { ResultPreviewContent } from '../../../components/status/ResultPreviewContent';
import { normalizeResultPreview } from '../../../components/status/resultPreviewModel';
import { PreviewThemeModeToggle } from '../../../components/status/PreviewThemeModeToggle';
import { Eye } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useDocument } from '../../../contexts/DocumentContext';
import CompactDocumentInfoBar from '../../../upload/CompactDocumentInfoBar';

import { MasterConnectionSystem } from '../../../ai/services/masterConnectionSystem';
import { storeResult } from '../../../services/resultService';
import { useToolScopedModelSelection } from '../../../hooks/useToolScopedModelSelection';
import {
  readPersistedToolModelSelection,
  resolveInitialToolModelSelection,
} from '../../../ai/toolModelSelection';
import { buildStudyToolPromptConfig } from '../../../ai/orchestration/toolPromptConfig';
import { buildDocumentContextRef } from '../../../services/documentRuntimeService';

const StudyTools: React.FC = () => {
  const {
    extractedText,
    hasDocument,
    documentId,
    artifactId,
    processingPathway,
    documentRevision,
    documentStatus,
    documentPreparationError,
  } = useDocument();
  const { logActivity, checkLimit, incrementUsage, deductCredits, user, sessionScopeKey, handleError, models, notify, getModelConfig } = useAuth();
  const { t } = useLanguage();
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const currentStudyToolId = activeTool || 'study';
  // Study tools render multiple distinct generators inside one route. Persist
  // each subtool selection separately so switching from flashcards to notes
  // never overwrites the other tool's chosen model.
  const { selectedModelId, setSelectedModelId } = useToolScopedModelSelection({
    toolId: currentStudyToolId,
    selectionScopeId: activeTool ? `study:${activeTool}` : 'study',
    models,
    user,
  });
  const [selectedMode, setSelectedMode] = useState<Mode>('standard');
  const [customInstructions, setCustomInstructions] = useState('');
  const activeModel = React.useMemo(
    () => getModelConfig(selectedModelId),
    [getModelConfig, selectedModelId]
  );
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [liveTrace, setLiveTrace] = useState<ExecutionTrace | null>(null);
  const { status, message, error, startTime, endTime, durationMs, setStatus, setError, setStages, updateStage, elapsed, isLoading, isError, reset, stages } = useStatus();
  const documentRevisionRef = React.useRef(documentRevision);
  const documentContextRef = React.useMemo(
    () =>
      buildDocumentContextRef({
        documentId,
        artifactId,
        processingPathway,
        documentRevision,
        fileName: null,
      }),
    [artifactId, documentId, documentRevision, processingPathway]
  );

  React.useEffect(() => {
    documentRevisionRef.current = documentRevision;
    setActiveTool(null);
    setResult(null);
    setLiveTrace(null);
    setIsPreviewOpen(false);
    reset();
    setStatus('idle');
  }, [documentRevision, reset, setStatus]);

  const handleModelSelect = (modelId: string) => {
    const resolvedId = setSelectedModelId(modelId);
    const resolvedModel = getModelConfig(resolvedId || modelId);
    if (resolvedId) {
      notify.success(`Model updated to ${resolvedModel?.name || resolvedId}`);
    }
  };
  const handleModeSelect = (mode: Mode) => {
    setSelectedMode(mode);
  };

  const resolveSelectedModelIdForTool = React.useCallback((toolId: string) => {
    return resolveInitialToolModelSelection({
      toolId,
      selectionScopeId: `study:${toolId}`,
      models,
      user,
      fallbackModelId: selectedModelId,
      persistedModelId: readPersistedToolModelSelection({
        actorScopeKey: sessionScopeKey || 'anonymous',
        toolId,
        selectionScopeId: `study:${toolId}`,
      }),
    });
  }, [models, selectedModelId, sessionScopeKey, user]);

  const tools = [
    { id: 'summary', label: t('aiSummary'), icon: FileText, description: t('aiSummaryDesc') },
    { id: 'flashcards', label: t('flashcards'), icon: Layers, description: t('flashcardsDesc') },
    { id: 'mindmap', label: t('mindMap'), icon: MapIcon, description: t('mindMapDesc') },
    { id: 'concepts', label: t('conceptMap'), icon: Brain, description: t('conceptMapDesc') },
    { id: 'notes', label: t('smartNotes'), icon: BookOpen, description: t('smartNotesDesc') },
    { id: 'diagrams', label: t('diagramGenerator'), icon: Lightbulb, description: t('diagramGeneratorDesc') },
  ];
  const activeToolDefinition = tools.find((tool) => tool.id === activeTool);
  const studyPresentationStage = result
    ? {
        label: 'Result displayed',
        status: 'completed' as const,
        message: 'The generated study output is rendered in the active tool panel.',
      }
    : liveTrace?.resultMeta?.ready
      ? {
          label: 'Rendering result',
          status: 'active' as const,
          message: 'Formatting the generated study output for display.',
        }
      : null;
  const studyOutputMetaRows = result
    ? [
        { label: 'Tool', value: activeToolDefinition?.label || '--' },
        { label: 'Result Length', value: `${result.length.toLocaleString()} chars` },
        { label: 'Custom Instructions', value: customInstructions.trim() ? 'Applied' : 'None' },
      ]
    : [];
  const studyPreviewData = result
    ? {
        kind: 'study-tool-text',
        content: result,
        markdown: result,
        toolId: activeTool,
        toolLabel: activeToolDefinition?.label,
      }
    : null;
  const studyPreviewSourceTool = activeTool ? `study-tools:${activeTool}` : 'study-tools';
  const [studyPreviewThemeMode, setStudyPreviewThemeMode] = useResultPreviewThemeMode({
    sourceTool: studyPreviewSourceTool,
    type: 'text',
  });
  const studyResultPreview = React.useMemo(
    () =>
      studyPreviewData
        ? normalizeResultPreview({
            title: activeToolDefinition?.label || 'Study Tool Result',
            type: 'text',
            data: studyPreviewData,
            sourceTool: studyPreviewSourceTool,
          })
        : null,
    [activeToolDefinition?.label, studyPreviewData, studyPreviewSourceTool]
  );

  const handleToolAction = async (toolId: string) => {
    const activeDocumentRevision = documentRevisionRef.current;
    if (!extractedText) {
      handleError(new Error(t('uploadDocumentFirst')), 'validation', 'study-tools-validation');
      return;
    }
    if (user && !user.permissions.useStudyTools) {
      handleError(new Error(t('noPermissionStudyTools')), 'admin_permission', 'study-tools-permission');
      return;
    }
    if (!checkLimit('aiRequestsToday')) {
      handleError(new Error(t('dailyLimitReached')), 'validation', 'study-tools-limit');
      return;
    }

    const tool = tools.find(t => t.id === toolId);
    setActiveTool(toolId);
    setLiveTrace(null);
    setStatus('processing', t('generatingTool', { tool: tool?.label }));
    setResult(null);
    setStages([
      { id: 'validate', label: t('validatingModel'), status: 'active' },
      { id: 'prompt', label: t('buildingPrompt'), status: 'pending' },
      { id: 'generate', label: t('generatingTool', { tool: tool?.label }), status: 'pending' },
      { id: 'finalize', label: t('finalizingAssessment'), status: 'pending' },
    ]);

    try {
      const executionModelId =
        activeTool === toolId ? selectedModelId : resolveSelectedModelIdForTool(toolId);
      const executionModel = getModelConfig(executionModelId);

      updateStage('validate', {
        status: 'completed',
        label: `Model Confirmed: ${executionModel?.name || executionModelId}`,
      });

      updateStage('prompt', { status: 'active' });
      updateStage('prompt', { status: 'completed' });

      updateStage('generate', { status: 'active', label: t('generatingTool', { tool: tool?.label }) });
      const promptConfig = buildStudyToolPromptConfig({
        studyToolId: toolId,
        studyToolLabel: tool?.label,
        generationMode: selectedMode,
        customInstructions,
      });
      const response = await AIExecutor.execute({
        modelId: executionModelId,
        toolId: toolId,
        mode: selectedMode,
        taskType: 'text',
        fileContext: extractedText.substring(0, 20000),
        documentContextRef,
        providerSettings: {
          enableThinking: selectedMode === 'thinking',
          enableSearch: selectedMode === 'search',
        },
        settings: promptConfig.settings,
        userPreferences: promptConfig.userPreferences,
        observability: {
          actionName: `study-tools-${toolId}`,
          onTraceUpdate: (trace) => setLiveTrace(trace),
        },
      }, `Please generate a ${tool?.label} based on the provided content.`);

      if (response.error) {
        throw Object.assign(new Error(response.error), {
          errorInfo: response.errorInfo,
        });
      }

      if (documentRevisionRef.current !== activeDocumentRevision) {
        return;
      }

      updateStage('generate', { status: 'completed' });

      updateStage('finalize', { status: 'active' });
      if (documentRevisionRef.current !== activeDocumentRevision) {
        return;
      }
      setResult(response.text);
      await deductCredits();
      incrementUsage('aiRequestsToday');
      logActivity('chat', `Used study tool: ${toolId}`);
      updateStage('finalize', { status: 'completed' });
      setStatus('success', t('toolGeneratedSuccessfully', { tool: tool?.label }));

      const previewPayload = {
        kind: 'study-tool-text',
        content: response.text,
        markdown: response.text,
        toolId,
        toolLabel: tool?.label,
      };

      if (user?.id) {
        void storeResult(
          user.id,
          `${tool?.label || 'Study Tool'} Output`,
          'text',
          JSON.stringify(previewPayload),
          `study-tools:${toolId}`,
          user.plan
        ).catch((storeError) => {
          console.warn('Failed to persist study tool result', storeError);
        });
      }
    } catch (err: any) {
      console.error(err);
      setError(err, () => handleToolAction(toolId));
    }
  };

  return (
    <div className="space-y-8 relative">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Sparkles className="text-emerald-500" size={20} />
            {t('studyTools')}
          </h2>
        </div>
        <div className="flex flex-col gap-2">
          <ModelSelector 
            selectedModelId={selectedModelId}
            onModelSelect={handleModelSelect}
            toolId={currentStudyToolId}
            filter={(m) => {
              // Check if the model is compatible with at least one study tool
              const studyToolIds = ['summary', 'flashcards', 'mindmap', 'concepts', 'notes', 'diagrams'];
              return studyToolIds.some(toolId => MasterConnectionSystem.getCompatibleModels(toolId).includes(m.id));
            }}
          />
          <ModeSelector 
            selectedMode={selectedMode}
            onModeSelect={handleModeSelect}
            model={activeModel || (models && models.length > 0 ? models[0] : undefined)}
          />
        </div>
      </div>

      <div className="mb-8">
        {hasDocument ? (
          <CompactDocumentInfoBar
            statusLabel={
              documentPreparationError
                ? t('uploadUI.documentPreparationFailed', {
                    defaultValue: 'Document preparation failed',
                  })
                : documentStatus === 'preparing'
                ? t('uploadUI.filePreparing', { defaultValue: 'Preparing file' })
                : t('uploadUI.sharedAcrossTools', { defaultValue: 'Shared across tools' })
            }
            statusTone={
              documentPreparationError
                ? 'error'
                : documentStatus === 'preparing'
                  ? 'warning'
                  : 'success'
            }
            className="mb-6"
          />
        ) : null}

        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">{t('customInstructions')}</label>
        <textarea
          value={customInstructions}
          onChange={(e) => setCustomInstructions(e.target.value)}
          placeholder={t('customInstructionsPlaceholder')}
          className="w-full h-20 bg-zinc-900/50 border border-zinc-800 text-white rounded-2xl px-4 py-3 focus:outline-none focus:border-emerald-500 resize-none text-sm"
          disabled={isLoading}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => handleToolAction(tool.id)}
            disabled={isLoading}
            className={cn(
              "p-6 rounded-3xl border transition-all text-start group relative overflow-hidden cursor-pointer",
              activeTool === tool.id 
                ? "bg-emerald-600 border-emerald-500 text-white" 
                : "bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-zinc-600",
              isLoading && "opacity-50 cursor-not-allowed"
            )}
          >
            <div className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center mb-4 transition-colors",
              activeTool === tool.id ? "bg-white/20 text-white" : "bg-zinc-800 text-zinc-500 group-hover:text-emerald-500"
            )}>
              <tool.icon size={24} />
            </div>
            <h3 className={cn("font-bold text-lg", activeTool === tool.id ? "text-white" : "text-white")}>{tool.label}</h3>
            <p className={cn("text-sm mt-1", activeTool === tool.id ? "text-emerald-100" : "text-zinc-500")}>{tool.description}</p>
            <ChevronRight className={cn(
              "absolute bottom-6 inset-e-6 transition-transform",
              activeTool === tool.id ? "translate-x-0" : "translate-x-4 opacity-0 group-hover:translate-x-0 group-hover:opacity-100"
            )} size={20} />
          </button>
        ))}
      </div>

      <AnimatePresence>
        {activeTool && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 min-h-75 flex flex-col relative overflow-hidden"
          >
            <ProgressTracker 
              stages={stages || []} 
              isVisible={isLoading || !!liveTrace || status === 'success' || isError} 
              elapsedTime={elapsed} 
              trace={liveTrace}
              presentationStage={studyPresentationStage}
              status={status}
              message={message}
              onRetry={error?.retryAction}
              title={t('generationPipeline')} 
            />
            
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-emerald-600/20 rounded-lg flex items-center justify-center text-emerald-500">
                  {tools.find(t => t.id === activeTool)?.icon && React.createElement(tools.find(t => t.id === activeTool)!.icon, { size: 18 })}
                </div>
                <h3 className="text-xl font-bold text-white">{t('toolResult', { tool: tools.find(t => t.id === activeTool)?.label })}</h3>
              </div>
              <button 
                onClick={() => {
                  setActiveTool(null);
                  reset();
                }}
                className="text-zinc-500 hover:text-white transition-colors cursor-pointer"
              >
                {t('close')}
              </button>
            </div>

            <OperationMetaCard
              trace={liveTrace}
              status={status}
              startTime={startTime}
              endTime={endTime}
              durationMs={durationMs}
              elapsedSeconds={isLoading ? elapsed : undefined}
              outputMetaRows={studyOutputMetaRows}
              title="Operation Summary"
              className="mb-6"
            />

            <div
              className={cn(
                'flex-1 rounded-2xl border p-6 transition-colors',
                studyPreviewThemeMode === 'dark'
                  ? 'border-zinc-800/60 bg-zinc-950/70'
                  : 'border-zinc-200 bg-white/85'
              )}
            >
              {isLoading ? (
                <div className="h-full flex flex-col items-center justify-center gap-4 text-zinc-500">
                  <Loader2 className="animate-spin" size={32} />
                  <p className="font-medium">{message || t('aiProcessing')}</p>
                </div>
              ) : studyResultPreview ? (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className={cn('text-[11px] font-black uppercase tracking-[0.22em]', studyPreviewThemeMode === 'dark' ? 'text-zinc-400' : 'text-zinc-500')}>
                        {t('preview', { defaultValue: 'Preview' })}
                      </p>
                      <p className={cn('text-sm font-medium', studyPreviewThemeMode === 'dark' ? 'text-zinc-300' : 'text-zinc-600')}>
                        {t('previewAndExport', { defaultValue: 'Preview & Export' })}
                      </p>
                    </div>
                    <PreviewThemeModeToggle value={studyPreviewThemeMode} onChange={setStudyPreviewThemeMode} />
                  </div>
                  <div
                    className={cn(
                      'rounded-[1.75rem] border p-5 shadow-inner transition-colors',
                      studyPreviewThemeMode === 'dark'
                        ? 'border-zinc-800 bg-zinc-900/70'
                        : 'border-zinc-200 bg-zinc-50/95'
                    )}
                  >
                    {/*
                      Shared-vs-tool rendering boundary:
                      Study tools still own this page layout, but the rich text body
                      reuses the normalized preview renderer so inline reading,
                      detached preview, and exports stay visually aligned.
                    */}
                    <ResultPreviewContent preview={studyResultPreview} exportThemeMode={studyPreviewThemeMode} />
                  </div>
                  <div className={cn('flex gap-3 pt-6 border-t', studyPreviewThemeMode === 'dark' ? 'border-zinc-800' : 'border-zinc-200')}>
                    <button 
                      onClick={() => setIsPreviewOpen(true)}
                      className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold transition-all cursor-pointer flex items-center gap-2 shadow-lg shadow-emerald-500/20"
                    >
                      <Eye size={18} />
                      {t('previewAndExport')}
                    </button>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(result);
                        notify.success(t('copiedToClipboard'));
                      }}
                      className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm font-bold transition-all cursor-pointer"
                    >
                      {t('copyToClipboard')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-zinc-600 italic">
                  {t('selectToolToGenerate')}
                </div>
              )}
            </div>

              <ResultPreview 
                isOpen={isPreviewOpen}
                onClose={() => setIsPreviewOpen(false)}
                title={tools.find(t => t.id === activeTool)?.label || 'Study Tool Result'}
                type="text"
                data={studyPreviewData}
                sourceTool={studyPreviewSourceTool}
                previewThemeMode={studyPreviewThemeMode}
                onPreviewThemeModeChange={setStudyPreviewThemeMode}
              />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="text-center py-8 text-zinc-600 text-xs font-medium">
        © Zootopia Club – Copyright Ebn Abdallah Yousef
      </div>
    </div>
  );
};

export default StudyTools;
