import fs from 'fs';
import path from 'path';

export type DocumentExtractionEngine = 'datalab_convert' | 'python_legacy';

function readBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return defaultValue;
  }

  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

function resolveVirtualEnvPython(virtualEnvPath: string | undefined): string | undefined {
  const normalized = virtualEnvPath?.trim();
  if (!normalized) {
    return undefined;
  }

  const candidates = [
    path.join(normalized, 'Scripts', 'python.exe'),
    path.join(normalized, 'Scripts', 'python'),
    path.join(normalized, 'bin', 'python'),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function resolveLocalProjectPythonExecutable(): string | undefined {
  return (
    resolveVirtualEnvPython(process.env.VIRTUAL_ENV) ||
    resolveVirtualEnvPython(path.join(process.cwd(), '.venv'))
  );
}

export const DOCUMENT_RUNTIME_STORAGE_ROOT =
  process.env.DOCUMENT_RUNTIME_STORAGE_ROOT?.trim() ||
  path.join(process.cwd(), 'runtime', 'document-workspaces');

export const DOCUMENT_RUNTIME_STATE_KEY_PREFIX =
  process.env.DOCUMENT_RUNTIME_STATE_KEY_PREFIX?.trim() ||
  process.env.DOCUMENT_RUNTIME_REDIS_KEY_PREFIX?.trim() ||
  'zootopia:runtime';

export const DOCUMENT_RUNTIME_ACTIVE_DOC_TTL_SEC = Number.parseInt(
  process.env.DOCUMENT_RUNTIME_ACTIVE_DOC_TTL_SEC || '43200',
  10
);

export const DOCUMENT_RUNTIME_OPERATION_TTL_SEC = Number.parseInt(
  process.env.DOCUMENT_RUNTIME_OPERATION_TTL_SEC || '21600',
  10
);

export const DOCUMENT_RUNTIME_DOCUMENT_TTL_SEC = Number.parseInt(
  process.env.DOCUMENT_RUNTIME_DOCUMENT_TTL_SEC || '43200',
  10
);

export const DOCUMENT_RUNTIME_LOCK_TTL_MS = Number.parseInt(
  process.env.DOCUMENT_RUNTIME_LOCK_TTL_MS || '30000',
  10
);

export const DOCUMENT_DIRECT_FILE_MODE_ENABLED =
  process.env.DOCUMENT_DIRECT_FILE_MODE_ENABLED === 'true';

export const DOCUMENT_RUNTIME_MEMORY_FALLBACK_ENABLED =
  process.env.DOCUMENT_RUNTIME_MEMORY_FALLBACK_ENABLED !== 'false';

export const DOCUMENT_EXTRACTION_VERSION =
  process.env.DOCUMENT_EXTRACTION_VERSION?.trim() ||
  (getDocumentExtractionEngine() === 'python_legacy'
    ? '2026.03.layered-runtime-v2'
    : '2026.03.datalab-convert-v1');

export const DOCUMENT_RUNTIME_ARTIFACT_TTL_SEC = Number.parseInt(
  process.env.DOCUMENT_RUNTIME_ARTIFACT_TTL_SEC || '43200',
  10
);

export const DOCUMENT_RUNTIME_PYTHON_EXECUTABLE =
  process.env.DOCUMENT_RUNTIME_PYTHON_EXECUTABLE?.trim() ||
  resolveLocalProjectPythonExecutable() ||
  'python';

export const DOCUMENT_RUNTIME_PYTHON_EXTRACTION_ENABLED =
  process.env.DOCUMENT_RUNTIME_PYTHON_EXTRACTION_ENABLED !== 'false';

export const DOCUMENT_RUNTIME_REQUIRE_PYTHON_OCR =
  process.env.DOCUMENT_RUNTIME_REQUIRE_PYTHON_OCR === 'true';

export const DOCUMENT_RUNTIME_PYTHON_SCRIPT_PATH =
  process.env.DOCUMENT_RUNTIME_PYTHON_SCRIPT_PATH?.trim() ||
  path.join(process.cwd(), 'server', 'documentRuntime', 'python', 'extract_document.py');

export function getDocumentExtractionEngine(): DocumentExtractionEngine {
  const configured = process.env.DOCUMENT_EXTRACTION_ENGINE?.trim().toLowerCase();
  if (configured === 'python_legacy') {
    return 'python_legacy';
  }

  return 'datalab_convert';
}

export function getDatalabApiKey(): string {
  return process.env.DATALAB_API_KEY?.trim() || '';
}

export function getDatalabApiBaseUrl(): string {
  return (
    process.env.DATALAB_BASE_URL?.trim() ||
    process.env.DATALAB_API_BASE_URL?.trim() ||
    'https://www.datalab.to'
  );
}

export function getDatalabConvertMode(): string {
  return process.env.DATALAB_CONVERT_MODE?.trim() || 'balanced';
}

export function getDatalabConvertOutputFormat(): string {
  return process.env.DATALAB_CONVERT_OUTPUT_FORMAT?.trim() || 'markdown';
}

export function getDatalabConvertPaginate(): boolean {
  return readBooleanEnv(process.env.DATALAB_CONVERT_PAGINATE, true);
}

export function getDatalabDisableImageCaptions(): boolean {
  return readBooleanEnv(process.env.DATALAB_DISABLE_IMAGE_CAPTIONS, true);
}

export function getDatalabDisableImageExtraction(): boolean {
  return readBooleanEnv(process.env.DATALAB_DISABLE_IMAGE_EXTRACTION, false);
}

export function getDatalabSaveCheckpoint(): boolean {
  return readBooleanEnv(process.env.DATALAB_SAVE_CHECKPOINT, true);
}

export function getDatalabSkipCache(): boolean {
  return readBooleanEnv(process.env.DATALAB_SKIP_CACHE, false);
}

export function getDatalabConvertPollIntervalMs(): number {
  return Number.parseInt(process.env.DATALAB_CONVERT_POLL_INTERVAL_MS || '1500', 10);
}

export function getDatalabConvertPollTimeoutMs(): number {
  return Number.parseInt(process.env.DATALAB_CONVERT_POLL_TIMEOUT_MS || '240000', 10);
}

export function shouldAllowDocumentRuntimeMemoryFallback(): boolean {
  return DOCUMENT_RUNTIME_MEMORY_FALLBACK_ENABLED;
}
