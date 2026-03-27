export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export type FacultyScienceFastAccessIntent = 'login' | 'register';

export type FacultyScienceFastAccessAccountState =
  | 'eligible_for_registration'
  | 'fast_access_exists'
  | 'full_account_exists';

export interface FacultyScienceFastAccessProfile {
  fullName?: string;
  universityCode?: string;
  department?: string;
  academicYear?: string;
}

export interface FacultyScienceFastAccessStatusRequest {
  idToken: string;
  intent: FacultyScienceFastAccessIntent;
}

export interface FacultyScienceFastAccessStatusResponse {
  phoneNumber: string;
  intent: FacultyScienceFastAccessIntent;
  accountState: FacultyScienceFastAccessAccountState;
  recommendedNextStep: 'login' | 'register' | 'full_login';
  existingAccount?: {
    uid: string;
    fastAccessCredits: number;
    fullName?: string;
    universityCode?: string;
  };
}

export interface FacultyScienceFastAccessRequest {
  idToken: string;
  profile?: FacultyScienceFastAccessProfile;
}

export interface FacultyScienceFastAccessResponse {
  customToken: string;
  account: {
    uid: string;
    phoneNumber: string;
    accountScope: 'faculty_science_fast_access';
    isTemporaryAccess: true;
    temporaryAccessType: 'FacultyOfScienceFastAccess';
    temporaryAccessExpiresAt: string;
    fastAccessCredits: number;
  };
}

export interface FacultyScienceConversionRequest {
  fullName: string;
  email: string;
  username: string;
  password: string;
  country: string;
  nationality: string;
  dateOfBirth: string;
  gender: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  department: string;
  academicYear: string;
  migrationPolicyAccepted: boolean;
}

export interface FacultyScienceConversionResponse {
  converted: boolean;
  nextStatus: 'PendingEmailVerification';
  accountScope: 'full_account';
  requiresEmailVerification: boolean;
}
