export type ServerDeployTarget = 'local' | 'cloud_run' | 'unknown';

type ServerRuntimeConfig = {
  deployTarget: ServerDeployTarget;
  publicAppUrl: string;
  allowedOrigins: string[];
};

function normalizeOptionalString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeAbsoluteUrl(value: unknown): string {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return '';
  }

  try {
    const parsed = new URL(normalized);
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function normalizeOrigin(value: unknown): string {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return '';
  }

  try {
    return new URL(normalized).origin;
  } catch {
    return '';
  }
}

function parseOriginList(value: unknown): string[] {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return [];
  }

  return normalized
    .split(',')
    .map((item) => normalizeOrigin(item))
    .filter((item) => Boolean(item));
}

function normalizeDeployTarget(value: unknown): ServerDeployTarget | null {
  const normalized = normalizeOptionalString(value).toLowerCase();
  if (!normalized) {
    return null;
  }

  if (['local', 'development', 'dev'].includes(normalized)) {
    return 'local';
  }

  if (['cloud_run', 'cloudrun', 'run_app'].includes(normalized)) {
    return 'cloud_run';
  }

  return 'unknown';
}

export function createServerRuntimeConfig(options: {
  isProduction: boolean;
  localPort: number;
}): ServerRuntimeConfig {
  const explicitTarget = normalizeDeployTarget(process.env.DEPLOY_TARGET);
  const inferredTarget: ServerDeployTarget =
    explicitTarget ||
    (process.env.K_SERVICE ? 'cloud_run' : options.isProduction ? 'unknown' : 'local');
  const localOrigins = [
    `http://localhost:${options.localPort}`,
    `http://127.0.0.1:${options.localPort}`,
  ];
  const publicAppUrl =
    normalizeAbsoluteUrl(process.env.APP_URL) ||
    localOrigins[0];
  const configuredOrigins = parseOriginList(process.env.CORS_ALLOWED_ORIGINS);
  const allowedOrigins = Array.from(
    new Set([
      ...configuredOrigins,
      normalizeOrigin(publicAppUrl),
      ...(!options.isProduction ? localOrigins : []),
    ].filter((item) => Boolean(item)))
  );

  return {
    deployTarget: inferredTarget,
    publicAppUrl,
    allowedOrigins,
  };
}

export function isAllowedOrigin(origin: unknown, allowedOrigins: string[]): boolean {
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) {
    return false;
  }

  return allowedOrigins.includes(normalizedOrigin);
}
