import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import crypto from 'crypto';
import {
  DOCUMENT_RUNTIME_PYTHON_EXECUTABLE,
  DOCUMENT_RUNTIME_PYTHON_EXTRACTION_ENABLED,
  DOCUMENT_RUNTIME_PYTHON_SCRIPT_PATH,
} from './config.js';

type PythonWorkerCapabilities = {
  available: boolean;
  nativeReady: boolean;
  ocrReady: boolean;
  modules: Record<string, boolean>;
  reasons: string[];
};

type PythonWorkerExtractionResponse = {
  ok: boolean;
  native?: Record<string, unknown> | null;
  ocr?: Record<string, unknown> | null;
  docling?: Record<string, unknown> | null;
  notes?: string[];
  warnings?: string[];
  errors?: string[];
  capabilities?: PythonWorkerCapabilities;
};

function createTempJsonPath(prefix: string): string {
  return path.join(os.tmpdir(), `zootopia-${prefix}-${crypto.randomUUID()}.json`);
}

async function runPythonCommand<T>(command: 'detect' | 'extract', payload: Record<string, unknown>): Promise<T> {
  const inputPath = createTempJsonPath(`${command}-input`);
  const outputPath = createTempJsonPath(`${command}-output`);

  await fs.writeFile(inputPath, JSON.stringify(payload), 'utf8');

  try {
    await new Promise<void>((resolve, reject) => {
      let child;
      try {
        child = spawn(
          DOCUMENT_RUNTIME_PYTHON_EXECUTABLE,
          [DOCUMENT_RUNTIME_PYTHON_SCRIPT_PATH, command, inputPath, outputPath],
          {
            stdio: ['ignore', 'pipe', 'pipe'],
          }
        );
      } catch (error) {
        reject(error);
        return;
      }

      let stderr = '';
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(stderr.trim() || `PYTHON_WORKER_EXIT_${code}`));
      });
    });

    const raw = await fs.readFile(outputPath, 'utf8');
    return JSON.parse(raw) as T;
  } finally {
    await Promise.allSettled([
      fs.rm(inputPath, { force: true }),
      fs.rm(outputPath, { force: true }),
    ]);
  }
}

export class PythonDocumentWorker {
  private capabilitiesPromise: Promise<PythonWorkerCapabilities> | null = null;

  async detectCapabilities(): Promise<PythonWorkerCapabilities> {
    if (!DOCUMENT_RUNTIME_PYTHON_EXTRACTION_ENABLED) {
      return {
        available: false,
        nativeReady: false,
        ocrReady: false,
        modules: {},
        reasons: ['Python extraction has been disabled by configuration.'],
      };
    }

    if (!this.capabilitiesPromise) {
      this.capabilitiesPromise = runPythonCommand<PythonWorkerCapabilities>('detect', {
        pythonExecutable: DOCUMENT_RUNTIME_PYTHON_EXECUTABLE,
      }).catch((error) => ({
        available: false,
        nativeReady: false,
        ocrReady: false,
        modules: {},
        reasons: [String((error as Error)?.message || 'python-worker-unavailable')],
      }));
    }

    return this.capabilitiesPromise;
  }

  async extract(input: {
    sourcePath: string;
    fileName: string;
    mimeType: string;
    mode: 'native' | 'ocr' | 'hybrid';
    fileType: string;
  }): Promise<PythonWorkerExtractionResponse> {
    const capabilities = await this.detectCapabilities();
    if (!capabilities.available) {
      return {
        ok: false,
        capabilities,
        notes: [],
        errors: capabilities.reasons,
      };
    }

    try {
      return await runPythonCommand<PythonWorkerExtractionResponse>('extract', input);
    } catch (error) {
      return {
        ok: false,
        capabilities,
        notes: [],
        errors: [String((error as Error)?.message || 'python-extract-failed')],
      };
    }
  }
}

export const pythonDocumentWorker = new PythonDocumentWorker();
