import type { AuthSessionState, AuthSessionType } from './types';
import {
  clearStoredAuthSession,
  readStoredAuthSession,
  writeStoredAuthSession,
} from './storage';

export interface AuthSessionManager {
  readonly authType: AuthSessionType;
  load(): AuthSessionState | null;
  persist(session: AuthSessionState): void;
  clear(): void;
}

export class BrowserAuthSessionManager implements AuthSessionManager {
  constructor(public readonly authType: AuthSessionType) {}

  load(): AuthSessionState | null {
    return readStoredAuthSession(this.authType);
  }

  persist(session: AuthSessionState): void {
    writeStoredAuthSession(this.authType, session);
  }

  clear(): void {
    clearStoredAuthSession(this.authType);
  }
}
