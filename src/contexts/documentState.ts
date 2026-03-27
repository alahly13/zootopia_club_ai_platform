export type DocumentLifecycleStatus = 'empty' | 'preparing' | 'ready';

export interface UploadedDocument {
  file: File | null;
  fileName: string;
  fileSizeBytes: number | null;
  mimeType: string;
  artifactId: string | null;
  sourceFileId: string | null;
  ownerRole: 'User' | 'Admin' | null;
  workspaceScope: 'user' | 'admin' | null;
  processingPathway: 'local_extraction' | 'direct_file_to_model' | null;
  runtimeOperationId: string | null;
  extractedText: string;
  context: string;
  uploadedAt: string | null;
  documentId: string | null;
  documentRevision: number;
  documentStatus: DocumentLifecycleStatus;
}

export interface BuildUploadedDocumentInput {
  previous?: UploadedDocument;
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
  extractedText?: string;
  context?: string;
  uploadedAt?: string | null;
  documentId?: string | null;
  documentStatus?: DocumentLifecycleStatus;
  documentRevision?: number;
}

export function createDocumentIdentity(file: File | null, uploadedAt: string | null): string | null {
  if (!file) {
    return null;
  }

  const lastModified = typeof file.lastModified === 'number' && Number.isFinite(file.lastModified)
    ? file.lastModified
    : 0;

  return [
    uploadedAt || 'unknown',
    file.name || 'unknown',
    String(file.size ?? 0),
    file.type || 'unknown',
    String(lastModified),
  ].join(':');
}

export function createEmptyDocument(): UploadedDocument {
  return {
    file: null,
    fileName: '',
    fileSizeBytes: null,
    mimeType: '',
    artifactId: null,
    sourceFileId: null,
    ownerRole: null,
    workspaceScope: null,
    processingPathway: null,
    runtimeOperationId: null,
    extractedText: '',
    context: '',
    uploadedAt: null,
    documentId: null,
    documentRevision: 0,
    documentStatus: 'empty',
  };
}

export function resolveDocumentStatus(
  file: File | null,
  extractedText: string,
  fallback: DocumentLifecycleStatus = 'empty',
  options: {
    context?: string;
    documentId?: string | null;
    fileName?: string;
  } = {}
): DocumentLifecycleStatus {
  const hasDocumentIdentity = Boolean(
    file ||
    options.documentId ||
    options.fileName?.trim()
  );

  if (!hasDocumentIdentity) {
    return 'empty';
  }

  if (extractedText.trim().length > 0 || (options.context || '').trim().length > 0) {
    return 'ready';
  }

  return fallback === 'empty' ? 'preparing' : fallback;
}

export function buildUploadedDocument(input: BuildUploadedDocumentInput): UploadedDocument {
  const previous = input.previous || createEmptyDocument();
  const file = input.file;
  const uploadedAt = input.uploadedAt ?? (file ? new Date().toISOString() : null);
  const extractedText = input.extractedText ?? '';
  const context = input.context ?? '';
  const fileName = input.fileName ?? file?.name ?? '';
  const fileSizeBytes = input.fileSizeBytes ?? file?.size ?? null;
  const mimeType = input.mimeType ?? file?.type ?? '';
  const documentId = input.documentId ?? createDocumentIdentity(file, uploadedAt);
  const documentRevision = input.documentRevision ?? previous.documentRevision + 1;
  const documentStatus = input.documentStatus ?? resolveDocumentStatus(file, extractedText, previous.documentStatus, {
    context,
    documentId,
    fileName,
  });

  return {
    file,
    fileName,
    fileSizeBytes,
    mimeType,
    artifactId: input.artifactId ?? previous.artifactId ?? null,
    sourceFileId: input.sourceFileId ?? previous.sourceFileId ?? null,
    ownerRole: input.ownerRole ?? previous.ownerRole ?? null,
    workspaceScope: input.workspaceScope ?? previous.workspaceScope ?? null,
    processingPathway: input.processingPathway ?? previous.processingPathway ?? null,
    runtimeOperationId: input.runtimeOperationId ?? previous.runtimeOperationId ?? null,
    extractedText,
    context,
    uploadedAt,
    documentId,
    documentRevision,
    documentStatus,
  };
}
