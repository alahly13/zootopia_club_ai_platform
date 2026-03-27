/*
 * Copyright (c) Elmahdy Abdallah Youssef. All rights reserved.
 * Developed by Elmahdy Abdallah Youssef, Software Developer.
 * Class of 2022, Faculty of Science, Cairo University, Zoology Department.
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function cleanObject<T extends Record<string, unknown>>(obj: T): T {
  const newObj = {} as T;
  (Object.keys(obj) as Array<keyof T>).forEach((key) => {
    if (obj[key] !== undefined) {
      newObj[key] = obj[key];
    }
  });
  return newObj;
}

export const COPYRIGHT = "Copyright (c) Elmahdy Abdallah Youssef. All rights reserved.\nDeveloped by Elmahdy Abdallah Youssef, Software Developer.\nClass of 2022, Faculty of Science, Cairo University, Zoology Department.";

export type Language = 'English' | 'Arabic' | 'French' | 'German' | 'Spanish';

export interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  preferredModelId: string;
  language: Language;
  quizDefaults: {
    questionCount: number;
    difficulty: Difficulty;
    type: QuestionType;
  };
  notifications: {
    email: boolean;
    browser: boolean;
    system: boolean;
  };
  exportFormat: 'PDF' | 'DOCX' | 'JSON';
}

export interface AdminSettings {
  panelTheme: 'classic' | 'modern' | 'glass';
  notificationsEnabled: boolean;
  logRetentionDays: number;
  autoApproveRequests: boolean;
  displayAdminName: string;
  securityLevel: 'Standard' | 'High' | 'Strict';
}

export type QuestionType = 'MCQ' | 'True/False' | 'Scientific Term' | 'Comparison' | 'Case Study' | 'Pathway' | 'Short Answer';

export type Difficulty = 'Easy' | 'Intermediate' | 'Advanced' | 'Exam Mode';

export type UserRole = 'Admin' | 'User';

export type UserStatus = 'Active' | 'Suspended' | 'Blocked' | 'PendingEmailVerification' | 'PendingAdminApproval' | 'Rejected';

export interface UserPermissions {
  uploadFiles: boolean;
  generateQuestions: boolean;
  generateImages: boolean;
  generateVideos: boolean;
  generateInfographics: boolean;
  useChatbot: boolean;
  useLiveVoice: boolean;
  useStudyTools: boolean;
  exportFiles: boolean;
  viewAdvancedVisuals: boolean;
  accessPremiumTools: boolean;
}

export interface UserLimits {
  aiRequestsPerDay: number;
  quizGenerationsPerDay: number;
  uploadsPerDay: number;
}

export interface UserUsage {
  aiRequestsToday: number;
  quizGenerationsToday: number;
  uploadsToday: number;
  lastResetDate: string;
}

export type UserPlan = 'free' | 'basic' | 'pro' | 'enterprise';

export interface AuthProviderLink {
  providerId: string;
  uid?: string;
  email?: string;
  phoneNumber?: string;
  displayName?: string;
}

export interface AccountLinkageDiagnostics {
  authSource: 'firebase-auth' | 'firestore-only';
  authRecordExists: boolean;
  firestoreRecordExists: boolean;
  firestoreProfileCompleteness: 'missing' | 'partial' | 'complete';
  linkageStatus: 'linked' | 'auth_only' | 'firestore_only' | 'inconsistent';
  adminManagementMode: 'full' | 'view_only' | 'specialized_fast_access';
  issues: string[];
  providerIds: string[];
  providerDetails: AuthProviderLink[];
  emailVerified: boolean;
  authDisabled: boolean;
  authCreationTime?: string;
  authLastSignInTime?: string;
  customClaims?: Record<string, unknown>;
  claimRole?: string;
  claimAdminLevel?: string;
  firestoreRole?: string;
  firestoreStatus?: string;
  firestoreDocumentPath?: string;
  hasTemporaryAccessProfile: boolean;
  temporaryAccessProfilePath?: string;
  archivedFastAccessAuditCount?: number;
  isFirestoreOrphan: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  username?: string;
  usernameLower?: string;
  universityCode?: string;
  department?: string;
  academicYear?: string;
  phoneNumber?: string;
  dateOfBirth?: string;
  gender?: string;
  institution?: string;
  country?: string;
  nationality?: string;
  studyInterests?: string[];
  picture?: string;
  role: UserRole;
  adminLevel?: string;
  plan?: UserPlan;
  status: UserStatus;
  firstLoginDate: string;
  lastLogin: string;
  createdAt?: string;
  updatedAt?: string;
  authProviders?: string[];
  permissions: UserPermissions;
  limits: UserLimits;
  usage: UserUsage;
  settings?: UserSettings;
  adminSettings?: AdminSettings;
  adminNotes?: string;
  credits: number;
  totalUploads: number;
  totalAIRequests: number;
  totalQuizzes: number;
  isVerified?: boolean;
  bio?: string;
  avatarUrl?: string;
  unlockedPages?: string[];
  unlockedModels?: string[];
  unlockedProjects?: string[];
  isTemporaryAccess?: boolean;
  temporaryAccessType?: 'FacultyOfScienceFastAccess';
  temporaryAccessExpiresAt?: string;
  accountScope?: 'full_account' | 'faculty_science_fast_access';
  fastAccessCredits?: number;
  fastAccessCreditsUpdatedAt?: string;
  fastAccessMetadata?: {
    institution: 'Cairo University';
    faculty: 'Faculty of Science';
    onboardingMethod: 'firebase_phone_otp';
  };
  statusMessage?: string;
  statusContext?: {
    current?: 'active' | 'disabled' | 'deleted' | string;
    suspensionReason?: string;
    reactivationMessage?: string;
    pendingReactivationNotice?: boolean;
    suspendedAt?: string;
    suspendedBy?: string;
    reactivatedAt?: string;
    reactivatedBy?: string;
    lastStatusChangedAt?: string;
    lastStatusChangedBy?: string;
  };
  accountLinkage?: AccountLinkageDiagnostics;
}

export type RequestStatus = 'Pending' | 'Approved' | 'Rejected' | 'Modified';
export type RequestType = 'Increase Limit' | 'Premium Access' | 'Feature Activation' | 'Account Review' | 'Credit Request' | 'Page Access' | 'Model Access' | 'Chat Unlock' | 'Secrets Access' | 'Project Join' | 'Other';

export interface UnlockCode {
  id: string;
  code: string;
  type: 'Page Access' | 'Model Access' | 'Gift Code' | 'Chat Unlock' | 'Secrets Access' | 'Project Join';
  targetId?: string;
  amount?: number;
  isActive: boolean;
  redeemedBy: string[];
  maxUses?: number;
  expiresAt?: string;
  createdAt: string;
  createdBy: string;
}

export type ErrorCategory = 
  | 'validation' 
  | 'auth/session' 
  | 'admin_permission' 
  | 'request_update' 
  | 'network' 
  | 'provider/api' 
  | 'system/internal';

export interface UserRequest {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  type: RequestType;
  message: string;
  status: RequestStatus;
  createdAt: string;
  updatedAt: string;
  adminResponse?: string;
  requestedAmount?: number;
  approvedAmount?: number;
  modifiedAt?: string;
  targetPage?: string;
  targetModel?: string;
  targetProject?: string;
  unlockCode?: string;
}

export interface QuizQuestion {
  id: string;
  type: QuestionType;
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
  emoji?: string;
}

export interface Quiz {
  id: string;
  title: string;
  questions: QuizQuestion[];
  language: Language;
  createdAt: string;
  userId: string;
}

export interface UploadStage {
  id: 'uploading' | 'processing' | 'validating' | 'analyzing' | 'generating' | 'preparing';
  label: string;
  progress: number;
  status: 'pending' | 'loading' | 'success' | 'error';
}

export interface Activity {
  id: string;
  userId: string;
  type: 'upload' | 'quiz_gen' | 'image_gen' | 'chat' | 'video_gen' | 'login' | 'logout' | 'infographic_gen' | 'settings_update' | 'profile_update' | 'admin_action' | 'subscription_updated' | 'donation_made';
  description: string;
  timestamp: string;
  status?: 'success' | 'failure' | 'warning';
  metadata?: Record<string, any>;
}

export interface InfographicData {
  title: string;
  summary: string;
  keyPoints: {
    icon: string;
    title: string;
    description: string;
  }[];
  stats: {
    label: string;
    value: number;
    unit: string;
  }[];
  chartData: {
    name: string;
    value: number;
  }[];
  didYouKnow: string;
  themeColor: string;
}
