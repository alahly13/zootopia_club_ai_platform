type FrontendDeployTarget = 'local' | 'firebase_hosting' | 'netlify' | 'cloud_run' | 'unknown';
type RuntimeTimeoutProfile = 'standard' | 'relaxed';

type RuntimeTimeouts = {
  authSessionApiMs: number;
  authInitialResolutionMs: number;
  authProfileSyncMs: number;
  authIdentifierResolutionMs: number;
  adminClaimsSyncMs: number;
  adminLoginMs: number;
  startupFallbackMs: number;
  routeLoadMs: number;
  uploadPreparationBaseMs: number;
};

type RuntimeConfig = {
  deploymentTarget: FrontendDeployTarget;
  timeoutProfile: RuntimeTimeoutProfile;
  isLocalDevelopment: boolean;
  publicAppUrl: string;
  apiBaseUrl: string;
  usesCrossOriginApi: boolean;
};

type ImportMetaEnvRecord = Record<string, string | boolean | undefined>;

const importMetaEnv: ImportMetaEnvRecord =
  (import.meta as ImportMeta & { env?: ImportMetaEnvRecord }).env || {};

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

function normalizeRelativePath(pathname: string): string {
  const normalized = pathname.trim();
  if (!normalized) {
    return '/';
  }

  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function getBrowserOrigin(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.location.origin.replace(/\/$/, '');
}

function normalizeDeployTarget(value: unknown): FrontendDeployTarget | null {
  const normalized = normalizeOptionalString(value).toLowerCase();
  if (!normalized) {
    return null;
  }

  if (['local', 'development', 'dev'].includes(normalized)) {
    return 'local';
  }

  if (['firebase', 'firebase_hosting', 'hosting', 'web_app'].includes(normalized)) {
    return 'firebase_hosting';
  }

  if (normalized === 'netlify') {
    return 'netlify';
  }

  if (['cloud_run', 'cloudrun', 'run_app'].includes(normalized)) {
    return 'cloud_run';
  }

  return 'unknown';
}

function resolveFrontendDeployTarget(): FrontendDeployTarget {
  const explicit = normalizeDeployTarget(importMetaEnv.VITE_DEPLOY_TARGET);
  if (explicit) {
    return explicit;
  }

  if (typeof window === 'undefined') {
    return 'unknown';
  }

  const hostname = window.location.hostname.trim().toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0'
  ) {
    return 'local';
  }

  if (hostname.endsWith('.web.app') || hostname.endsWith('.firebaseapp.com')) {
    return 'firebase_hosting';
  }

  if (hostname.endsWith('.netlify.app')) {
    return 'netlify';
  }

  if (hostname.endsWith('.run.app')) {
    return 'cloud_run';
  }

  return 'unknown';
}

function resolveTimeoutProfile(target: FrontendDeployTarget): RuntimeTimeoutProfile {
  const explicit = normalizeOptionalString(importMetaEnv.VITE_RUNTIME_TIMEOUT_PROFILE).toLowerCase();
  if (explicit === 'standard') {
    return 'standard';
  }

  if (explicit === 'relaxed') {
    return 'relaxed';
  }

  return target === 'local' ? 'relaxed' : 'standard';
}

function resolveTimeouts(profile: RuntimeTimeoutProfile): RuntimeTimeouts {
  const useRelaxedProfile = profile === 'relaxed';

  return {
    authSessionApiMs: useRelaxedProfile ? 20_000 : 12_000,
    authInitialResolutionMs: useRelaxedProfile ? 24_000 : 15_000,
    authProfileSyncMs: useRelaxedProfile ? 18_000 : 12_000,
    authIdentifierResolutionMs: useRelaxedProfile ? 15_000 : 8_000,
    adminClaimsSyncMs: useRelaxedProfile ? 15_000 : 8_000,
    adminLoginMs: useRelaxedProfile ? 24_000 : 15_000,
    startupFallbackMs: useRelaxedProfile ? 32_000 : 18_000,
    routeLoadMs: useRelaxedProfile ? 22_000 : 12_000,
    uploadPreparationBaseMs: useRelaxedProfile ? 120_000 : 90_000,
  };
}

export const runtimeConfig: RuntimeConfig = (() => {
  const deploymentTarget = resolveFrontendDeployTarget();
  const browserOrigin = getBrowserOrigin();
  const publicAppUrl =
    normalizeAbsoluteUrl(importMetaEnv.VITE_PUBLIC_APP_URL) ||
    browserOrigin ||
    'http://localhost:3000';
  const apiBaseUrl = normalizeAbsoluteUrl(importMetaEnv.VITE_API_BASE_URL);
  const apiOrigin = apiBaseUrl ? new URL(apiBaseUrl).origin : '';
  const timeoutProfile = resolveTimeoutProfile(deploymentTarget);

  return {
    deploymentTarget,
    timeoutProfile,
    isLocalDevelopment: deploymentTarget === 'local',
    publicAppUrl,
    apiBaseUrl,
    usesCrossOriginApi: Boolean(apiBaseUrl && browserOrigin && apiOrigin !== browserOrigin),
  };
})();

export const runtimeTimeouts = resolveTimeouts(runtimeConfig.timeoutProfile);

export function buildApiUrl(pathname: string): string {
  const normalizedPath = normalizeRelativePath(pathname);
  if (!runtimeConfig.apiBaseUrl) {
    return normalizedPath;
  }

  return new URL(normalizedPath, `${runtimeConfig.apiBaseUrl}/`).toString();
}

export function buildAppUrl(pathname: string): string {
  const normalizedPath = normalizeRelativePath(pathname);
  return new URL(normalizedPath, `${runtimeConfig.publicAppUrl}/`).toString();
}

function shouldRewriteApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

/**
 * FRONTEND API RUNTIME BRIDGE
 * ---------------------------------------------------------------------------
 * The existing app intentionally uses relative `/api/*` calls everywhere so
 * local integrated development and Firebase Hosting rewrites stay simple.
 * When the frontend is hosted separately (for example Netlify) and the backend
 * lives on Cloud Run, this one bridge rewrites only those legacy `/api/*`
 * requests to the configured cross-origin backend instead of scattering
 * environment-specific fetch logic across the app.
 */
let hasInstalledApiFetchBridge = false;

export function installApiRuntimeFetchBridge() {
  if (
    typeof window === 'undefined' ||
    hasInstalledApiFetchBridge ||
    !runtimeConfig.usesCrossOriginApi
  ) {
    return;
  }

  const originalFetch = window.fetch.bind(window);

  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string') {
      if (input.startsWith('/api') || input === '/api') {
        return originalFetch(buildApiUrl(input), init);
      }

      return originalFetch(input, init);
    }

    if (input instanceof URL) {
      if (input.origin === window.location.origin && shouldRewriteApiPath(input.pathname)) {
        return originalFetch(buildApiUrl(`${input.pathname}${input.search}`), init);
      }

      return originalFetch(input, init);
    }

    if (input instanceof Request) {
      try {
        const requestUrl = new URL(input.url, window.location.origin);
        if (requestUrl.origin === window.location.origin && shouldRewriteApiPath(requestUrl.pathname)) {
          const rewrittenRequest = new Request(
            buildApiUrl(`${requestUrl.pathname}${requestUrl.search}`),
            input
          );
          return originalFetch(rewrittenRequest, init);
        }
      } catch {
        // Preserve the original request when URL normalization fails.
      }
    }

    return originalFetch(input, init);
  }) as typeof window.fetch;

  hasInstalledApiFetchBridge = true;
}
