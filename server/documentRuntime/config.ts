import fs from 'fs';
import path from 'path';

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

export const DOCUMENT_RUNTIME_REDIS_URL = process.env.REDIS_URL?.trim() || '';

export const DOCUMENT_RUNTIME_REDIS_KEY_PREFIX =
  process.env.DOCUMENT_RUNTIME_REDIS_KEY_PREFIX?.trim() || 'zootopia:runtime';

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
  process.env.DOCUMENT_EXTRACTION_VERSION?.trim() || '2026.03.layered-runtime-v2';

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

/**
 * Production should run with Redis 8.6.x configured explicitly. The in-process
 * fallback exists only to preserve local development and CI behavior until the
 * real Redis runtime is provisioned.
 */
export function shouldAllowDocumentRuntimeMemoryFallback(): boolean {
  if (DOCUMENT_RUNTIME_REDIS_URL) {
    return false;
  }

  return DOCUMENT_RUNTIME_MEMORY_FALLBACK_ENABLED;
}
