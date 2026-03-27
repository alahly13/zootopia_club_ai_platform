import { ADMIN_IDENTITIES } from '../constants/admins';
import type { User } from '../utils';

type AccessControlUser = Partial<Pick<
  User,
  'role' | 'adminLevel' | 'email' | 'isTemporaryAccess' | 'accountScope'
>>;

export function normalizeUserRole(role: unknown): User['role'] {
  return String(role || '').trim().toLowerCase() === 'admin' ? 'Admin' : 'User';
}

export function normalizeAdminLevel(adminLevel: unknown): string | null {
  const normalized = String(adminLevel || '').trim().toLowerCase();
  return normalized || null;
}

export function isTemporaryScopedAccount(
  user: Pick<User, 'isTemporaryAccess' | 'accountScope'> | null | undefined
): boolean {
  return (
    Boolean(user?.isTemporaryAccess) ||
    String(user?.accountScope || '').trim().toLowerCase() === 'faculty_science_fast_access'
  );
}

export function isReservedAdminIdentity(email: unknown): boolean {
  const normalizedEmail = String(email || '').trim().toLowerCase();

  return (
    !!normalizedEmail &&
    ADMIN_IDENTITIES.some((identity) => identity.email.toLowerCase() === normalizedEmail)
  );
}

export function isUserAdmin(user: AccessControlUser | null | undefined): boolean {
  return (
    !isTemporaryScopedAccount(user) &&
    (normalizeUserRole(user?.role) === 'Admin' || isReservedAdminIdentity(user?.email))
  );
}

export function isPrimaryAdminUser(user: AccessControlUser | null | undefined): boolean {
  return isUserAdmin(user) && normalizeAdminLevel(user?.adminLevel) === 'primary';
}
