import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
} from 'react';
import { ExecutionTrace } from '../ai/types';
import {
  buildUploadedDocument,
  createEmptyDocument,
  UploadedDocument,
  DocumentLifecycleStatus,
} from './documentState';

/**
 * Global document state for the whole platform.
 *
 * IMPORTANT ARCHITECTURE RULE:
 * ---------------------------------------------------------
 * Uploaded document state MUST remain independent from:
 * - analysis panel visibility
 * - any specific tool page
 * - any temporary UI drawer or side panel
 *
 * That means:
 * - Closing the analysis panel must NOT remove the uploaded document
 * - Switching tools must NOT remove the uploaded document
 * - Only explicit remove/replace actions may clear the uploaded document
 */

export interface DocumentAnalysisResult {
  text: string;
  modelUsed?: string;
  modelId?: string;
  fallbackHappened?: boolean;
  updatedAt: string;
}

interface DocumentContextType {
  // Main global document object
  document: UploadedDocument;

  // Backward-compatible individual fields
  extractedText: string;
  context: string;
  fileName: string;
  file: File | null;
  fileSizeBytes: number | null;
  fileMimeType: string;
  uploadedAt: string | null;
  documentId: string | null;
  artifactId: string | null;
  sourceFileId: string | null;
  ownerRole: 'User' | 'Admin' | null;
  workspaceScope: 'user' | 'admin' | null;
  processingPathway: 'local_extraction' | 'direct_file_to_model' | null;
  runtimeOperationId: string | null;
  documentRevision: number;
  documentStatus: DocumentLifecycleStatus;
  isDocumentPreparing: boolean;
  documentPreparationError: string | null;
  hasDocument: boolean;

  // UI-only state for analysis panel
  isAnalysisPanelOpen: boolean;
  isAnalysisPanelExpanded: boolean;
  isDocumentSummaryVisible: boolean;

  // Shared document-bound analysis state
  analysisResult: DocumentAnalysisResult | null;
  analysisTrace: ExecutionTrace | null;

  // Core document actions
  setDocumentFile: (file: File | null) => void;
  setExtractedText: (text: string) => void;
  setContext: (context: string) => void;
  setFileName: (name: string) => void;
  setDocumentPreparationError: (message: string | null) => void;
  setAnalysisResult: (result: Omit<DocumentAnalysisResult, 'updatedAt'> & { updatedAt?: string } | null) => void;
  setAnalysisTrace: (trace: ExecutionTrace | null) => void;

  // Safe document lifecycle methods
  replaceDocument: (payload: {
    file: File | null;
    fileName?: string;
    fileSizeBytes?: number | null;
    mimeType?: string;
    artifactId?: string | null;
    sourceFileId?: string | null;
    ownerRole?: 'User' | 'Admin' | null;
    workspaceScope?: 'user' | 'admin' | null;
    processingPathway?: 'local_extraction' | 'direct_file_to_model' | null;
    runtimeOperationId?: string | null;
    documentId?: string | null;
    documentRevision?: number;
    uploadedAt?: string | null;
    documentStatus?: DocumentLifecycleStatus;
    extractedText?: string;
    context?: string;
  }) => void;

  clearDocument: () => void;

  // Analysis panel controls (must never clear the file)
  openAnalysisPanel: () => void;
  closeAnalysisPanel: () => void;
  setAnalysisPanelExpanded: (expanded: boolean) => void;
  setDocumentSummaryVisible: (visible: boolean) => void;
  toggleDocumentSummaryVisible: () => void;
  clearAnalysis: () => void;
}

const DocumentContext = createContext<DocumentContextType | undefined>(undefined);

export const DocumentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [document, setDocument] = useState<UploadedDocument>(createEmptyDocument);
  const [documentPreparationError, setDocumentPreparationErrorState] = useState<string | null>(null);
  const [analysisResult, setAnalysisResultState] = useState<DocumentAnalysisResult | null>(null);
  const [analysisTrace, setAnalysisTraceState] = useState<ExecutionTrace | null>(null);

  // Keep readiness calculation centralized so all tools observe the same state.
  const resolveDocumentPreparationStatus = useCallback((payload: {
    file: File | null;
    fileName?: string;
    documentId?: string | null;
    extractedText: string;
    context: string;
    previousStatus: DocumentLifecycleStatus;
  }): DocumentLifecycleStatus => {
    const hasDocumentIdentity = Boolean(payload.file || payload.documentId || payload.fileName?.trim());
    if (!hasDocumentIdentity) {
      return 'empty';
    }

    if (payload.extractedText.trim().length > 0 || payload.context.trim().length > 0) {
      return 'ready';
    }

    // A document with no prepared text/context is actively preparing unless it
    // has been explicitly cleared. Do not leak the previous "empty" state into
    // a new upload, or tools can think nothing is happening while extraction runs.
    return payload.previousStatus === 'empty' || payload.previousStatus === 'ready'
      ? 'preparing'
      : payload.previousStatus;
  }, []);

  /**
   * UI-only state.
   * This must never be used to clear the uploaded document.
   */
  const [isAnalysisPanelOpen, setIsAnalysisPanelOpen] = useState(false);
  const [isAnalysisPanelExpanded, setIsAnalysisPanelExpanded] = useState(false);
  const [isDocumentSummaryVisible, setIsDocumentSummaryVisible] = useState(true);

  const clearAnalysis = useCallback(() => {
    setAnalysisResultState(null);
    setAnalysisTraceState(null);
  }, []);

  const setAnalysisResult = useCallback((result: Omit<DocumentAnalysisResult, 'updatedAt'> & { updatedAt?: string } | null) => {
    if (!result) {
      setAnalysisResultState(null);
      return;
    }

    setAnalysisResultState({
      ...result,
      updatedAt: result.updatedAt || new Date().toISOString(),
    });
  }, []);

  const setAnalysisTrace = useCallback((trace: ExecutionTrace | null) => {
    setAnalysisTraceState(trace);
  }, []);

  const setDocumentFile = useCallback((file: File | null) => {
    /**
     * A newly selected document invalidates the previous analysis result.
     * Keep the uploaded file global, but do not let cross-file analysis leak
     * into the next workspace session.
     */
    clearAnalysis();
    setDocumentPreparationErrorState(null);
    setIsDocumentSummaryVisible(true);
    setDocument((prev) =>
      buildUploadedDocument({
        previous: prev,
        file,
        fileName: file?.name || '',
        fileSizeBytes: file?.size ?? null,
        mimeType: file?.type || '',
        artifactId: null,
        sourceFileId: null,
        ownerRole: null,
        workspaceScope: null,
        processingPathway: null,
        runtimeOperationId: null,
        documentId: null,
        extractedText: '',
        context: '',
        documentStatus: file ? 'preparing' : 'empty',
      })
    );
  }, [clearAnalysis]);

  const setExtractedText = useCallback((text: string) => {
    if (text.trim().length > 0) {
      setDocumentPreparationErrorState(null);
    }

    setDocument((prev) => {
      // Keep shared document context aligned with extracted text for tools such
      // as Chat that consume `context` rather than `extractedText`. If another
      // flow later writes a specialized context, preserve it instead of blindly
      // overwriting it.
      const shouldSyncContext = prev.context.trim().length === 0 || prev.context === prev.extractedText;
      const nextContext = shouldSyncContext ? text : prev.context;

      return {
        ...prev,
        extractedText: text,
        context: nextContext,
        documentStatus: resolveDocumentPreparationStatus({
          file: prev.file,
          fileName: prev.fileName,
          documentId: prev.documentId,
          extractedText: text,
          context: nextContext,
          previousStatus: prev.documentStatus,
        }),
      };
    });
  }, [resolveDocumentPreparationStatus]);

  const setContext = useCallback((context: string) => {
    if (context.trim().length > 0) {
      setDocumentPreparationErrorState(null);
    }

    setDocument((prev) => ({
      ...prev,
      context,
      documentStatus: resolveDocumentPreparationStatus({
        file: prev.file,
        fileName: prev.fileName,
        documentId: prev.documentId,
        extractedText: prev.extractedText,
        context,
        previousStatus: prev.documentStatus,
      }),
    }));
  }, [resolveDocumentPreparationStatus]);

  const setFileName = useCallback((name: string) => {
    setDocument((prev) => ({
      ...prev,
      fileName: name,
    }));
  }, []);

  const setDocumentPreparationError = useCallback((message: string | null) => {
    setDocumentPreparationErrorState(message);
  }, []);

  /**
   * Replaces the currently active uploaded document safely.
   * Use this when user uploads a new file intentionally.
   */
  const replaceDocument = useCallback((payload: {
    file: File | null;
    fileName?: string;
    fileSizeBytes?: number | null;
    mimeType?: string;
    artifactId?: string | null;
    sourceFileId?: string | null;
    ownerRole?: 'User' | 'Admin' | null;
    workspaceScope?: 'user' | 'admin' | null;
    processingPathway?: 'local_extraction' | 'direct_file_to_model' | null;
    runtimeOperationId?: string | null;
    documentId?: string | null;
    documentRevision?: number;
    uploadedAt?: string | null;
    documentStatus?: DocumentLifecycleStatus;
    extractedText?: string;
    context?: string;
  }) => {
    clearAnalysis();
    setDocumentPreparationErrorState(null);
    setIsDocumentSummaryVisible(true);

    // Opening the panel after a real upload/replacement is okay.
    if (payload.file) {
      setIsAnalysisPanelOpen(true);
    }
    setDocument((prev) =>
      buildUploadedDocument({
        previous: prev,
        file: payload.file,
        fileName: payload.fileName ?? payload.file?.name ?? '',
        fileSizeBytes: payload.fileSizeBytes ?? payload.file?.size ?? null,
        mimeType: payload.mimeType ?? payload.file?.type ?? '',
        artifactId: payload.artifactId ?? null,
        sourceFileId: payload.sourceFileId ?? null,
        ownerRole: payload.ownerRole ?? null,
        workspaceScope: payload.workspaceScope ?? null,
        processingPathway: payload.processingPathway ?? null,
        runtimeOperationId: payload.runtimeOperationId ?? null,
        documentId: payload.documentId ?? null,
        documentRevision: payload.documentRevision,
        uploadedAt: payload.uploadedAt ?? null,
        extractedText: payload.extractedText ?? '',
        context: payload.context ?? payload.extractedText ?? '',
        documentStatus: payload.documentStatus ?? resolveDocumentPreparationStatus({
          file: payload.file,
          fileName: payload.fileName ?? payload.file?.name ?? '',
          documentId: payload.documentId ?? null,
          extractedText: payload.extractedText ?? '',
          context: payload.context ?? payload.extractedText ?? '',
          previousStatus: prev.documentStatus,
        }),
      })
    );
  }, [clearAnalysis, resolveDocumentPreparationStatus]);

  /**
   * Only explicit remove action should call this.
   * Never call this from "close panel" or "collapse panel".
   */
  const clearDocument = useCallback(() => {
    setDocument(createEmptyDocument());
    setDocumentPreparationErrorState(null);
    clearAnalysis();
    setIsAnalysisPanelOpen(false);
    setIsAnalysisPanelExpanded(false);
    setIsDocumentSummaryVisible(true);
  }, [clearAnalysis]);

  const openAnalysisPanel = useCallback(() => {
    setIsAnalysisPanelOpen(true);
  }, []);

  const closeAnalysisPanel = useCallback(() => {
    /**
     * CRITICAL:
     * Close the panel only.
     * Do NOT clear the document.
     */
    setIsAnalysisPanelOpen(false);
    setIsAnalysisPanelExpanded(false);
  }, []);

  const toggleDocumentSummaryVisible = useCallback(() => {
    setIsDocumentSummaryVisible((current) => !current);
  }, []);

  const value = useMemo<DocumentContextType>(() => {
    return {
      document,

      extractedText: document.extractedText,
      context: document.context,
      fileName: document.fileName,
      file: document.file,
      fileSizeBytes: document.fileSizeBytes,
      fileMimeType: document.mimeType,
      uploadedAt: document.uploadedAt,
      documentId: document.documentId,
      artifactId: document.artifactId,
      sourceFileId: document.sourceFileId,
      ownerRole: document.ownerRole,
      workspaceScope: document.workspaceScope,
      processingPathway: document.processingPathway,
      runtimeOperationId: document.runtimeOperationId,
      documentRevision: document.documentRevision,
      documentStatus: document.documentStatus,
      isDocumentPreparing: document.documentStatus === 'preparing',
      documentPreparationError,
      hasDocument: !!document.file || !!document.fileName || !!document.extractedText || !!document.context,

      isAnalysisPanelOpen,
      isAnalysisPanelExpanded,
      isDocumentSummaryVisible,
      analysisResult,
      analysisTrace,

      setDocumentFile,
      setExtractedText,
      setContext,
      setFileName,
      setDocumentPreparationError,
      setAnalysisResult,
      setAnalysisTrace,

      replaceDocument,
      clearDocument,

      openAnalysisPanel,
      closeAnalysisPanel,
      setAnalysisPanelExpanded: setIsAnalysisPanelExpanded,
      setDocumentSummaryVisible: setIsDocumentSummaryVisible,
      toggleDocumentSummaryVisible,
      clearAnalysis,
    };
  }, [
    document,
    documentPreparationError,
    isAnalysisPanelOpen,
    isAnalysisPanelExpanded,
    isDocumentSummaryVisible,
    analysisResult,
    analysisTrace,
    setDocumentFile,
    setExtractedText,
    setContext,
    setFileName,
    setDocumentPreparationError,
    setAnalysisResult,
    setAnalysisTrace,
    replaceDocument,
    clearDocument,
    openAnalysisPanel,
    closeAnalysisPanel,
    toggleDocumentSummaryVisible,
    clearAnalysis,
  ]);

  return (
    <DocumentContext.Provider value={value}>
      {children}
    </DocumentContext.Provider>
  );
};

export const useDocument = () => {
  const context = useContext(DocumentContext);

  if (!context) {
    throw new Error('useDocument must be used within a DocumentProvider');
  }

  return context;
};
