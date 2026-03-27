import { getBearerAuthHeaders } from '../utils/authHeaders';
import { DocumentRuntimeContextRef } from '../ai/types';

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

function normalizeFetchError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error || 'document-runtime-request-failed'));
}

export async function intakeDocument(
  file: File,
  options: {
    signal?: AbortSignal;
    requestedPathway?: 'local_extraction' | 'direct_file_to_model';
  } = {}
): Promise<DocumentIntakeResponse> {
  const headers = await getBearerAuthHeaders({
    'Content-Type': 'application/octet-stream',
    'x-zootopia-file-name': encodeURIComponent(file.name),
    'x-zootopia-file-type': file.type || 'application/octet-stream',
    'x-zootopia-document-pathway': options.requestedPathway || 'local_extraction',
  });

  try {
    const response = await fetch('/api/documents/intake', {
      method: 'POST',
      headers,
      body: file,
      signal: options.signal,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.success === false) {
      throw new Error(String(payload?.error || 'document-intake-failed'));
    }

    return payload as DocumentIntakeResponse;
  } catch (error: unknown) {
    const normalized = normalizeFetchError(error);
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
