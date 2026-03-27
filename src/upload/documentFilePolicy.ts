export const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024;

export const SUPPORTED_UPLOAD_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/plain',
  'text/csv',
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

export const DOCUMENT_UPLOAD_ACCEPT: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel': ['.xls'],
  'text/plain': ['.txt'],
  'text/csv': ['.csv'],
  'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
};

export const SUPPORTED_UPLOAD_EXTENSIONS = new Set([
  'pdf',
  'docx',
  'xlsx',
  'xls',
  'csv',
  'txt',
  'png',
  'jpg',
  'jpeg',
  'webp',
]);

export const IMAGE_UPLOAD_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp']);

export const EXTENSION_TO_ALLOWED_MIME_TYPES: Record<string, Set<string>> = {
  pdf: new Set(['application/pdf', 'application/x-pdf']),
  docx: new Set([
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
  ]),
  xlsx: new Set(['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
  xls: new Set(['application/vnd.ms-excel']),
  csv: new Set(['text/csv', 'application/vnd.ms-excel', 'text/plain']),
  txt: new Set(['text/plain']),
  png: new Set(['image/png']),
  jpg: new Set(['image/jpeg', 'image/jpg']),
  jpeg: new Set(['image/jpeg', 'image/jpg']),
  webp: new Set(['image/webp']),
};

export const GENERIC_BROWSER_MIME_TYPES = new Set([
  '',
  'application/octet-stream',
  'binary/octet-stream',
]);

export type DocumentUploadDescriptor = {
  fileName: string;
  mimeType?: string | null;
  sizeBytes: number;
};

export function normalizeUploadExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase()?.trim() || '';
}

export function isImageUploadExtension(extension: string): boolean {
  return IMAGE_UPLOAD_EXTENSIONS.has(extension);
}

/**
 * Shared validation contract for both browser-side upload UX and backend
 * document intake. Keep this policy centralized so upload eligibility does not
 * drift across app layers.
 */
export function validateUploadDescriptor(input: DocumentUploadDescriptor): void {
  if (!input.fileName.trim()) {
    throw new Error('No file selected.');
  }

  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new Error('File is empty.');
  }

  if (input.sizeBytes > MAX_UPLOAD_SIZE_BYTES) {
    throw new Error('File too large. Max size is 50MB.');
  }

  const extension = normalizeUploadExtension(input.fileName);
  if (!SUPPORTED_UPLOAD_EXTENSIONS.has(extension)) {
    throw new Error('Unsupported file format.');
  }

  const normalizedMimeType = String(input.mimeType || '').trim().toLowerCase();
  const allowedMimeTypes = EXTENSION_TO_ALLOWED_MIME_TYPES[extension];
  const mimeLooksGeneric = GENERIC_BROWSER_MIME_TYPES.has(normalizedMimeType);
  const typeAllowed =
    SUPPORTED_UPLOAD_MIME_TYPES.includes(
      normalizedMimeType as (typeof SUPPORTED_UPLOAD_MIME_TYPES)[number]
    ) ||
    (allowedMimeTypes?.has(normalizedMimeType) ?? false);

  if (!mimeLooksGeneric && !typeAllowed) {
    throw new Error('Unsupported file format.');
  }
}
