import type { User } from '../../utils';
import { isUserAdmin } from '../accessControl';
import type { AuthSessionType } from './types';

export function resolveAuthSessionTypeFromUser(user: User | null | undefined): AuthSessionType | null {
  if (!user) {
    return null;
  }

  if (
    user.isTemporaryAccess === true ||
    user.accountScope === 'faculty_science_fast_access' ||
    user.temporaryAccessType === 'FacultyOfScienceFastAccess'
  ) {
    return 'fast_access';
  }

  if (isUserAdmin(user)) {
    return 'admin';
  }

  return 'normal';
}

export function buildAuthSessionScopeKey(input: {
  authType: AuthSessionType | null | undefined;
  uid?: string | null;
  email?: string | null;
}): string | null {
  if (!input.authType) {
    return null;
  }

  const actorIdentity =
    (typeof input.uid === 'string' && input.uid.trim()) ||
    (typeof input.email === 'string' && input.email.trim().toLowerCase()) ||
    null;

  if (!actorIdentity) {
    return `${input.authType}:anonymous`;
  }

  return `${input.authType}:${actorIdentity}`;
}

export function resolveAuthSessionScopeKeyFromUser(user: User | null | undefined): string | null {
  const authType = resolveAuthSessionTypeFromUser(user);

  return buildAuthSessionScopeKey({
    authType,
    uid: user?.id || null,
    email: user?.email || null,
  });
}
