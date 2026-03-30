import { logDiagnostic } from '../diagnostics.js';
import {
  getDatalabApiBaseUrl,
  getDatalabApiKey,
  getDatalabConvertMode,
  getDatalabConvertOutputFormat,
  getDatalabConvertPaginate,
  getDatalabConvertPollIntervalMs,
  getDatalabConvertPollTimeoutMs,
  getDatalabDisableImageCaptions,
  getDatalabDisableImageExtraction,
  getDatalabSaveCheckpoint,
  getDatalabSkipCache,
} from './config.js';
import { DocumentOperationState } from './types.js';

type DatalabOperationStage = Extract<
  DocumentOperationState['stage'],
  'submitting_to_datalab' | 'waiting_for_datalab' | 'finalizing_extraction'
>;

type DatalabConvertInput = {
  documentId: string;
  workflowId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  reportStage?: (input: {
    stage: DatalabOperationStage;
    message: string;
  }) => Promise<void> | void;
};

type DatalabSubmitResponse = {
  request_id?: string;
  request_check_url?: string;
  success?: boolean;
  error?: string | null;
  versions?: Record<string, unknown>;
};

type DatalabConvertResult = {
  requestId: string;
  requestCheckUrl: string;
  markdown: string;
  warnings: string[];
  versions: Record<string, unknown> | null;
  raw: Record<string, unknown>;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function maybeRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function maybeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readStringArray(record: Record<string, unknown> | null, key: string): string[] {
  const value = record?.[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function resolveMarkdown(record: Record<string, unknown> | null): string | null {
  if (!record) {
    return null;
  }

  const nestedData = maybeRecord(record.data);
  const nestedResult = maybeRecord(record.result);
  const nestedOutput = maybeRecord(record.output);

  const candidates = [
    record.markdown,
    nestedData?.markdown,
    nestedResult?.markdown,
    nestedOutput?.markdown,
  ];

  for (const candidate of candidates) {
    const resolved = maybeString(candidate);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

function buildExtractionError(input: {
  message: string;
  code: string;
  stage: DatalabOperationStage;
  retryable?: boolean;
}): Error & {
  code: string;
  operationStage: DatalabOperationStage;
  retryable: boolean;
} {
  const error = new Error(input.message) as Error & {
    code: string;
    operationStage: DatalabOperationStage;
    retryable: boolean;
  };
  error.code = input.code;
  error.operationStage = input.stage;
  error.retryable = input.retryable ?? true;
  return error;
}

async function parseJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {
      error: text,
    };
  }
}

export class DatalabConvertService {
  async convert(input: DatalabConvertInput): Promise<DatalabConvertResult> {
    const apiKey = getDatalabApiKey();
    if (!apiKey) {
      throw buildExtractionError({
        message: 'Datalab Convert is not configured. Set DATALAB_API_KEY on the backend runtime.',
        code: 'DATALAB_API_KEY_MISSING',
        stage: 'submitting_to_datalab',
        retryable: false,
      });
    }

    const baseUrl = getDatalabApiBaseUrl().replace(/\/+$/, '');
    const submitUrl = `${baseUrl}/api/v1/marker`;
    const submitTimeoutMs = Math.max(10_000, Math.min(45_000, getDatalabConvertPollTimeoutMs()));

    await input.reportStage?.({
      stage: 'submitting_to_datalab',
      message: 'Submitting document to Datalab Convert',
    });

    const form = new FormData();
    form.append(
      'file',
      new Blob([input.buffer], {
        type: input.mimeType || 'application/octet-stream',
      }),
      input.fileName
    );
    form.append('output_format', getDatalabConvertOutputFormat());
    form.append('mode', getDatalabConvertMode());
    form.append('paginate', String(getDatalabConvertPaginate()));
    form.append('disable_image_captions', String(getDatalabDisableImageCaptions()));
    form.append('disable_image_extraction', String(getDatalabDisableImageExtraction()));
    form.append('save_checkpoint', String(getDatalabSaveCheckpoint()));
    form.append('skip_cache', String(getDatalabSkipCache()));

    /**
     * Keep backend extraction waits bounded. The upload UI reflects the
     * backend-owned intake lifecycle, so external extraction calls must fail
     * explicitly instead of leaving the browser in an indefinite "preparing"
     * state while this request hangs on the network.
     */
    let submitResponse: Response;
    try {
      submitResponse = await fetchWithTimeout(
        submitUrl,
        {
          method: 'POST',
          headers: {
            'X-API-Key': apiKey,
            Accept: 'application/json',
          },
          body: form,
        },
        submitTimeoutMs
      );
    } catch (error: any) {
      const isTimeout = error?.name === 'AbortError';
      throw buildExtractionError({
        message: isTimeout
          ? `Datalab Convert submission timed out after ${submitTimeoutMs} ms.`
          : `Datalab Convert submission request failed: ${String(error?.message || 'network error')}`,
        code: isTimeout ? 'DATALAB_SUBMIT_TIMEOUT' : 'DATALAB_SUBMIT_REQUEST_FAILED',
        stage: 'submitting_to_datalab',
      });
    }

    const submitPayload = (await parseJsonResponse(submitResponse)) as DatalabSubmitResponse;
    if (!submitResponse.ok || submitPayload.success === false) {
      throw buildExtractionError({
        message: `Datalab Convert submission failed: ${submitPayload.error || submitResponse.statusText || 'request rejected'}`,
        code: 'DATALAB_SUBMIT_FAILED',
        stage: 'submitting_to_datalab',
      });
    }

    const requestId = maybeString(submitPayload.request_id);
    const requestCheckUrl = maybeString(submitPayload.request_check_url);
    if (!requestId || !requestCheckUrl) {
      throw buildExtractionError({
        message: 'Datalab Convert did not return a request id or request_check_url.',
        code: 'DATALAB_SUBMIT_INVALID_RESPONSE',
        stage: 'submitting_to_datalab',
      });
    }

    await input.reportStage?.({
      stage: 'waiting_for_datalab',
      message: 'Waiting for Datalab Convert to finish extraction',
    });

    const pollIntervalMs = Math.max(250, getDatalabConvertPollIntervalMs());
    const deadline = Date.now() + Math.max(1_000, getDatalabConvertPollTimeoutMs());
    const pollRequestTimeoutMs = Math.max(5_000, Math.min(20_000, pollIntervalMs * 8));
    const resolvedCheckUrl = new URL(requestCheckUrl, baseUrl).toString();
    let lastPayload: Record<string, unknown> | null = null;

    while (Date.now() <= deadline) {
      let pollResponse: Response;
      try {
        pollResponse = await fetchWithTimeout(
          resolvedCheckUrl,
          {
            method: 'GET',
            headers: {
              'X-API-Key': apiKey,
              Accept: 'application/json',
            },
          },
          pollRequestTimeoutMs
        );
      } catch (error: any) {
        const isTimeout = error?.name === 'AbortError';
        throw buildExtractionError({
          message: isTimeout
            ? `Datalab Convert status check timed out after ${pollRequestTimeoutMs} ms.`
            : `Datalab Convert status request failed: ${String(error?.message || 'network error')}`,
          code: isTimeout ? 'DATALAB_POLL_REQUEST_TIMEOUT' : 'DATALAB_POLL_REQUEST_FAILED',
          stage: 'waiting_for_datalab',
        });
      }

      const pollPayload = await parseJsonResponse(pollResponse);
      lastPayload = pollPayload;

      if (!pollResponse.ok) {
        throw buildExtractionError({
          message: `Datalab Convert status check failed: ${String(pollPayload.error || pollResponse.statusText || 'request rejected')}`,
          code: 'DATALAB_POLL_FAILED',
          stage: 'waiting_for_datalab',
        });
      }

      const status = String(pollPayload.status || '').trim().toLowerCase();
      const success = pollPayload.success;

      const markdown = resolveMarkdown(pollPayload);

      if ((status === 'complete' || (!status && markdown)) && success !== false) {
        await input.reportStage?.({
          stage: 'finalizing_extraction',
          message: 'Finalizing Datalab extraction artifacts',
        });

        if (!markdown) {
          throw buildExtractionError({
            message: 'Datalab Convert completed without markdown output.',
            code: 'DATALAB_EMPTY_MARKDOWN',
            stage: 'finalizing_extraction',
          });
        }

        return {
          requestId,
          requestCheckUrl: resolvedCheckUrl,
          markdown,
          warnings: Array.from(
            new Set([
              ...readStringArray(pollPayload, 'warnings'),
              ...readStringArray(maybeRecord(pollPayload.metadata), 'warnings'),
            ])
          ),
          versions: maybeRecord(submitPayload.versions) || maybeRecord(pollPayload.versions),
          raw: pollPayload,
        };
      }

      if (status === 'failed' || status === 'error' || status === 'cancelled' || success === false) {
        const errorMessage =
          maybeString(pollPayload.error) ||
          maybeString(pollPayload.message) ||
          `status=${status || 'unknown'}`;
        throw buildExtractionError({
          message: `Datalab Convert failed: ${errorMessage}`,
          code: 'DATALAB_CONVERT_FAILED',
          stage: 'waiting_for_datalab',
        });
      }

      await delay(pollIntervalMs);
    }

    logDiagnostic('error', 'document_runtime.datalab_poll_timeout', {
      area: 'document-runtime',
      stage: 'extract',
      status: 'failed',
      details: {
        documentId: input.documentId,
        workflowId: input.workflowId,
        fileName: input.fileName,
        requestCheckUrl: resolvedCheckUrl,
        lastStatus: lastPayload?.status || null,
      },
    });

    throw buildExtractionError({
      message: 'Datalab Convert timed out before extraction completed.',
      code: 'DATALAB_CONVERT_TIMEOUT',
      stage: 'waiting_for_datalab',
    });
  }
}

export const datalabConvertService = new DatalabConvertService();
