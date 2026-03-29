import { getBearerAuthHeaders } from '../utils/authHeaders';
import { DocumentRuntimeContextRef } from '../ai/types';
import { logger } from '../utils/logger';

export interface DocumentIntakeResponse {
  success: true;
  document: {
    documentId: string;
    workflowId: string;
    artifactId: string;
    sourceFileId: string;
    fileName: string;
    mimeType: string;
    fileType?: string;
    fileSizeBytes: number;
    status: string;
    processingPathway: 'local_extraction' | 'direct_file_to_model';
    runtimeOperationId: string;
    workspaceScope: 'user' | 'admin';
    ownerRole: 'User' | 'Admin';
  };
  artifact: {
    artifactId: string;
    extractionStrategy: string;
    extractionVersion: string;
    languageHints: string[];
    textLength: number;
    pageCount: number;
    extractedText: string;
  };
  runtime: {
    documentId: string;
    workflowId: string;
    artifactId: string | null;
    processingPathway: 'local_extraction' | 'direct_file_to_model';
    sourceFileId: string;
    fileName: string;
    mimeType: string;
    fileType?: string;
    updatedAt: string;
  };
  operation: {
    operationId: string;
    documentId: string;
    stage: string;
    status: string;
    message: string;
    processingPathway: 'local_extraction' | 'direct_file_to_model';
    startedAt: string;
    updatedAt: string;
  };
}

export interface PreparedDocumentArtifactPayload {
  artifactId: string;
  documentId: string;
  workflowId: string;
  sourceFileId: string;
  sourceFileName: string;
  sourceMimeType: string;
  fileType: string;
  normalizedText: string;
  normalizedMarkdown: string;
  headingTree: Array<Record<string, unknown>>;
  pageMap: Array<Record<string, unknown>>;
  extractionMeta: Record<string, unknown>;
  languageHints: string[];
  pageSegments: Array<Record<string, unknown>>;
  sourceAttribution: Array<Record<string, unknown>>;
}

export interface ActivePreparedDocumentResponse {
  success: true;
  activeDocument: null | {
    documentId: string;
    workflowId: string;
    artifactId: string | null;
    processingPathway: 'local_extraction' | 'direct_file_to_model';
    sourceFileId: string;
    fileName: string;
    mimeType: string;
    fileType?: string;
    updatedAt: string;
  };
  document?: {
    documentId: string;
    workflowId: string;
    sourceFileId: string;
    activeArtifactId: string | null;
    ownerRole: 'User' | 'Admin';
    workspaceScope: 'user' | 'admin';
    processingPathway: 'local_extraction' | 'direct_file_to_model';
    fileName: string;
    mimeType: string;
    fileType: string;
    fileSizeBytes: number;
    runtimeOperationId: string;
  };
  artifact?: {
    artifactId: string;
    extractionStrategy: string;
    extractionVersion: string;
    languageHints: string[];
    textLength: number;
    pageCount: number;
  };
  payload?: PreparedDocumentArtifactPayload;
}

export interface DocumentPromptContextResponse {
  success: true;
  documentId: string;
  artifactId: string;
  fileContext: string;
  additionalContext: Record<string, unknown>;
}

function normalizeFetchError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error || 'document-runtime-request-failed'));
}

export interface DocumentIntakeUploadState {
  phase: 'started' | 'progress' | 'completed';
  requestUrl: string;
  loadedBytes: number;
  totalBytes: number | null;
}

export interface DocumentIntakePreparationState {
  phase: 'started';
  requestUrl: string;
}

export async function intakeDocument(
  file: File,
  options: {
    signal?: AbortSignal;
    requestedPathway?: 'local_extraction' | 'direct_file_to_model';
    onUploadStateChange?: (state: DocumentIntakeUploadState) => void;
    onPreparationStateChange?: (state: DocumentIntakePreparationState) => void;
  } = {}
): Promise<DocumentIntakeResponse> {
  const requestedPathway = options.requestedPathway || 'local_extraction';
  const requestUrl = '/api/documents/intake';

  logger.info('Document intake request started', {
    area: 'documents',
    event: 'document-intake-request-started',
    fileName: file.name,
    fileSizeBytes: file.size,
    mimeType: file.type || 'application/octet-stream',
    requestedPathway,
    requestUrl,
    signalAborted: options.signal?.aborted || false,
  });

  const headers = await getBearerAuthHeaders({
    'Content-Type': 'application/octet-stream',
    'x-zootopia-file-name': encodeURIComponent(file.name),
    'x-zootopia-file-type': file.type || 'application/octet-stream',
    'x-zootopia-document-pathway': requestedPathway,
  });

  let responseStatus: number | null = null;

  try {
    const payload = await new Promise<DocumentIntakeResponse>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let settled = false;
      let uploadCompleted = false;

      const finishWithError = (error: unknown) => {
        if (settled) {
          return;
        }

        settled = true;
        reject(normalizeFetchError(error));
      };

      const finishWithSuccess = (value: DocumentIntakeResponse) => {
        if (settled) {
          return;
        }

        settled = true;
        resolve(value);
      };

      const abortHandler = () => {
        xhr.abort();
      };

      if (options.signal) {
        if (options.signal.aborted) {
          finishWithError(options.signal.reason || new DOMException('The operation was aborted.', 'AbortError'));
          return;
        }

        options.signal.addEventListener('abort', abortHandler, { once: true });
      }

      const cleanup = () => {
        if (options.signal) {
          options.signal.removeEventListener('abort', abortHandler);
        }
      };

      xhr.open('POST', requestUrl, true);
      Object.entries(headers).forEach(([key, value]) => {
        xhr.setRequestHeader(key, value);
      });

      xhr.upload.onloadstart = () => {
        options.onUploadStateChange?.({
          phase: 'started',
          requestUrl,
          loadedBytes: 0,
          totalBytes: file.size || null,
        });
      };

      xhr.upload.onprogress = (event) => {
        options.onUploadStateChange?.({
          phase: 'progress',
          requestUrl,
          loadedBytes: event.loaded,
          totalBytes: event.lengthComputable ? event.total : file.size || null,
        });
      };

      xhr.upload.onload = () => {
        uploadCompleted = true;
        options.onUploadStateChange?.({
          phase: 'completed',
          requestUrl,
          loadedBytes: file.size,
          totalBytes: file.size || null,
        });
        options.onPreparationStateChange?.({
          phase: 'started',
          requestUrl,
        });
      };

      xhr.onerror = () => {
        cleanup();
        finishWithError(new Error('document-intake-failed'));
      };

      xhr.onabort = () => {
        cleanup();
        finishWithError(options.signal?.reason || new DOMException('The operation was aborted.', 'AbortError'));
      };

      xhr.onload = () => {
        cleanup();
        responseStatus = xhr.status;

        if (!uploadCompleted) {
          options.onUploadStateChange?.({
            phase: 'completed',
            requestUrl,
            loadedBytes: file.size,
            totalBytes: file.size || null,
          });
          options.onPreparationStateChange?.({
            phase: 'started',
            requestUrl,
          });
        }

        try {
          const responseText = xhr.responseText || '';
          const parsedPayload = responseText ? JSON.parse(responseText) : {};

          if (xhr.status < 200 || xhr.status >= 300 || parsedPayload?.success === false) {
            finishWithError(new Error(String(parsedPayload?.error || 'document-intake-failed')));
            return;
          }

          finishWithSuccess(parsedPayload as DocumentIntakeResponse);
        } catch (error) {
          finishWithError(error);
        }
      };

      try {
        xhr.send(file);
      } catch (error) {
        cleanup();
        finishWithError(error);
      }
    });

    logger.info('Document intake request completed', {
      area: 'documents',
      event: 'document-intake-request-completed',
      fileName: file.name,
      responseStatus,
      documentId: payload?.document?.documentId || null,
      artifactId: payload?.artifact?.artifactId || null,
      operationId: payload?.operation?.operationId || null,
    });

    return payload as DocumentIntakeResponse;
  } catch (error: unknown) {
    const normalized = normalizeFetchError(error);
    logger.warn('Document intake request failed', {
      area: 'documents',
      event: 'document-intake-request-failed',
      fileName: file.name,
      requestedPathway,
      responseStatus,
      signalAborted: options.signal?.aborted || false,
      error: normalized.message,
    });
    if (normalized.name === 'AbortError') {
      throw new Error('File processing was cancelled.');
    }
    throw normalized;
  }
}

export async function deleteDocumentArtifact(documentId: string): Promise<void> {
  const headers = await getBearerAuthHeaders();
  const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/artifact`, {
    method: 'DELETE',
    headers,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(String(payload?.error || 'document-delete-failed'));
  }
}

export async function cancelDocumentProcessing(
  documentId: string,
  operationId?: string | null
): Promise<void> {
  const headers = await getBearerAuthHeaders({
    'Content-Type': 'application/json',
  });
  const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/cancel`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      operationId: operationId || undefined,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(String(payload?.error || 'document-cancel-failed'));
  }
}

export async function fetchActivePreparedDocument(): Promise<ActivePreparedDocumentResponse> {
  const headers = await getBearerAuthHeaders();
  const response = await fetch('/api/documents/active', {
    method: 'GET',
    headers,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(String(payload?.error || 'document-active-load-failed'));
  }

  return payload as ActivePreparedDocumentResponse;
}

export async function fetchDocumentPromptContext(input: {
  documentId: string;
  toolId: string;
  mode?: string | null;
  limit?: number;
}): Promise<DocumentPromptContextResponse> {
  const headers = await getBearerAuthHeaders();
  const query = new URLSearchParams({
    toolId: input.toolId,
  });
  if (input.mode) {
    query.set('mode', input.mode);
  }
  if (typeof input.limit === 'number' && Number.isFinite(input.limit) && input.limit > 0) {
    query.set('limit', String(Math.floor(input.limit)));
  }

  const response = await fetch(
    `/api/documents/${encodeURIComponent(input.documentId)}/context?${query.toString()}`,
    {
      method: 'GET',
      headers,
    }
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(String(payload?.error || 'document-context-load-failed'));
  }

  return payload as DocumentPromptContextResponse;
}

export function buildDocumentContextRef(input: {
  documentId?: string | null;
  artifactId?: string | null;
  processingPathway?: 'local_extraction' | 'direct_file_to_model' | null;
  documentRevision?: number | null;
  fileName?: string | null;
}): DocumentRuntimeContextRef | undefined {
  if (!input.documentId) {
    return undefined;
  }

  return {
    documentId: input.documentId,
    artifactId: input.artifactId || null,
    pathway: input.processingPathway || 'local_extraction',
    documentRevision: input.documentRevision ?? null,
    fileName: input.fileName || null,
  };
}
