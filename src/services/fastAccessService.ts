import {
  ApiResponse,
  FacultyScienceFastAccessAccountState,
  FacultyScienceConversionRequest,
  FacultyScienceConversionResponse,
  FacultyScienceFastAccessProfile,
  FacultyScienceFastAccessRequest,
  FacultyScienceFastAccessResponse,
  FacultyScienceFastAccessStatusRequest,
  FacultyScienceFastAccessStatusResponse,
} from '../types/api';
import { cleanString, normalizeEmail, safeParseJson } from '../utils/validators';

const FACULTY_FAST_ACCESS_SCOPE = 'faculty_science_fast_access' as const;
const FAST_ACCESS_BATCH_YEAR_MIN = 2013;
const FAST_ACCESS_BATCH_YEAR_MAX = 2031;
const FAST_ACCESS_ALLOWED_BATCH_PREFIXES = new Set(
  Array.from(
    { length: FAST_ACCESS_BATCH_YEAR_MAX - FAST_ACCESS_BATCH_YEAR_MIN + 1 },
    (_, index) => String(FAST_ACCESS_BATCH_YEAR_MIN + index).slice(-2)
  )
);
const FULL_ACCOUNT_ACADEMIC_LEVELS = new Set([
  'Level 1',
  'Level 2',
  'Level 3',
  'Level 4',
  'Master',
  'PhD',
]);

function normalizePhoneNumber(countryCode: string, localPhone: string): string {
  const normalizedCode = cleanString(countryCode).replace(/\s+/g, '');
  const normalizedLocal = cleanString(localPhone).replace(/\D/g, '');
  const fullPhone = `${normalizedCode}${normalizedLocal}`;

  if (!/^\+\d{8,15}$/.test(fullPhone)) {
    throw new Error('Enter a valid phone number in international format.');
  }

  return fullPhone;
}

function deriveFastAccessBatchYear(universityCode: string): string {
  const normalizedCode = cleanString(universityCode).replace(/\D/g, '');
  if (!/^\d{7}$/.test(normalizedCode)) {
    throw new Error('Student code must be exactly 7 digits.');
  }

  const prefix = normalizedCode.slice(0, 2);
  if (!FAST_ACCESS_ALLOWED_BATCH_PREFIXES.has(prefix)) {
    throw new Error(
      `Student code must begin with a valid batch prefix between ${String(FAST_ACCESS_BATCH_YEAR_MIN).slice(-2)} and ${String(FAST_ACCESS_BATCH_YEAR_MAX).slice(-2)}.`
    );
  }

  const academicYear = Number.parseInt(`20${prefix}`, 10);
  if (
    !Number.isInteger(academicYear) ||
    academicYear < FAST_ACCESS_BATCH_YEAR_MIN ||
    academicYear > FAST_ACCESS_BATCH_YEAR_MAX
  ) {
    throw new Error(
      `Batch year must be between ${FAST_ACCESS_BATCH_YEAR_MIN} and ${FAST_ACCESS_BATCH_YEAR_MAX}.`
    );
  }

  return String(academicYear);
}

function normalizeProfile(profile?: FacultyScienceFastAccessProfile): FacultyScienceFastAccessProfile {
  const fullName = cleanString(profile?.fullName);
  const universityCode = cleanString(profile?.universityCode).replace(/\D/g, '');
  const department = cleanString(profile?.department);
  const academicYear = deriveFastAccessBatchYear(universityCode);

  if (!fullName) throw new Error('Full name is required.');
  if (fullName.length > 120) throw new Error('Full name is too long.');
  if (department.length > 120) throw new Error('Department is too long.');

  return {
    fullName,
    universityCode,
    department: department || undefined,
    academicYear,
  };
}

export function buildFastAccessPhone(countryCode: string, localPhone: string): string {
  return normalizePhoneNumber(countryCode, localPhone);
}

async function parseFastAccessResponse<T>(
  response: Response,
  fallbackMessage: string
): Promise<T> {
  const data = await safeParseJson<ApiResponse<T>>(response);
  if (!response.ok || !data?.success || !data.data) {
    throw new Error(cleanString(data?.error) || fallbackMessage);
  }

  return data.data;
}

export function isFastAccessAccountState(
  value: string
): value is FacultyScienceFastAccessAccountState {
  return (
    value === 'eligible_for_registration' ||
    value === 'fast_access_exists' ||
    value === 'full_account_exists'
  );
}

export async function checkFacultyScienceFastAccessStatus(
  payload: FacultyScienceFastAccessStatusRequest
): Promise<FacultyScienceFastAccessStatusResponse> {
  const idToken = cleanString(payload.idToken);
  const intent = payload.intent;

  if (!idToken) {
    throw new Error('Missing verification token. Please request a new OTP.');
  }

  if (intent !== 'login' && intent !== 'register') {
    throw new Error('Invalid fast-access intent.');
  }

  const response = await fetch('/api/auth/fast-access/faculty-science/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idToken,
      intent,
    }),
  });

  const data = await parseFastAccessResponse<FacultyScienceFastAccessStatusResponse>(
    response,
    'Unable to verify phone status.'
  );

  if (!cleanString(data.phoneNumber)) {
    throw new Error('Server returned an invalid phone number state.');
  }

  if (data.intent !== intent) {
    throw new Error('Server returned a mismatched fast-access intent.');
  }

  if (!isFastAccessAccountState(data.accountState)) {
    throw new Error('Server returned an invalid fast-access state.');
  }

  return data;
}

export async function loginFacultyScienceFastAccess(
  idToken: string
): Promise<FacultyScienceFastAccessResponse> {
  const normalizedToken = cleanString(idToken);
  if (!normalizedToken) {
    throw new Error('Missing verification token. Please request a new OTP.');
  }

  const response = await fetch('/api/auth/fast-access/faculty-science/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: normalizedToken }),
  });

  const data = await parseFastAccessResponse<FacultyScienceFastAccessResponse>(
    response,
    'Fast-access login failed.'
  );

  if (data.account.accountScope !== FACULTY_FAST_ACCESS_SCOPE) {
    throw new Error('Invalid account scope returned by server.');
  }

  if (!cleanString(data.customToken)) {
    throw new Error('Server returned an invalid session token.');
  }

  return data;
}

/**
 * This endpoint intentionally stays separate from main registration/login APIs.
 * The backend is the authority for OTP token verification and temporary account writes.
 */
export async function registerFacultyScienceFastAccess(
  payload: FacultyScienceFastAccessRequest
): Promise<FacultyScienceFastAccessResponse> {
  const idToken = cleanString(payload.idToken);
  if (!idToken) {
    throw new Error('Missing verification token. Please request a new OTP.');
  }

  const requestBody: FacultyScienceFastAccessRequest = {
    idToken,
    profile: normalizeProfile(payload.profile),
  };

  const response = await fetch('/api/auth/fast-access/faculty-science/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  const data = await parseFastAccessResponse<FacultyScienceFastAccessResponse>(
    response,
    'Fast-access registration failed.'
  );

  if (data.account.accountScope !== FACULTY_FAST_ACCESS_SCOPE) {
    throw new Error('Invalid account scope returned by server.');
  }

  if (!cleanString(data.customToken)) {
    throw new Error('Server returned an invalid session token.');
  }

  return data;
}

/**
 * Backward-compatible alias for older imports while the UI moves to explicit
 * `login` and `register` intent helpers.
 */
export const completeFacultyScienceFastAccess = registerFacultyScienceFastAccess;

export async function convertFacultyFastAccessToFullAccount(
  token: string,
  payload: FacultyScienceConversionRequest
): Promise<FacultyScienceConversionResponse> {
  const authToken = cleanString(token);
  if (!authToken) {
    throw new Error('Missing session token. Please sign in again.');
  }

  const email = normalizeEmail(payload.email);
  const username = cleanString(payload.username);
  const password = cleanString(payload.password);
  const fullName = cleanString(payload.fullName);
  const country = cleanString(payload.country);
  const nationality = cleanString(payload.nationality);
  const dateOfBirth = cleanString(payload.dateOfBirth);
  const gender = payload.gender;
  const department = cleanString(payload.department);
  const academicYear = cleanString(payload.academicYear);
  const migrationPolicyAccepted = payload.migrationPolicyAccepted === true;

  if (
    !fullName ||
    !email ||
    !username ||
    !password ||
    !country ||
    !nationality ||
    !dateOfBirth ||
    !gender ||
    !department ||
    !academicYear
  ) {
    throw new Error('Please complete all required account-completion fields.');
  }

  if (!migrationPolicyAccepted) {
    throw new Error('You must accept the migration policy to continue.');
  }

  if (!/^[\x00-\x7F]+$/.test(fullName)) {
    throw new Error('Full name must use English characters only.');
  }

  if (!/^[\x00-\x7F]+$/.test(department)) {
    throw new Error('Department must use English characters only.');
  }

  if (!FULL_ACCOUNT_ACADEMIC_LEVELS.has(academicYear)) {
    throw new Error('Select a valid academic level.');
  }

  const response = await fetch('/api/auth/fast-access/faculty-science/convert', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      email,
      username,
      password,
      fullName,
      country,
      nationality,
      dateOfBirth,
      gender,
      department,
      academicYear,
      migrationPolicyAccepted,
    }),
  });

  const data = await parseFastAccessResponse<FacultyScienceConversionResponse>(
    response,
    'Conversion failed.'
  );

  if (data.accountScope !== 'full_account') {
    throw new Error('Invalid conversion response from server.');
  }

  return data;
}
