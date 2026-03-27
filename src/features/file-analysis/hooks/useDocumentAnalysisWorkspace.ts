import * as React from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../../../auth/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useDocument } from '../../../contexts/DocumentContext';
import { useNotifications } from '../../../notifications/NotificationContext';
import { useStatus } from '../../../hooks/useStatus';
import { AI_MODELS } from '../../../constants/aiModels';
import { analyzeDocument } from '../../../services/geminiService';
import { mapUploadErrorMessage } from '../../../utils/uploadErrorMap';
import { normalizeResultPreview } from '../../../components/status/resultPreviewModel';
import { openDetachedResultPreview } from '../../../components/status/resultPreviewStorage';
import { exportTextToMarkdown, exportTextToPDF } from '../../../utils/exporters';
import { logger } from '../../../utils/logger';
import { useToolScopedModelSelection } from '../../../hooks/useToolScopedModelSelection';
import { ExportThemeMode } from '../../../utils/exporters';
import { useResultPreviewThemeMode } from '../../../components/status/ResultPreview';
import { buildDocumentContextRef } from '../../../services/documentRuntimeService';

type UseDocumentAnalysisWorkspaceInput = {
  sourceTool?: string;
};

export const useDocumentAnalysisWorkspace = (
  input: UseDocumentAnalysisWorkspaceInput = {}
) => {
  const sourceTool = input.sourceTool || 'document-analysis';
  const { user, models, getModelConfig } = useAuth();
  const { addNotification } = useNotifications();
  const { t } = useLanguage();
  const {
    extractedText,
    fileName,
    documentId,
    artifactId,
    processingPathway,
    analysisResult,
    analysisTrace,
    documentRevision,
    setAnalysisResult,
    setAnalysisTrace,
  } = useDocument();
  const {
    status,
    message,
    error,
    setStatus,
    setError,
    setStages,
    updateStage,
    elapsed,
    startTime,
    endTime,
    durationMs,
    isLoading,
    isError,
    stages,
  } = useStatus();
  const [isPreviewOpen, setIsPreviewOpen] = React.useState(false);
  const [analysisExportAction, setAnalysisExportAction] = React.useState<'pdf' | 'markdown' | null>(null);
  const [analysisPreviewThemeMode, setAnalysisPreviewThemeMode] = useResultPreviewThemeMode({
    sourceTool,
    type: 'text',
  });
  const documentRevisionRef = React.useRef(documentRevision);
  const { selectedModelId: analysisModelId, setSelectedModelId: setAnalysisModelId } = useToolScopedModelSelection({
    toolId: 'analyze',
    models,
    user,
  });

  React.useEffect(() => {
    documentRevisionRef.current = documentRevision;
    setIsPreviewOpen(false);
    setAnalysisExportAction(null);
  }, [documentRevision]);

  const currentDisplayedFileName = React.useMemo(() => {
    return fileName || t('uploadUI.defaultDocumentName');
  }, [fileName, t]);
  const documentContextRef = React.useMemo(
    () =>
      buildDocumentContextRef({
        documentId,
        artifactId,
        processingPathway,
        documentRevision,
        fileName,
      }),
    [artifactId, documentId, documentRevision, fileName, processingPathway]
  );

  React.useEffect(() => {
    if (!analysisResult || isLoading || status === 'success') {
      return;
    }

    setStatus('success', t('analysisComplete'));
  }, [analysisResult, isLoading, setStatus, status, t]);

  const runAnalysis = React.useCallback(
    async (text: string, currentFileName: string, existingOperationId?: string) => {
      const operationId =
        existingOperationId ||
        `analyze-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const activeDocumentRevision = documentRevisionRef.current;
      const activeModel =
        getModelConfig(analysisModelId) ||
        AI_MODELS.find((model) => model.id === analysisModelId) ||
        AI_MODELS[0];
      const modelName = activeModel?.name || 'AI';

      setAnalysisTrace(null);
      setStages([
        { id: 'validate', label: t('validatingModel'), status: 'completed', progress: 100 },
        {
          id: 'analyzing',
          label: t('modelAnalyzing', { model: modelName }),
          status: 'active',
          progress: 0,
        },
      ]);
      setStatus('processing', t('modelAnalyzing', { model: modelName }));

      try {
        if (!activeModel) {
          throw new Error(t('uploadUI.errorNoActiveModel'));
        }

        const result = (await analyzeDocument(
          text,
          currentFileName,
          activeModel,
          {},
          undefined,
          {
            actionName: 'document-analysis',
            operationId,
            onTraceUpdate: (trace) => setAnalysisTrace(trace),
          },
          documentContextRef
        )) as any;

        if (documentRevisionRef.current !== activeDocumentRevision) {
          return;
        }

        setAnalysisResult({
          text: result?.text || '',
          modelUsed: result?.modelUsed,
          modelId: activeModel.id,
          fallbackHappened: result?.fallbackHappened,
        });
        if (result?.trace) {
          setAnalysisTrace(result.trace);
        }

        addNotification({
          title: t('analysisReady'),
          message: t('analysisReadyDesc', { name: currentFileName }),
          type: 'analysis',
          priority: 'medium',
        });

        updateStage('analyzing', { progress: 100, status: 'completed' });
        setStatus('success', t('analysisComplete'));
        toast.success(t('analysisComplete'));
      } catch (err: any) {
        if (documentRevisionRef.current !== activeDocumentRevision) {
          return;
        }
        updateStage('analyzing', { status: 'failed' });
        setError(
          new Error(mapUploadErrorMessage(err?.message, t)),
          () => runAnalysis(text, currentFileName, operationId)
        );
      }
    },
    [
      addNotification,
      analysisModelId,
      getModelConfig,
      setAnalysisResult,
      setAnalysisTrace,
      setError,
      setStages,
      setStatus,
      t,
      updateStage,
      documentContextRef,
    ]
  );

  const analysisPreviewPayload = React.useMemo(
    () =>
      analysisResult
        ? {
            kind: 'analysis',
            content: analysisResult.text,
            markdown: analysisResult.text,
            modelUsed: analysisResult.modelUsed,
            fileName: currentDisplayedFileName,
          }
        : null,
    [analysisResult, currentDisplayedFileName]
  );

  const normalizedAnalysisPreview = React.useMemo(() => {
    if (!analysisPreviewPayload) {
      return null;
    }

    return normalizeResultPreview({
      title: `Analysis: ${currentDisplayedFileName}`,
      type: 'text',
      data: analysisPreviewPayload,
      sourceTool,
      createdAt: analysisResult?.updatedAt || new Date().toISOString(),
    });
  }, [analysisPreviewPayload, analysisResult?.updatedAt, currentDisplayedFileName, sourceTool]);

  const analysisPresentationStage = normalizedAnalysisPreview
    ? {
        label: 'Analysis displayed',
        status: 'completed' as const,
        message: 'The final analysis preview is rendered and ready for export.',
      }
    : analysisTrace?.resultMeta?.ready
      ? {
          label: 'Rendering analysis',
          status: 'active' as const,
          message: 'Preparing the final analysis view for display.',
        }
      : null;

  const analysisOutputMetaRows = analysisResult
    ? [
        { label: 'Source File', value: currentDisplayedFileName },
        {
          label: 'Extracted Text',
          value: extractedText ? `${extractedText.length.toLocaleString()} chars` : '--',
        },
        { label: 'Analysis Length', value: `${analysisResult.text.length.toLocaleString()} chars` },
      ]
    : [];

  const runSafeExport = React.useCallback(
    async (config: {
      action: 'pdf' | 'markdown';
      loadingMessage: string;
      successMessage: string;
      operation: () => Promise<boolean>;
    }) => {
      if (analysisExportAction) {
        return;
      }

      setAnalysisExportAction(config.action);
      const toastId = toast.loading(config.loadingMessage);

      try {
        const didSucceed = await config.operation();
        if (!didSucceed) {
          toast.error(t('exportFailed', { defaultValue: 'Export failed.' }), { id: toastId });
          return;
        }

        toast.success(config.successMessage, { id: toastId });
      } catch (exportError) {
        logger.error('Document analysis export failed', {
          area: 'analysis-workspace',
          event: 'analysis-export-failed',
          format: config.action,
          fileName: currentDisplayedFileName,
          error: exportError,
        });
        toast.error(t('exportFailed', { defaultValue: 'Export failed.' }), { id: toastId });
      } finally {
        setAnalysisExportAction((current) => (current === config.action ? null : current));
      }
    },
    [analysisExportAction, currentDisplayedFileName, t]
  );

  const handleOpenDetached = React.useCallback(() => {
    if (!analysisPreviewPayload) {
      return;
    }

    openDetachedResultPreview({
      title: `Analysis: ${currentDisplayedFileName}`,
      type: 'text',
      data: analysisPreviewPayload,
      sourceTool,
      previewThemeMode: analysisPreviewThemeMode,
    });
  }, [analysisPreviewPayload, analysisPreviewThemeMode, currentDisplayedFileName, sourceTool]);

  const handleExportPdf = React.useCallback(() => {
    if (!analysisResult) {
      return;
    }

    void runSafeExport({
      action: 'pdf',
      loadingMessage: t('preparingHighResExport', {
        defaultValue: 'Preparing high-resolution export...',
      }),
      successMessage: t('exportSuccessful', { defaultValue: 'Export completed successfully.' }),
      operation: () =>
        exportTextToPDF(`Analysis: ${currentDisplayedFileName}`, analysisResult.text, {
          themeMode: analysisPreviewThemeMode as ExportThemeMode,
        }),
    });
  }, [analysisPreviewThemeMode, analysisResult, currentDisplayedFileName, runSafeExport, t]);

  const handleExportMarkdown = React.useCallback(() => {
    if (!analysisResult) {
      return;
    }

    void runSafeExport({
      action: 'markdown',
      loadingMessage: t('preparingMarkdownExport', {
        defaultValue: 'Preparing Markdown export...',
      }),
      successMessage: t('exportSuccessful', { defaultValue: 'Export completed successfully.' }),
      operation: () =>
        exportTextToMarkdown(`Analysis: ${currentDisplayedFileName}`, analysisResult.text, {
          themeMode: analysisPreviewThemeMode as ExportThemeMode,
        }),
    });
  }, [analysisPreviewThemeMode, analysisResult, currentDisplayedFileName, runSafeExport, t]);

  const analysisStatusLabel = isLoading
    ? t('analyzing')
    : analysisResult
      ? t('analysisComplete')
      : t('waitingForAction');

  return {
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
    stages: stages || [],
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
  };
};
