const BASE_REDIS_KEY_PREFIX =
  process.env.ZOOTOPIA_REDIS_KEY_PREFIX?.trim() || 'zootopia';

/**
 * Redis namespace contract
 * ------------------------------------------------------------------
 * Keep top-level cache families stable and explicit so operators can scope
 * invalidation safely without guessing which subsystem owns which keys.
 */
export const REDIS_NAMESPACE_PREFIXES = {
  auth: `${BASE_REDIS_KEY_PREFIX}:auth`,
  runtime:
    process.env.DOCUMENT_RUNTIME_REDIS_KEY_PREFIX?.trim() ||
    `${BASE_REDIS_KEY_PREFIX}:runtime`,
} as const;

export const AUTH_SESSION_COOKIE_NAME =
  process.env.ZOOTOPIA_AUTH_SESSION_COOKIE_NAME?.trim() || 'zc_auth_session';

export function buildRedisNamespacedKey(
  prefix: string,
  ...segments: Array<string | number | null | undefined>
): string {
  return [prefix, ...segments]
    .filter(
      (segment): segment is string | number =>
        segment !== null &&
        segment !== undefined &&
        String(segment).trim().length > 0
    )
    .map((segment) => String(segment).trim())
    .join(':');
}
