import * as React from 'react';
import {
  Brain,
  CheckCircle2,
  CircleAlert,
  FileQuestion,
  LoaderCircle,
  RefreshCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../auth/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useDocument } from '../../../contexts/DocumentContext';
import { useNotifications } from '../../../notifications/NotificationContext';
import { useStatus } from '../../../hooks/useStatus';
import FileUploader from '../../../upload/FileUploader';
import CompactDocumentInfoBar from '../../../upload/CompactDocumentInfoBar';
import AssessmentStudio from '../components/AssessmentStudio';
import NextStepActionCard from '../components/NextStepActionCard';
import { logger } from '../../../utils/logger';
import { validateSupportedUploadFile } from '../../../utils/fileProcessors';
import { mapUploadErrorMessage } from '../../../utils/uploadErrorMap';
import { runtimeTimeouts } from '../../../config/runtime';
import { cn } from '../../../utils';
import { ProgressTracker } from '../../../components/status/ProgressTracker';
import {
  cancelDocumentProcessing,
  deleteDocumentArtifact,
  intakeDocument,
} from '../../../services/documentRuntimeService';

/**
 * Dashboard architecture rule:
 * ---------------------------------------------------------
 * Uploaded file lifecycle MUST be controlled by DocumentContext.
 *
 * - Uploading a new file may replace the previous file explicitly.
 * - Removing the file must happen only through clearDocument().
 * - Assessment generation remains the primary landing workflow.
 * - Analysis stays a dedicated destination and must not be rendered inline here.
 */
export const Dashboard = () => {
  const {
    user,
    authMode,
    authSession,
    checkLimit,
    incrementUsage,
    logActivity,
    handleError,
  } = useAuth();
  const { t } = useLanguage();
  const { addNotification } = useNotifications();
  // Progress stages belong to the shared status hook; this was a stale post-refactor binding.
  const {
    status,
    message,
    error,
    setStatus,
    setError,
    setStages,
    updateStage,
    elapsed,
    isLoading,
    isError,
    reset,
    stages,
  } = useStatus();
  const {
    replaceDocument,
    setDocumentPreparationError,
    hasDocument,
    documentId,
    runtimeOperationId,
    documentRevision,
    documentStatus,
    isDocumentPreparing,
    documentPreparationError,
    clearDocument,
  } = useDocument();
  const navigate = useNavigate();

  const uploadSequenceRef = React.useRef(0);
  const activePreparationControllerRef = React.useRef<AbortController | null>(null);
  const assessmentWorkspaceRef = React.useRef<HTMLElement | null>(null);
  const activePreparationStageRef = React.useRef<{
    stageId: 'validate' | 'upload' | 'extract' | 'store' | 'ready';
    label: string;
  }>({
    stageId: 'validate',
    label: 'Validating file',
  });

  const resolvePreparationTimeoutMs = React.useCallback((file: File) => {
    const fileSizeMb = Math.max(1, Math.ceil(file.size / (1024 * 1024)));
    const perMbBudgetMs = Math.min(120_000, fileSizeMb * 2_000);
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const pdfBudgetMs = isPdf ? 60_000 : 0;

    // Keep extraction bounded, but give realistic room for normal educational PDFs.
    return Math.min(300_000, runtimeTimeouts.uploadPreparationBaseMs + perMbBudgetMs + pdfBudgetMs);
  }, []);

  const createPreparationStages = React.useCallback(() => ([
    {
      id: 'validate',
      label: t('uploadUI.stageValidatingFile', { defaultValue: 'Validating file' }),
      progress: 0,
      status: 'active' as const,
    },
    {
      id: 'upload',
      label: t('uploadUI.stageUploadingFile', { defaultValue: 'Uploading file' }),
      progress: 0,
      status: 'pending' as const,
    },
    {
      id: 'extract',
      label: t('uploadUI.stagePreparingDocument', { defaultValue: 'Preparing document' }),
      progress: 0,
      status: 'pending' as const,
    },
    {
      id: 'store',
      label: t('uploadUI.stageStoringContext', { defaultValue: 'Storing extracted context' }),
      progress: 0,
      status: 'pending' as const,
    },
    {
      id: 'ready',
      label: t('uploadUI.stageReadyForGeneration', { defaultValue: 'Ready for generation' }),
      progress: 0,
      status: 'pending' as const,
    },
  ]), [t]);

  const abortActivePreparation = React.useCallback((reason?: Error) => {
    const controller = activePreparationControllerRef.current;
    activePreparationControllerRef.current = null;

    if (controller && !controller.signal.aborted) {
      controller.abort(reason || new Error('File processing was cancelled.'));
    }
  }, []);

  const invalidateExistingDocumentRuntime = React.useCallback(async () => {
    if (!documentId) {
      return;
    }

    const safeMissingMessages = new Set([
      'DOCUMENT_NOT_FOUND',
      'DOCUMENT_ARTIFACT_NOT_READY',
    ]);

    let invalidated = false;

    try {
      await cancelDocumentProcessing(documentId, runtimeOperationId);
      invalidated = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '');
      if (safeMissingMessages.has(message)) {
        invalidated = true;
      }
    }

    try {
      await deleteDocumentArtifact(documentId);
      invalidated = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '');
      if (safeMissingMessages.has(message)) {
        invalidated = true;
      }
    }

    if (!invalidated) {
      throw new Error('Could not safely invalidate the previous uploaded file.');
    }
  }, [documentId, runtimeOperationId]);

  const classifyPreparationFailure = React.useCallback((input: {
    error: unknown;
    file: File;
    timeoutMs: number;
    stageId: 'validate' | 'upload' | 'extract' | 'store' | 'ready';
    stageLabel: string;
  }) => {
    const rawMessage = input.error instanceof Error ? input.error.message : String(input.error || '');
    const lowerMessage = rawMessage.toLowerCase();
    const isLocalRuntimeCredentialFailure =
      (lowerMessage.includes('unauthenticated') && lowerMessage.includes('authentication credentials')) ||
      lowerMessage.includes('invalid jwt signature');
    const userMessage = isLocalRuntimeCredentialFailure
      ? t('uploadUI.errorDocumentRuntimeCredentialFailure', {
          defaultValue: 'File uploaded successfully, but local document preparation could not continue because the backend document runtime credentials were rejected. Your sign-in is still active.',
        })
      : mapUploadErrorMessage(rawMessage, t);
    const diagnosticsStageId =
      input.stageId === 'validate'
        ? 'validating_file'
        : input.stageId === 'upload'
          ? 'uploading_file'
          : input.stageId === 'extract'
            ? 'preparing_document'
            : input.stageId === 'store'
              ? 'storing_extracted_context'
              : 'ready_for_generation';

    let category: 'validation' | 'parsing' | 'timeout' | 'internal' = 'internal';
    let code = 'unexpected_internal_exception';
    let retryable = true;

    if (lowerMessage.includes('unsupported file format')) {
      category = 'validation';
      code = 'unsupported_file_type';
      retryable = false;
    } else if (lowerMessage.includes('file too large')) {
      category = 'validation';
      code = 'file_too_large';
      retryable = false;
    } else if (lowerMessage.includes('file is empty')) {
      category = 'validation';
      code = 'empty_file';
      retryable = false;
    } else if (/setting up fake worker failed|pdf\.worker|pdfjs|pdf\.js worker|failed to fetch dynamically imported module/i.test(rawMessage)) {
      category = 'parsing';
      code = 'pdf_worker_setup_failed';
    } else if (lowerMessage.includes('pdf parsing failed')) {
      category = 'parsing';
      code = 'pdf_parsing_failed';
    } else if (lowerMessage.includes('no extractable text')) {
      category = 'parsing';
      code = 'empty_extracted_text';
    } else if (lowerMessage.includes('timed out') || lowerMessage.includes('timeout')) {
      category = 'timeout';
      code = 'extraction_timeout';
    } else if (isLocalRuntimeCredentialFailure) {
      category = 'internal';
      code = 'document_runtime_backend_credentials_unavailable';
    } else if (lowerMessage.includes('extract') || lowerMessage.includes('process')) {
      category = 'parsing';
      code = 'text_extraction_failed';
    }

    const enrichedError = new Error(userMessage) as Error & {
      errorInfo?: {
        category: 'validation' | 'parsing' | 'timeout' | 'internal';
        code: string;
        message: string;
        userMessage: string;
        stage: string;
        traceId: string;
        retryable: boolean;
        details: Record<string, unknown>;
      };
    };

    enrichedError.errorInfo = {
      category,
      code,
      message: rawMessage,
      userMessage,
      stage: diagnosticsStageId,
      traceId: `docprep-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      retryable,
      details: {
        fileName: input.file.name,
        fileSizeBytes: input.file.size,
        mimeType: input.file.type || 'unknown',
        timeoutMs: input.timeoutMs,
        failedStageLabel: input.stageLabel,
      },
    };

    return {
      userMessage,
      enrichedError,
    };
  }, [t]);

  const clearDashboardDocumentState = React.useCallback(() => {
    uploadSequenceRef.current += 1;
    abortActivePreparation(new Error('File processing was cancelled.'));
    void invalidateExistingDocumentRuntime().catch(() => undefined);
    reset();
    clearDocument();
  }, [abortActivePreparation, clearDocument, invalidateExistingDocumentRuntime, reset]);

  React.useEffect(() => {
    return () => {
      abortActivePreparation(new Error('File processing was cancelled.'));
    };
  }, [abortActivePreparation]);

  const handleFileSelect = React.useCallback(
    async (selectedFile: File) => {
      const uploadSequence = ++uploadSequenceRef.current;
      let didAttachDocument = false;
      let preparationTimeoutId: number | null = null;
      const preparationTimeoutMs = resolvePreparationTimeoutMs(selectedFile);

      logger.info('File selected for upload', {
        fileName: selectedFile.name,
        fileSizeBytes: selectedFile.size,
        mimeType: selectedFile.type || 'application/octet-stream',
        userRole: user?.role,
        currentUserId: user?.id || null,
        authMode: authMode || 'none',
        authSessionState: authSession.sessionState,
        authSessionScope: authSession.sessionScopeKey,
        authSessionExpiresAt: authSession.expiresAt,
        uploadPreparationTimeoutMs: preparationTimeoutMs,
        authSessionRefreshBudgetMs: runtimeTimeouts.authSessionApiMs,
      });

      if (user && !user.permissions.uploadFiles) {
        handleError(new Error(t('uploadUI.errorNoPermission')), 'admin_permission', 'File Upload');
        return;
      }

      if (!checkLimit('uploadsToday')) {
        handleError(
          new Error(t('uploadUI.errorDailyLimitReached')),
          'validation',
          'File Upload'
        );
        return;
      }

      abortActivePreparation(new Error('File processing was cancelled.'));
      await invalidateExistingDocumentRuntime();

      const validateLabel = t('uploadUI.stageValidatingFile', { defaultValue: 'Validating file' });
      const uploadLabel = t('uploadUI.stageUploadingFile', { defaultValue: 'Uploading file' });
      const uploadCompleteLabel = t('uploadUI.stageUploadComplete', { defaultValue: 'File uploaded successfully' });
      const prepareLabel = t('uploadUI.stagePreparingDocument', { defaultValue: 'Preparing document' });
      const storeLabel = t('uploadUI.stageStoringContext', { defaultValue: 'Storing extracted context' });
      const readyLabel = t('uploadUI.stageReadyForGeneration', { defaultValue: 'Ready for generation' });
      activePreparationStageRef.current = {
        stageId: 'validate',
        label: validateLabel,
      };

      setStatus('validating', validateLabel);
      setStages(createPreparationStages());

      try {
        await validateSupportedUploadFile(selectedFile);
        if (uploadSequence !== uploadSequenceRef.current) {
          return;
        }

        updateStage('validate', {
          progress: 100,
          status: 'completed',
          label: validateLabel,
        });

        replaceDocument({
          file: selectedFile,
          fileName: selectedFile.name,
          fileSizeBytes: selectedFile.size,
          mimeType: selectedFile.type,
        });
        didAttachDocument = true;

        setStatus('processing', uploadLabel);
        activePreparationStageRef.current = {
          stageId: 'upload',
          label: uploadLabel,
        };
        updateStage('upload', {
          status: 'active',
          label: uploadLabel,
          progress: 5,
          details: {
            progressReliable: false,
            stage: 'uploading_file_bytes',
          },
        });

        const preparationController = new AbortController();
        activePreparationControllerRef.current = preparationController;

        const timeoutPromise = new Promise<never>((_, reject) => {
          preparationTimeoutId = window.setTimeout(() => {
            const timeoutError = new Error(t('uploadUI.errorProcessingTimedOut'));
            preparationController.abort(timeoutError);
            reject(timeoutError);
          }, preparationTimeoutMs);
        });

        const intakePromise = intakeDocument(selectedFile, {
          signal: preparationController.signal,
          requestedPathway: 'local_extraction',
          onUploadStateChange: (state) => {
            if (uploadSequence !== uploadSequenceRef.current) {
              return;
            }

            if (state.phase === 'completed') {
              updateStage('upload', {
                status: 'completed',
                label: uploadCompleteLabel,
                progress: 100,
                details: {
                  progressReliable: true,
                  stage: 'file_upload_complete',
                  uploadedBytes: state.loadedBytes,
                  totalBytes: state.totalBytes,
                },
              });
              activePreparationStageRef.current = {
                stageId: 'extract',
                label: prepareLabel,
              };
              updateStage('extract', {
                status: 'active',
                label: prepareLabel,
                progress: 15,
                details: {
                  progressReliable: false,
                  stage: 'document_preparation_started',
                  requestUrl: state.requestUrl,
                },
              });
              setStatus('processing', prepareLabel);
              return;
            }

            const totalBytes = Math.max(state.totalBytes || selectedFile.size || 1, 1);
            const uploadProgress = Math.max(
              5,
              Math.min(95, Math.round((state.loadedBytes / totalBytes) * 100))
            );
            activePreparationStageRef.current = {
              stageId: 'upload',
              label: uploadLabel,
            };
            updateStage('upload', {
              status: 'active',
              label: uploadLabel,
              progress: uploadProgress,
              details: {
                progressReliable: true,
                stage: 'uploading_file_bytes',
                uploadedBytes: state.loadedBytes,
                totalBytes: state.totalBytes,
              },
            });
            setStatus('processing', uploadLabel);
          },
          onPreparationStateChange: () => {
            if (uploadSequence !== uploadSequenceRef.current) {
              return;
            }

            activePreparationStageRef.current = {
              stageId: 'extract',
              label: prepareLabel,
            };
            updateStage('extract', {
              status: 'active',
              label: prepareLabel,
              progress: 15,
              details: {
                progressReliable: false,
                stage: 'document_preparation_started',
              },
            });
            setStatus('processing', prepareLabel);
          },
        });
        const intakeResult = await Promise.race([intakePromise, timeoutPromise]);
        if (uploadSequence !== uploadSequenceRef.current) {
          return;
        }

        const text = intakeResult.artifact.extractedText || '';
        if (text.trim().length === 0) {
          throw new Error('No extractable text found in file.');
        }

        activePreparationStageRef.current = {
          stageId: 'extract',
          label: t('uploadUI.stageExtractingText', {
            defaultValue: 'Preparing document and extracting text',
          }),
        };
        updateStage('extract', {
          status: 'active',
          label: activePreparationStageRef.current.label,
          progress: 80,
          details: {
            progressReliable: false,
            stage: 'extracting_text_from_uploaded_document',
            extractionStrategy: intakeResult.artifact.extractionStrategy,
          },
        });
        setStatus('processing', activePreparationStageRef.current.label);

        activePreparationStageRef.current = {
          stageId: 'store',
          label: storeLabel,
        };
        updateStage('extract', {
          progress: 100,
          status: 'completed',
          label: t('uploadUI.stageExtractingText', {
            defaultValue: 'Preparing document and extracting text',
          }),
          details: {
            progressReliable: false,
            stage: 'document_preparation_complete',
            extractionStrategy: intakeResult.artifact.extractionStrategy,
          },
        });
        updateStage('store', {
          status: 'active',
          label: storeLabel,
          progress: 20,
          details: {
            progressReliable: false,
            stage: 'storing_owner_scoped_artifact',
          },
        });
        setStatus('processing', storeLabel);
        replaceDocument({
          file: selectedFile,
          fileName: intakeResult.document.fileName,
          fileSizeBytes: intakeResult.document.fileSizeBytes,
          mimeType: intakeResult.document.mimeType,
          artifactId: intakeResult.document.artifactId,
          sourceFileId: intakeResult.document.sourceFileId,
          ownerRole: intakeResult.document.ownerRole,
          workspaceScope: intakeResult.document.workspaceScope,
          processingPathway: intakeResult.document.processingPathway,
          runtimeOperationId: intakeResult.document.runtimeOperationId,
          documentId: intakeResult.document.documentId,
          documentRevision,
          extractedText: text,
          context: text,
        });
        setDocumentPreparationError(null);

        addNotification({
          title: t('fileProcessed'),
          message: t('fileProcessedDesc', { name: selectedFile.name }),
          type: 'success',
          priority: 'low',
        });

        updateStage('store', {
          progress: 100,
          status: 'completed',
          label: storeLabel,
          details: {
            progressReliable: false,
            stage: 'storing_extracted_context',
            textLength: text.length,
          },
        });

        // Document preparation deliberately stops here. Analysis remains a
        // separate user-triggered workspace instead of an inline continuation.
        activePreparationStageRef.current = {
          stageId: 'ready',
          label: readyLabel,
        };
        updateStage('ready', {
          status: 'completed',
          label: readyLabel,
          progress: 100,
          details: {
            progressReliable: false,
            stage: 'ready_for_generation',
            textLength: text.length,
          },
        });
        setStatus('idle', readyLabel);

        logActivity('upload', `Uploaded and processed: ${selectedFile.name}`);
        incrementUsage('uploadsToday');
      } catch (uploadError: any) {
        if (uploadSequence !== uploadSequenceRef.current) {
          return;
        }

        if (uploadError?.message === 'File processing was cancelled.') {
          return;
        }

        const failureStage = activePreparationStageRef.current;
        const { userMessage, enrichedError } = classifyPreparationFailure({
          error: uploadError,
          file: selectedFile,
          timeoutMs: preparationTimeoutMs,
          stageId: failureStage.stageId,
          stageLabel: failureStage.label,
        });

        logger.error('Dashboard document preparation failed', {
          area: 'dashboard',
          event: 'document-preparation-failed',
          fileName: selectedFile.name,
          stageId: failureStage.stageId,
          rawError: uploadError?.message || String(uploadError),
          error: userMessage,
          diagnostics: enrichedError.errorInfo,
          authMode: authMode || 'none',
          authSessionState: authSession.sessionState,
          authSessionExpiresAt: authSession.expiresAt,
        });

        updateStage(failureStage.stageId, {
          status: 'failed',
          label: failureStage.label,
          message: userMessage,
          details: {
            progressReliable: false,
            code: enrichedError.errorInfo?.code,
            retryable: enrichedError.errorInfo?.retryable,
            stage: enrichedError.errorInfo?.stage,
          },
        });
        updateStage('ready', {
          status: 'failed',
          label: t('uploadUI.documentPreparationFailed', {
            defaultValue: 'Document preparation failed',
          }),
          message: userMessage,
          details: {
            progressReliable: false,
            code: enrichedError.errorInfo?.code,
            retryable: enrichedError.errorInfo?.retryable,
            stage: enrichedError.errorInfo?.stage,
          },
        });

        if (didAttachDocument) {
          setDocumentPreparationError(userMessage);
        }
        setError(
          enrichedError,
          () => handleFileSelect(selectedFile)
        );
      } finally {
        if (preparationTimeoutId !== null) {
          window.clearTimeout(preparationTimeoutId);
        }

        if (activePreparationControllerRef.current?.signal.aborted || uploadSequence === uploadSequenceRef.current) {
          activePreparationControllerRef.current = null;
        }
      }
    },
    [
      abortActivePreparation,
      addNotification,
      checkLimit,
      classifyPreparationFailure,
      createPreparationStages,
      handleError,
      incrementUsage,
      logActivity,
      replaceDocument,
      resolvePreparationTimeoutMs,
      setError,
      setStages,
      setStatus,
      setDocumentPreparationError,
      t,
      updateStage,
      user,
      authMode,
      authSession.expiresAt,
      authSession.sessionScopeKey,
      authSession.sessionState,
      documentRevision,
      documentId,
      runtimeOperationId,
      invalidateExistingDocumentRuntime,
    ]
  );

  const handleUploadAnother = React.useCallback(() => {
    if (window.location.hash === '#question-generator') {
      window.history.replaceState(
        {},
        document.title,
        `${window.location.pathname}${window.location.search}`
      );
    }
    clearDashboardDocumentState();
    toast(t('uploadUI.chooseAnotherFile', { defaultValue: 'Choose another file to continue.' }));
  }, [clearDashboardDocumentState, t]);

  const handleRemoveDocument = React.useCallback(() => {
    if (window.location.hash === '#question-generator') {
      window.history.replaceState(
        {},
        document.title,
        `${window.location.pathname}${window.location.search}`
      );
    }
    clearDashboardDocumentState();
    toast.success(t('uploadUI.fileRemoved', { defaultValue: 'File removed.' }));
  }, [clearDashboardDocumentState, t]);

  const isDocumentReady = hasDocument && documentStatus === 'ready' && !documentPreparationError;
  const documentStatusTone = documentPreparationError
    ? 'error'
    : isDocumentPreparing
      ? 'warning'
      : 'success';
  const documentStatusLabel = documentPreparationError
    ? t('uploadUI.documentPreparationFailed', {
        defaultValue: 'Document preparation failed',
      })
    : isDocumentPreparing
      ? t('uploadUI.filePreparing', { defaultValue: 'Preparing file' })
      : t('uploadUI.documentReadyStage', {
          defaultValue: 'Ready for assessment and analysis',
        });

  const heroStateTitle = documentPreparationError
    ? t('uploadUI.documentPreparationFailed', {
        defaultValue: 'Document preparation failed',
      })
    : isDocumentPreparing
      ? t('uploadUI.uploadHeroUploadingTitle', {
          defaultValue: 'Preparing your file',
        })
      : t('uploadUI.fileReadyTitle', {
          defaultValue: 'Your lecture file is ready',
        });

  const heroStateHint = documentPreparationError
    ? t('uploadUI.fileNeedsAttentionHint', {
        defaultValue: 'The file is attached, but preparation failed. Replace it or remove it to continue.',
      })
    : isDocumentPreparing
      ? t('uploadUI.filePreparingHint', {
          defaultValue: 'We are still preparing the lecture so the next actions can unlock cleanly.',
        })
      : t('uploadUI.fileReadyHint', {
          defaultValue: 'Choose what you want to do next: summarize the lecture or jump into question generation.',
        });

  const handleOpenAnalysisPage = React.useCallback(() => {
    navigate('/analysis');
  }, [navigate]);

  const scrollToQuestionWorkspace = React.useCallback(() => {
    const questionWorkspaceSection = assessmentWorkspaceRef.current;
    if (!questionWorkspaceSection) {
      return;
    }

    /**
     * `/generate` is already the canonical question-generation page.
     * The CTA keeps the stable route and moves focus to the generator workspace
     * instead of introducing a second redundant question route.
     */
    if (window.location.hash !== '#question-generator') {
      window.history.replaceState(
        {},
        document.title,
        `${window.location.pathname}${window.location.search}#question-generator`
      );
    }

    questionWorkspaceSection.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });

    window.setTimeout(() => {
      questionWorkspaceSection.focus();
    }, 260);
  }, []);

  React.useEffect(() => {
    if (!isDocumentReady || window.location.hash !== '#question-generator') {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      assessmentWorkspaceRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [isDocumentReady]);

  return (
    <div className="space-y-8 sm:space-y-10">
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[2.75rem] border border-zinc-200/80 bg-white/88 px-5 py-7 shadow-[0_30px_80px_rgba(15,23,42,0.08)] backdrop-blur-2xl dark:border-zinc-800/80 dark:bg-zinc-950/70 sm:px-7 sm:py-9 lg:px-10 lg:py-11"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.12),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(34,211,238,0.08),transparent_35%)]" />
        <div className="absolute -top-28 inset-e-0 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute -bottom-24 inset-s-0 h-48 w-48 rounded-full bg-cyan-500/10 blur-3xl" />

        <div className="relative z-10 mx-auto max-w-5xl space-y-6 sm:space-y-8">
          <div className="space-y-4 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
              <Sparkles size={14} />
              <span>
                {t('uploadUI.uploadFirstEyebrow', {
                  defaultValue: 'Upload first workflow',
                })}
              </span>
            </div>

            <div className="space-y-3">
              <h1 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-white sm:text-5xl lg:text-[3.4rem]">
                {t('uploadUI.uploadFirstTitle', {
                  defaultValue: 'Upload your lecture once, then choose the next step with clarity.',
                })}
              </h1>
              <p className="mx-auto max-w-3xl text-sm leading-relaxed text-zinc-500 dark:text-zinc-400 sm:text-base lg:text-lg">
                {t('uploadUI.uploadFirstHint', {
                  defaultValue:
                    'Make the file the center of the workflow: upload it here, then continue into lecture summarization or question generation without visual clutter.',
                })}
              </p>
            </div>
          </div>

          {!hasDocument ? (
            <div className="mx-auto max-w-3xl">
              <FileUploader
                onFileSelect={handleFileSelect}
                isLoading={isLoading}
                stages={stages}
                elapsedTime={elapsed}
              />
            </div>
          ) : (
            <div className="mx-auto max-w-4xl space-y-5">
              {(isDocumentPreparing || isError) && stages?.length ? (
                <ProgressTracker
                  stages={stages}
                  isVisible
                  elapsedTime={elapsed}
                  status={status}
                  message={message}
                  onRetry={error?.retryAction}
                />
              ) : null}

              <div className="rounded-[2rem] border border-zinc-200/80 bg-white/78 p-5 shadow-lg shadow-zinc-900/5 backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-950/65 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-4">
                    <div
                      className={cn(
                        'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ring-1',
                        documentPreparationError
                          ? 'bg-red-500/12 text-red-500 ring-red-500/20'
                          : isDocumentPreparing
                            ? 'bg-amber-500/12 text-amber-500 ring-amber-500/20'
                            : 'bg-emerald-500/12 text-emerald-500 ring-emerald-500/20'
                      )}
                    >
                      {documentPreparationError ? (
                        <CircleAlert size={22} />
                      ) : isDocumentPreparing ? (
                        <LoaderCircle size={22} className="animate-spin" />
                      ) : (
                        <CheckCircle2 size={22} />
                      )}
                    </div>

                    <div className="space-y-2">
                      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                        {t('uploadUI.nextActionEyebrow', {
                          defaultValue: 'Choose the next step',
                        })}
                      </p>
                      <div>
                        <h2 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white sm:text-[2rem]">
                          {heroStateTitle}
                        </h2>
                        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-500 dark:text-zinc-400 sm:text-base">
                          {heroStateHint}
                        </p>
                      </div>
                    </div>
                  </div>

                  {isDocumentReady ? (
                    <div className="inline-flex items-center gap-2 self-start rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
                      <Sparkles size={14} />
                      <span>
                        {t('uploadUI.assessmentHeroBadge', {
                          defaultValue: 'Main generator flow',
                        })}
                      </span>
                    </div>
                  ) : null}
                </div>

                <CompactDocumentInfoBar
                  statusLabel={documentStatusLabel}
                  statusTone={documentStatusTone}
                  className="mt-5 shadow-none"
                  actions={
                    <>
                      <button
                        type="button"
                        onClick={handleUploadAnother}
                        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-100 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-600 transition-all hover:bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        <RefreshCcw size={14} />
                        <span>
                          {t('uploadUI.changeFile', {
                            defaultValue: 'Change file',
                          })}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveDocument}
                        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-red-500 transition-all hover:bg-red-500/15"
                      >
                        <Trash2 size={14} />
                        <span>
                          {t('uploadUI.removeCurrentFile', {
                            defaultValue: 'Remove file',
                          })}
                        </span>
                      </button>
                    </>
                  }
                />
              </div>

              <AnimatePresence initial={false}>
                {isDocumentReady ? (
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.24, ease: 'easeOut' }}
                    className="space-y-4"
                  >
                    <div className="space-y-2 text-center sm:text-start">
                      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                        {t('uploadUI.nextActionEyebrow', {
                          defaultValue: 'Choose the next step',
                        })}
                      </p>
                      <h2 className="text-xl font-black tracking-tight text-zinc-900 dark:text-white sm:text-2xl">
                        {t('uploadUI.nextActionTitle', {
                          defaultValue: 'What do you want to do with this lecture now?',
                        })}
                      </h2>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <NextStepActionCard
                        icon={Brain}
                        tone="summary"
                        title={t('uploadUI.lectureSummaryCta', {
                          defaultValue: 'تلخيص المحاضرة',
                        })}
                        description={t('uploadUI.lectureSummaryCtaDescription', {
                          defaultValue:
                            'Open the dedicated analysis workspace for a focused lecture summary, insights, and exports.',
                        })}
                        onClick={handleOpenAnalysisPage}
                      />
                      <NextStepActionCard
                        icon={FileQuestion}
                        tone="questions"
                        title={t('uploadUI.generateQuestionsNowCta', {
                          defaultValue: 'ولد أسئلتك الآن',
                        })}
                        description={t('uploadUI.generateQuestionsNowCtaDescription', {
                          defaultValue:
                            'Stay on the main generator page and jump directly to the question-generation workspace below.',
                        })}
                        onClick={scrollToQuestionWorkspace}
                      />
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          )}
        </div>
      </motion.section>

      {isDocumentReady ? (
        <motion.section
          ref={assessmentWorkspaceRef}
          id="question-generator"
          tabIndex={-1}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4 outline-none"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                {t('uploadUI.questionWorkspaceEyebrow', {
                  defaultValue: 'Question generation workspace',
                })}
              </p>
              <div>
                <h2 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
                  {t('uploadUI.questionWorkspaceTitle', {
                    defaultValue: 'ولد أسئلتك الآن',
                  })}
                </h2>
                <p className="mt-2 max-w-4xl text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                  {t('uploadUI.questionWorkspaceHint', {
                    defaultValue:
                      'Your uploaded lecture is already prepared. Tune the settings below and generate quizzes or question sets from the same shared file.',
                  })}
                </p>
              </div>
            </div>

            <div className="inline-flex items-center gap-2 self-start rounded-full border border-zinc-200 bg-zinc-100 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              <Sparkles size={14} />
              <span>
                {t('uploadUI.assessmentPrimaryEyebrow', {
                  defaultValue: 'Primary workflow',
                })}
              </span>
            </div>
          </div>

          <AssessmentStudio />
        </motion.section>
      ) : null}

      {isError ? (
        <div
          className={cn(
            'rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300'
          )}
        >
          {error?.message}
        </div>
      ) : null}
    </div>
  );
};
