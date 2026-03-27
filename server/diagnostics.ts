export type DiagnosticLevel = 'debug' | 'info' | 'warn' | 'error';

export interface DiagnosticContext {
  traceId?: string;
  area?: string;
  toolId?: string;
  modelId?: string;
  provider?: string;
  route?: string;
  userId?: string;
  stage?: string;
  status?: string;
  details?: Record<string, unknown>;
}

function getNodeEnv(): string | undefined {
  return (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV;
}

export function createTraceId(prefix: string = 'trace'): string {
  const random = Math.random().toString(16).slice(2, 14);
  return `${prefix}-${Date.now()}-${random}`;
}

export function maskSecret(value?: string): string {
  if (!value) return '';
  if (value.length <= 8) return '***';
  return `${value.slice(0, 4)}***${value.slice(-2)}`;
}

export function normalizeError(error: unknown): { message: string; code?: string; stack?: string } {
  const nodeEnv = getNodeEnv();

  if (error instanceof Error) {
    const withCode = error as Error & { code?: string };
    return {
      message: error.message,
      code: withCode.code,
      stack: nodeEnv !== 'production' ? error.stack : undefined,
    };
  }

  if (typeof error === 'string') {
    return { message: error };
  }

  return { message: 'Unknown error' };
}

export function logDiagnostic(level: DiagnosticLevel, event: string, context: DiagnosticContext = {}): void {
  const nodeEnv = getNodeEnv();

  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    traceId: context.traceId,
    area: context.area,
    route: context.route,
    toolId: context.toolId,
    modelId: context.modelId,
    provider: context.provider,
    userId: context.userId,
    stage: context.stage,
    status: context.status,
    details: context.details,
  };

  if (level === 'error') {
    console.error('[Diag]', JSON.stringify(payload));
    return;
  }

  if (level === 'warn') {
    console.warn('[Diag]', JSON.stringify(payload));
    return;
  }

  if (level === 'debug' && nodeEnv === 'production') {
    return;
  }

  console.log('[Diag]', JSON.stringify(payload));
}
