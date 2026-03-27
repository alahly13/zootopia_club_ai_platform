export type AuthSessionMode = 'normal' | 'fast_access' | 'admin';

export type AuthSessionStatus =
  | 'authenticated'
  | 'restoring'
  | 'expired'
  | 'invalid'
  | 'logging_out';

export type AuthSessionSource = 'login' | 'restore' | 'refresh' | 'reentry';

export type AuthSessionLoginMethod =
  | 'password'
  | 'google'
  | 'phone_otp'
  | 'custom_token'
  | 'unknown';

export interface AuthSessionDocumentContext {
  documentId?: string | null;
  artifactId?: string | null;
  workspaceScope?: 'user' | 'admin' | null;
  ownerRole?: 'User' | 'Admin' | null;
  processingPathway?: 'local_extraction' | 'direct_file_to_model' | null;
}

export interface AuthSessionRecord {
  sessionId: string;
  uid: string;
  mode: AuthSessionMode;
  role: 'Admin' | 'User';
  adminLevel?: string | null;
  accountScope?: string | null;
  isTemporaryAccess: boolean;
  status: AuthSessionStatus;
  sessionSource: AuthSessionSource;
  loginMethod: AuthSessionLoginMethod;
  issuedAt: string;
  refreshedAt: string;
  expiresAt: string;
  lastActivityAt: string;
  lastRoute?: string | null;
  email?: string | null;
  authProviders?: string[];
  temporaryAccessExpiresAt?: string | null;
  profileCompletionStage?: string | null;
  documentContext?: AuthSessionDocumentContext | null;
  restoreFailureReason?: string | null;
  logoutReason?: string | null;
}

export interface ParsedAuthSessionCookie {
  rawValue: string;
  mode: AuthSessionMode;
  sessionId: string;
}

export const AUTH_SESSION_TTL_SEC: Record<AuthSessionMode, number> = {
  normal: Number.parseInt(
    process.env.ZOOTOPIA_AUTH_SESSION_NORMAL_TTL_SEC || '86400',
    10
  ),
  fast_access: Number.parseInt(
    process.env.ZOOTOPIA_AUTH_SESSION_FAST_ACCESS_TTL_SEC || '21600',
    10
  ),
  admin: Number.parseInt(
    process.env.ZOOTOPIA_AUTH_SESSION_ADMIN_TTL_SEC || '14400',
    10
  ),
};

export const AUTH_SESSION_TOUCH_WINDOW_MS = Number.parseInt(
  process.env.ZOOTOPIA_AUTH_SESSION_TOUCH_WINDOW_MS || '60000',
  10
);

export const AUTH_SESSION_INVALIDATION_TTL_SEC = Number.parseInt(
  process.env.ZOOTOPIA_AUTH_SESSION_INVALIDATION_TTL_SEC || '600',
  10
);

export function isAuthSessionMode(value: unknown): value is AuthSessionMode {
  return value === 'normal' || value === 'fast_access' || value === 'admin';
}

export function parseAuthSessionCookieValue(
  value: unknown
): ParsedAuthSessionCookie | null {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return null;
  }

  const match = /^(normal|fast_access|admin)\.([A-Za-z0-9-]+)$/.exec(normalized);
  if (!match) {
    return null;
  }

  return {
    rawValue: normalized,
    mode: match[1] as AuthSessionMode,
    sessionId: match[2],
  };
}

export function serializeAuthSessionCookieValue(input: {
  mode: AuthSessionMode;
  sessionId: string;
}): string {
  return `${input.mode}.${input.sessionId}`;
}

export function resolveAuthSessionTtlSec(params: {
  mode: AuthSessionMode;
  temporaryAccessExpiresAt?: string | null;
}): number {
  const fallback = AUTH_SESSION_TTL_SEC[params.mode];
  if (params.mode !== 'fast_access' || !params.temporaryAccessExpiresAt) {
    return fallback;
  }

  const temporaryAccessExpiryMs = new Date(params.temporaryAccessExpiresAt).getTime();
  if (!Number.isFinite(temporaryAccessExpiryMs)) {
    return fallback;
  }

  const remainingSec = Math.floor((temporaryAccessExpiryMs - Date.now()) / 1000);
  return Math.max(300, Math.min(fallback, remainingSec));
}
