import { adminAuthSessionManager } from './adminAuthSessionManager';
import { fastAccessAuthSessionManager } from './fastAccessAuthSessionManager';
import { normalAuthSessionManager } from './normalAuthSessionManager';
import { clearAllStoredAuthSessions, clearLegacyAuthSessionKeys } from './storage';
import type { AuthSessionManager } from './baseAuthSessionManager';
import type { AuthSessionType } from './types';

const authSessionManagers: Record<AuthSessionType, AuthSessionManager> = {
  normal: normalAuthSessionManager,
  fast_access: fastAccessAuthSessionManager,
  admin: adminAuthSessionManager,
};

export function getAuthSessionManager(authType: AuthSessionType): AuthSessionManager {
  return authSessionManagers[authType];
}

export function clearSiblingAuthSessionManagers(activeAuthType: AuthSessionType): void {
  (Object.keys(authSessionManagers) as AuthSessionType[])
    .filter((authType) => authType !== activeAuthType)
    .forEach((authType) => authSessionManagers[authType].clear());
}

export {
  adminAuthSessionManager,
  authSessionManagers,
  clearAllStoredAuthSessions,
  clearLegacyAuthSessionKeys,
  fastAccessAuthSessionManager,
  normalAuthSessionManager,
};
