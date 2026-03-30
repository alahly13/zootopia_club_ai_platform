export const WELCOME_POPUP_SESSION_KEY = 'zootopia_welcome_popup_shown';
// Keep the existing audio key name for backward compatibility with sessions
// that were already using the old welcome-audio once-per-session behavior.
export const WELCOME_AUDIO_SESSION_KEY = 'hasPlayedWelcomeAudio';
export const WELCOME_ENTRY_PATHS = ['/', '/home', '/generate'] as const;
export const WELCOME_FLOW_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const WELCOME_AUDIO_START_DELAY_MS = 220;

const WELCOME_POPUP_SESSION_PREFIX = 'zootopia_welcome_popup_session';
const WELCOME_AUDIO_SESSION_PREFIX = 'zootopia_welcome_audio_session';
const WELCOME_POPUP_LAST_SHOWN_PREFIX = 'zootopia_welcome_popup_last_shown';
const WELCOME_AUDIO_LAST_ATTEMPT_PREFIX = 'zootopia_welcome_audio_last_attempt';

type WelcomeContextUser = {
  id?: string | null;
  email?: string | null;
  role?: string | null;
  accountScope?: string | null;
  temporaryAccessType?: string | null;
};

function canUseSessionStorage() {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

function canUseLocalStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function safeSessionGetItem(key: string) {
  if (!canUseSessionStorage()) {
    return null;
  }

  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionSetItem(key: string, value: string) {
  if (!canUseSessionStorage()) {
    return;
  }

  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Storage access can fail in privacy-restricted environments.
  }
}

function safeSessionRemoveItem(key: string) {
  if (!canUseSessionStorage()) {
    return;
  }

  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Storage access can fail in privacy-restricted environments.
  }
}

function safeLocalGetItem(key: string) {
  if (!canUseLocalStorage()) {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalSetItem(key: string, value: string) {
  if (!canUseLocalStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage access can fail in privacy-restricted environments.
  }
}

function readTimestamp(key: string): number | null {
  const value = safeLocalGetItem(key);
  const parsed = value ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function writeTimestamp(key: string, timestamp = Date.now()) {
  safeLocalSetItem(key, String(timestamp));
}

function sessionKey(prefix: string, contextKey: string) {
  return `${prefix}:${contextKey}`;
}

function storageKey(prefix: string, contextKey: string) {
  return `${prefix}:${contextKey}`;
}

export function readWelcomeSessionFlag(key: string): boolean {
  const value = safeSessionGetItem(key);
  if (value === null) {
    return false;
  }

  if (value === 'true') {
    return true;
  }

  const timestamp = Number(value);
  return Number.isFinite(timestamp);
}

export function writeWelcomeSessionFlag(key: string) {
  safeSessionSetItem(key, String(Date.now()));
}

function readSessionTimestamp(key: string): number | null {
  const value = safeSessionGetItem(key);
  if (value === null) {
    return null;
  }

  if (value === 'true') {
    const upgradedTimestamp = Date.now();
    safeSessionSetItem(key, String(upgradedTimestamp));
    return upgradedTimestamp;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function clearWelcomeSessionFlags() {
  if (!canUseSessionStorage()) {
    return;
  }

  try {
    const keysToRemove: string[] = [];
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (!key) continue;

      if (
        key === WELCOME_POPUP_SESSION_KEY ||
        key === WELCOME_AUDIO_SESSION_KEY ||
        key.startsWith(`${WELCOME_POPUP_SESSION_PREFIX}:`) ||
        key.startsWith(`${WELCOME_AUDIO_SESSION_PREFIX}:`)
      ) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => safeSessionRemoveItem(key));
  } catch {
    safeSessionRemoveItem(WELCOME_POPUP_SESSION_KEY);
    safeSessionRemoveItem(WELCOME_AUDIO_SESSION_KEY);
  }
}

/**
 * Keep the welcome trigger tied to the shared authenticated landing surface.
 * This gives all account systems one coherent entry point without duplicating
 * role-specific popup/audio logic across login flows.
 */
export function isWelcomeEntryPath(pathname: string) {
  return WELCOME_ENTRY_PATHS.some((allowedPath) => allowedPath === pathname);
}

export function resolveWelcomeContextKey(user: WelcomeContextUser | null | undefined) {
  const modeKey =
    user?.temporaryAccessType?.trim()
      ? `temporary:${user.temporaryAccessType.trim().toLowerCase()}`
      : user?.accountScope?.trim()
        ? `scope:${user.accountScope.trim().toLowerCase()}`
        : user?.role?.trim()
          ? `role:${user.role.trim().toLowerCase()}`
          : 'authenticated';

  if (user?.id?.trim()) {
    return `user:${user.id.trim()}:${modeKey}`;
  }

  if (user?.email?.trim()) {
    return `email:${user.email.trim().toLowerCase()}:${modeKey}`;
  }

  return modeKey;
}

export function hasWelcomePopupBeenHandledInThisSession(contextKey: string) {
  const handledAt = readSessionTimestamp(
    sessionKey(WELCOME_POPUP_SESSION_PREFIX, contextKey)
  );

  if (handledAt === null) {
    return false;
  }

  return Date.now() - handledAt < WELCOME_FLOW_INTERVAL_MS;
}

export function markWelcomePopupHandledInThisSession(contextKey: string) {
  writeWelcomeSessionFlag(sessionKey(WELCOME_POPUP_SESSION_PREFIX, contextKey));
}

export function hasWelcomeAudioBeenHandledInThisSession(contextKey: string) {
  const handledAt = readSessionTimestamp(
    sessionKey(WELCOME_AUDIO_SESSION_PREFIX, contextKey)
  );

  if (handledAt === null) {
    return false;
  }

  return Date.now() - handledAt < WELCOME_FLOW_INTERVAL_MS;
}

export function markWelcomeAudioHandledInThisSession(contextKey: string) {
  writeWelcomeSessionFlag(sessionKey(WELCOME_AUDIO_SESSION_PREFIX, contextKey));
}

export function readWelcomePopupLastShownAt(contextKey: string): number | null {
  return readTimestamp(storageKey(WELCOME_POPUP_LAST_SHOWN_PREFIX, contextKey));
}

export function readWelcomeAudioLastAttemptAt(contextKey: string): number | null {
  return readTimestamp(storageKey(WELCOME_AUDIO_LAST_ATTEMPT_PREFIX, contextKey));
}

export function shouldAutoShowWelcome(contextKey: string, now = Date.now()) {
  const lastShownAt = readWelcomePopupLastShownAt(contextKey);
  if (lastShownAt === null) {
    return true;
  }

  return now - lastShownAt >= WELCOME_FLOW_INTERVAL_MS;
}

export function shouldAttemptWelcomeAudio(contextKey: string, now = Date.now()) {
  const lastAttemptAt = readWelcomeAudioLastAttemptAt(contextKey);
  if (lastAttemptAt === null) {
    return true;
  }

  return now - lastAttemptAt >= WELCOME_FLOW_INTERVAL_MS;
}

export function markWelcomePopupShown(contextKey: string, timestamp = Date.now()) {
  markWelcomePopupHandledInThisSession(contextKey);
  writeTimestamp(storageKey(WELCOME_POPUP_LAST_SHOWN_PREFIX, contextKey), timestamp);
}

export function markWelcomeAudioAttempted(contextKey: string, timestamp = Date.now()) {
  markWelcomeAudioHandledInThisSession(contextKey);
  writeTimestamp(storageKey(WELCOME_AUDIO_LAST_ATTEMPT_PREFIX, contextKey), timestamp);
}

/**
 * Keep the legacy export name above for backward compatibility, but prefer the
 * clearer alias below in new code because cadence should only advance after
 * real playback starts, not when autoplay is merely attempted.
 */
export const markWelcomeAudioStarted = markWelcomeAudioAttempted;
