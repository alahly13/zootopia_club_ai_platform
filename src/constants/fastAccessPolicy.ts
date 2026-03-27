import { User } from '../utils';

/**
 * TEMPORARY FAST-ACCESS GUARD
 * ------------------------------------------------------------------
 * This policy defines the strict allowed surface for temporary Faculty fast-access
 * users. Keep this explicit and minimal.
 *
 * Do NOT silently broaden this list. Any expansion must be intentional,
 * reviewed, and mirrored on backend authorization checks.
 */
export const FACULTY_FAST_ACCESS_ALLOWED_TOOL_IDS = [
  'quiz',
  'analyze',
  'infographic',
] as const;

export const FACULTY_FAST_ACCESS_ALLOWED_ROUTE_IDS = [
  'generate',
  'analysis',
  'infographic',
  'account',
] as const;

export const FACULTY_FAST_ACCESS_ALLOWED_PATHS = [
  '/',
  // `/generate` is an explicit alias for the same Assessment entry surface as
  // `/`. Keep both paths aligned so routing fixes do not accidentally broaden
  // or break temporary fast-access access.
  '/generate',
  // `/analysis` is the dedicated full-page view of the same shared document
  // workflow. Keep it aligned with `/generate` rather than treating it as a
  // separate broader entitlement surface.
  '/analysis',
  '/infographic',
  '/account',
  '/verify-email',
  '/waiting-approval',
  '/account-rejected',
  '/account-suspended',
  '/account-blocked',
] as const;

export const FACULTY_FAST_ACCESS_CONVERSION_PROMPT =
  'Your free Fast Access credits are used. Complete this same account to continue, unlock the full platform, and keep your existing history, ownership, and generated work in one place.';

export function isFacultyFastAccessUser(user: User | null | undefined): boolean {
  return !!user && (
    user.isTemporaryAccess === true ||
    user.accountScope === 'faculty_science_fast_access' ||
    user.temporaryAccessType === 'FacultyOfScienceFastAccess'
  );
}

export function isFastAccessProfileCompletionPending(user: User | null | undefined): boolean {
  if (!isFacultyFastAccessUser(user)) {
    return false;
  }

  const profileCompletionStage = String(user?.fastAccessMetadata?.profileCompletionStage || '').trim().toLowerCase();
  if (profileCompletionStage === 'pending_profile_completion') {
    return true;
  }

  if (profileCompletionStage === 'temporary_onboarding_complete') {
    return false;
  }

  // Legacy-safe fallback for older documents that predate explicit stage fields.
  const normalizedName = String(user?.name || '').trim();
  const normalizedUniversityCode = String(user?.universityCode || '').trim();
  return !normalizedUniversityCode || !normalizedName || normalizedName === 'CU Science Student';
}

export function isFastAccessPathAllowed(pathname: string): boolean {
  return FACULTY_FAST_ACCESS_ALLOWED_PATHS.some((allowedPath) => {
    if (allowedPath === '/') {
      return pathname === '/';
    }
    return pathname === allowedPath || pathname.startsWith(`${allowedPath}/`);
  });
}

export function isFastAccessMenuItemAllowed(routeId: string): boolean {
  return FACULTY_FAST_ACCESS_ALLOWED_ROUTE_IDS.includes(routeId as (typeof FACULTY_FAST_ACCESS_ALLOWED_ROUTE_IDS)[number]);
}
