/*
 * Copyright (c) Elmahdy Abdallah Youssef. All rights reserved.
 * Developed by Elmahdy Abdallah Youssef, Software Developer.
 * Class of 2022, Faculty of Science, Cairo University, Zoology Department.
 */

import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import crypto from "crypto";
import Handlebars from "handlebars";
import firebaseAppletConfig from "./firebase-applet-config.json";
import { getModelByAnyId, toCanonicalModelId } from "./src/ai/models/modelRegistry.js";
import {
  MODEL_UNLOCK_PRICE_EGP,
  getDefaultAccessibleModelIdsForTool,
  normalizeToolId as normalizeModelToolId,
  resolveModelAccess,
} from "./src/ai/modelAccess.js";
import { ADMIN_IDENTITIES } from "./src/constants/admins.js";
import { FACULTY_FAST_ACCESS_ALLOWED_TOOL_IDS } from "./src/constants/fastAccessPolicy.js";
import { getProviderUsageHistory, getAggregatedUsage } from './server/monitoringService';
import { BillingService } from './server/billingService';
import { UserService } from './server/userService';
import { CommunicationService } from './server/communicationService';
import { CodeService } from './server/codeService';
import { createTraceId, logDiagnostic, normalizeError } from './server/diagnostics';
import {
  PlatformAuthType,
  authSessionService,
  resolvePlatformAuthType,
} from './server/authSessionService.js';
import { resolveProviderRuntimeByModel, resolveQwenRuntime } from './server/providerRuntime.js';
import { listAdminAccountDirectory } from './server/adminAccountDirectoryService';
import { applySecurityHeaders } from './server/securityHeaders';
import { createRouteRateLimiter } from './server/rateLimit';
import { buildProviderSecuritySummary } from './server/providerSecuritySummary';
import { createActorContext } from './server/documentRuntime/actorScope.js';
import {
  DocumentArtifactStore,
  RUNTIME_DOCUMENT_ARTIFACT_COLLECTION,
  RUNTIME_DOCUMENT_AUDIT_COLLECTION,
  RUNTIME_DOCUMENT_COLLECTION,
} from './server/documentRuntime/documentArtifactStore.js';
import { DocumentIntakeService } from './server/documentRuntime/documentIntakeService.js';
import { CleanupCoordinator } from './server/documentRuntime/cleanupCoordinator.js';
import { PromptContextResolver } from './server/documentRuntime/promptContextResolver.js';
import { DirectModelFileDispatchService } from './server/documentRuntime/directModelFileDispatchService.js';
import {
  CANONICAL_UNLOCK_ELIGIBLE_TOOL_IDS,
  CANONICAL_UNLOCK_PRICE_EGP,
  collectContractWarnings,
  validateGiftCodeIssueInput,
  validateUnlockCodePolicy,
} from './server/entitlementContracts';
import {
  TOOL_ENTITLEMENT_COLLECTION,
  TOOL_ENTITLEMENT_EVENT_COLLECTION,
  grantToolEntitlement,
  isToolUnlockEligible,
  revokeToolEntitlement,
} from './server/toolEntitlementService';
import {
  MODEL_ENTITLEMENT_COLLECTION,
  MODEL_ENTITLEMENT_EVENT_COLLECTION,
  grantModelEntitlement,
  revokeModelEntitlement,
} from './server/modelEntitlementService';
import {
  AI_SERVER_HEADERS_TIMEOUT_MS,
  AI_SERVER_REQUEST_TIMEOUT_MS,
} from './src/ai/config/timeoutBudgets.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  console.log("Starting server...");
  const app = express();
  // Managed hosts like Render inject PORT dynamically. Keep the local fallback
  // for existing workflows, but never hardcode production hosting to 3000.
  const parsedPort = Number.parseInt(process.env.PORT || "3000", 10);
  const PORT = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3000;
  const isProduction = process.env.NODE_ENV === "production";

  app.disable('x-powered-by');
  app.use((req, res, next) => {
    applySecurityHeaders(req, res, { isProduction });
    next();
  });
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Email Transporter Setup
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || "smtp.gmail.com",
    port: parseInt(process.env.EMAIL_PORT || "587"),
    secure: process.env.EMAIL_PORT === "465",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  // Initialize Firebase Admin
  const serviceAccountPath = path.join(__dirname, "serviceAccountKey.json");
  if (fs.existsSync(serviceAccountPath)) {
    try {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log("Firebase Admin initialized successfully with service account");
    } catch (error) {
      console.error("Error initializing Firebase Admin with service account:", error);
    }
  } else {
    console.warn("serviceAccountKey.json not found. Attempting to initialize with default credentials.");
    try {
      admin.initializeApp();
      console.log("Firebase Admin initialized successfully with default credentials");
    } catch (error) {
      console.error("Error initializing Firebase Admin with default credentials:", error);
    }
  }

  const db = getFirestore(admin.app(), "zootopiaclub");
  const billingService = new BillingService(db);
  const userService = new UserService(db);
  const documentArtifactStore = new DocumentArtifactStore(db);
  const documentIntakeService = new DocumentIntakeService(documentArtifactStore);
  const cleanupCoordinator = new CleanupCoordinator(documentArtifactStore);
  const promptContextResolver = new PromptContextResolver(documentArtifactStore);
  const directModelFileDispatchService = new DirectModelFileDispatchService(documentArtifactStore);
// Centralized Firestore Collection Names
const COLLECTIONS = {
  USERS: 'users',
  EMAIL_TEMPLATES: 'email_templates',
  EMAIL_DELIVERY_LOGS: 'email_delivery_logs',
  INTERNAL_COMMUNICATIONS: 'internal_communications',
  INTERNAL_COMMUNICATION_LOGS: 'internal_communication_logs',
  INTERNAL_MESSAGE_TEMPLATES: 'internal_message_templates',
  GIFT_CODES: 'giftCodes',
  SECRET_CODES: 'secretCodes',
  UNLOCK_CODES: 'unlockCodes',
  INBOX: 'inbox',
  ADMIN_INBOX: 'admin_inbox',
  NOTIFICATIONS: 'notifications',
  RESULTS: 'storedResults',
  PROVIDER_USAGE: 'providerUsage',
  MONITORING: 'monitoring',
  REFUNDS: 'refunds',
  SUBSCRIPTIONS: 'subscriptions',
  BILLING_SESSIONS: 'billing_sessions',
  SECRET_ACCESS_LOGS: 'secretAccessLogs',
  ISSUED_CODES: 'issuedCodes',
  FACULTY_FAST_ACCESS_ACCOUNTS: 'faculty_fast_access_accounts',
  FACULTY_FAST_ACCESS_MIGRATIONS: 'faculty_fast_access_migrations',
  FACULTY_FAST_ACCESS_CREDIT_EVENTS: 'faculty_fast_access_credit_events',
  FACULTY_FAST_ACCESS_DELETION_AUDITS: 'faculty_fast_access_deletion_audits',
  USER_CREDIT_EVENTS: 'user_credit_events',
  GIFT_CODE_REDEMPTIONS: 'gift_code_redemptions',
  TOOL_ENTITLEMENTS: TOOL_ENTITLEMENT_COLLECTION,
  TOOL_ENTITLEMENT_EVENTS: TOOL_ENTITLEMENT_EVENT_COLLECTION,
  MODEL_ENTITLEMENTS: MODEL_ENTITLEMENT_COLLECTION,
  MODEL_ENTITLEMENT_EVENTS: MODEL_ENTITLEMENT_EVENT_COLLECTION,
  RUNTIME_DOCUMENTS: RUNTIME_DOCUMENT_COLLECTION,
  RUNTIME_DOCUMENT_ARTIFACTS: RUNTIME_DOCUMENT_ARTIFACT_COLLECTION,
  RUNTIME_DOCUMENT_AUDITS: RUNTIME_DOCUMENT_AUDIT_COLLECTION,
};
const GENERATED_ASSET_COLLECTION = 'generatedOutputs';

const adminAccountsRateLimiter = createRouteRateLimiter({
  name: 'admin-accounts',
  windowMs: 5 * 60 * 1000,
  maxRequests: 60,
});

const adminSecuritySummaryRateLimiter = createRouteRateLimiter({
  name: 'admin-security-summary',
  windowMs: 5 * 60 * 1000,
  maxRequests: 30,
});

const assetAccessRateLimiter = createRouteRateLimiter({
  name: 'generated-asset-access',
  windowMs: 5 * 60 * 1000,
  maxRequests: 180,
});

const normalizeRequiredString = (value: unknown, fieldName: string): string => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }
  return normalized;
};

const normalizeOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized || undefined;
};

const FIREBASE_STORAGE_BUCKET =
  normalizeOptionalString(process.env.FIREBASE_STORAGE_BUCKET) ||
  normalizeOptionalString(firebaseAppletConfig.storageBucket) ||
  undefined;

const sanitizeAttachmentFileName = (value: unknown, fallbackBaseName = 'generated-asset'): string => {
  const normalized = String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/g, '');

  return normalized || fallbackBaseName;
};

const normalizeOptionalBoundedString = (value: unknown, maxLength: number): string | undefined => {
  const normalized = normalizeOptionalString(value);
  if (!normalized) return undefined;
  return normalized.slice(0, maxLength);
};

const parseOptionalPositiveInt = (value: unknown, fieldName: string): number | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
  return parsed;
};

const normalizeOptionalIsoDate = (value: unknown, fieldName: string): string | undefined => {
  const normalized = normalizeOptionalString(value);
  if (!normalized) return undefined;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid date`);
  }
  return normalized;
};

const decodeUriComponentSafe = (value: unknown): string => {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return '';
  }

  try {
    return decodeURIComponent(normalized);
  } catch {
    return normalized;
  }
};

const normalizeDocumentProcessingPathway = (
  value: unknown
): 'local_extraction' | 'direct_file_to_model' => {
  return value === 'direct_file_to_model'
    ? 'direct_file_to_model'
    : 'local_extraction';
};

const resolveDocumentActorContextFromRequest = (req: express.Request) => {
  const userContext = (req as any).userContext as {
    uid: string;
    email?: string | null;
    role?: string | null;
    adminLevel?: string | null;
    isAdmin?: boolean;
    authType?: PlatformAuthType;
  };

  if (!userContext?.uid) {
    throw new Error('AUTH_CONTEXT_REQUIRED');
  }

  return createActorContext({
    uid: userContext.uid,
    email: userContext.email,
    role: userContext.role,
    adminLevel: userContext.adminLevel,
    isAdmin: userContext.isAdmin,
    authType: userContext.authType,
  });
};

const ALLOWED_REFUND_REASON_CODES = new Set([
  'duplicate_charge',
  'fraud_suspected',
  'user_request',
  'service_issue',
  'compliance',
  'other_custom',
]);

const OWNER_EMAILS = new Set([
  'alahlyeagle13@gmail.com',
  'alahlyeagle@gmail.com',
  'elmahdy@admin.com',
]);

const ALLOWED_USER_STATUSES = new Set([
  'Active',
  'Suspended',
  'Blocked',
  'PendingEmailVerification',
  'PendingAdminApproval',
  'Rejected',
]);

const ALLOWED_USER_ROLES = new Set(['Admin', 'User']);

const DEFAULT_USER_PERMISSIONS = {
  uploadFiles: true,
  generateQuestions: true,
  generateImages: true,
  generateVideos: true,
  generateInfographics: true,
  useChatbot: true,
  useLiveVoice: true,
  useStudyTools: true,
  exportFiles: true,
  viewAdvancedVisuals: false,
  accessPremiumTools: false,
};

const DEFAULT_USER_LIMITS = {
  aiRequestsPerDay: 10,
  quizGenerationsPerDay: 5,
  uploadsPerDay: 5,
};

const FACULTY_FAST_ACCESS_SCOPE = 'faculty_science_fast_access' as const;
const FACULTY_FAST_ACCESS_TYPE = 'FacultyOfScienceFastAccess' as const;
const FACULTY_FAST_ACCESS_EXPIRY_HOURS = 72;
const FACULTY_FAST_ACCESS_INITIAL_CREDITS = 3;
const FACULTY_FAST_ACCESS_CREDIT_COST_PER_SUCCESS = 1;
const FACULTY_FAST_ACCESS_BATCH_YEAR_MIN = 2013;
const FACULTY_FAST_ACCESS_BATCH_YEAR_MAX = 2031;
const FACULTY_FAST_ACCESS_ALLOWED_BATCH_PREFIXES = new Set(
  Array.from(
    { length: FACULTY_FAST_ACCESS_BATCH_YEAR_MAX - FACULTY_FAST_ACCESS_BATCH_YEAR_MIN + 1 },
    (_, index) => String(FACULTY_FAST_ACCESS_BATCH_YEAR_MIN + index).slice(-2)
  )
);
const FULL_ACCOUNT_SCOPE = 'full_account' as const;
const FULL_ACCOUNT_ACADEMIC_LEVELS = new Set([
  'Level 1',
  'Level 2',
  'Level 3',
  'Level 4',
  'Master',
  'PhD',
]);
const ALLOWED_FAST_ACCESS_ADMIN_STATUSES = new Set(['active', 'disabled', 'deleted']);

type FastAccessCreditDeductionResult = {
  applied: boolean;
  alreadyApplied: boolean;
  remainingCredits: number;
  exhausted: boolean;
  eventId: string;
  reason?: 'insufficient';
};

type StandardCreditDeductionResult = {
  applied: boolean;
  alreadyApplied: boolean;
  remainingCredits: number;
  exhausted: boolean;
  eventId: string;
  reason?: 'insufficient';
};

const normalizeFastAccessCredits = (value: unknown): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return FACULTY_FAST_ACCESS_INITIAL_CREDITS;
  }
  return Math.max(0, Math.floor(numeric));
};

const normalizeUserCredits = (value: unknown): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.floor(numeric));
};

const resolveToolUnlockSelection = (toolId: string): string[] => {
  if (toolId === 'all') {
    return [...CANONICAL_UNLOCK_ELIGIBLE_TOOL_IDS];
  }
  if (!isToolUnlockEligible(toolId)) {
    throw new Error('invalid-tool-id');
  }
  return [toolId];
};

const normalizeE164Phone = (value: unknown): string => {
  const phone = normalizeRequiredString(value, 'phoneNumber');
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    throw new Error('phoneNumber must be a valid E.164 number (example: +201001234567)');
  }
  return phone;
};

const normalizeFastAccessAdminStatus = (
  value: unknown,
  fallback: 'active' | 'disabled' | 'deleted' = 'active'
): 'active' | 'disabled' | 'deleted' => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'active') return 'active';
  if (normalized === 'disabled' || normalized === 'suspended') return 'disabled';
  if (normalized === 'deleted') return 'deleted';
  return fallback;
};

const isFacultyFastAccessScopedUser = (userData: Record<string, unknown> | undefined): boolean => {
  if (!userData) return false;
  return (
    userData.accountScope === FACULTY_FAST_ACCESS_SCOPE ||
    userData.isTemporaryAccess === true ||
    userData.temporaryAccessType === FACULTY_FAST_ACCESS_TYPE
  );
};

const evaluateModelAccessForUser = (params: {
  userData: Record<string, unknown> | null;
  toolId: string;
  modelId: string;
}) => resolveModelAccess({
  modelId: params.modelId,
  toolId: params.toolId,
  unlockedModels: Array.isArray(params.userData?.unlockedModels)
    ? (params.userData?.unlockedModels as string[])
    : [],
  isAdmin: String(params.userData?.role || '').trim().toLowerCase() === 'admin',
  isTemporaryAccess: isFacultyFastAccessScopedUser(params.userData || undefined),
});

const buildModelAccessStructuredError = (params: {
  traceId: string;
  toolId: string;
  requestedModelId: string;
  access: ReturnType<typeof evaluateModelAccessForUser>;
}) => {
  const fallbackModelId = params.access.fallbackModelId;
  const baseDetails = {
    requestedModelId: params.requestedModelId,
    canonicalModelId: params.access.canonicalModelId,
    fallbackModelId: fallbackModelId || null,
    defaultModelIds: getDefaultAccessibleModelIdsForTool(params.toolId),
  };

  if (params.access.reasonCode === 'model-not-found') {
    return {
      category: 'validation' as const,
      code: 'MODEL_NOT_FOUND',
      message: params.access.message,
      userMessage: 'The selected model is not available in the live model registry.',
      stage: 'request_validation',
      traceId: params.traceId,
      retryable: false,
      details: baseDetails,
    };
  }

  if (params.access.reasonCode === 'model-incompatible') {
    return {
      category: 'validation' as const,
      code: 'MODEL_INCOMPATIBLE_WITH_TOOL',
      message: params.access.message,
      userMessage: 'The selected model cannot run this tool. Please choose a compatible model.',
      stage: 'request_validation',
      traceId: params.traceId,
      retryable: false,
      details: baseDetails,
    };
  }

  return {
    category: 'permission' as const,
    code: 'MODEL_LOCKED',
    message: params.access.message,
    userMessage: 'This model is locked. Unlock it with admin permission, an unlock code, or the 300 EGP model purchase flow.',
    stage: 'request_validation',
    traceId: params.traceId,
    retryable: false,
    details: baseDetails,
  };
};

const buildFastAccessLiveAccountListEntry = (
  id: string,
  userData: Record<string, unknown>,
  tempData: Record<string, unknown>
) => {
  const computedStatus = normalizeFastAccessAdminStatus(
    tempData.status,
    userData.isDeleted ? 'deleted' : userData.status === 'Suspended' ? 'disabled' : 'active'
  );
  const tempProfile = ((tempData.profile || {}) as Record<string, unknown>);
  const statusContext = (userData.statusContext || {}) as Record<string, unknown>;
  const adminControl = (tempData.adminControl || {}) as Record<string, unknown>;

  return {
    id,
    name: String(userData.name || 'CU Science Student'),
    email: String(userData.email || ''),
    username: String(userData.username || ''),
    phoneNumber: String(userData.phoneNumber || tempData.phoneNumber || ''),
    department: String(userData.department || tempProfile.department || ''),
    universityCode: String(userData.universityCode || tempProfile.universityCode || ''),
    academicYear: String(userData.academicYear || tempProfile.academicYear || ''),
    status: computedStatus,
    accountScope: String(userData.accountScope || tempData.accountScope || ''),
    temporaryAccessType: String(userData.temporaryAccessType || tempData.temporaryAccessType || ''),
    isTemporaryAccess: Boolean(userData.isTemporaryAccess),
    fastAccessCredits: normalizeFastAccessCredits(userData.fastAccessCredits ?? tempData.fastAccessCredits),
    temporaryAccessExpiresAt: String(userData.temporaryAccessExpiresAt || tempData.expiresAt || ''),
    usage: userData.usage || null,
    limits: userData.limits || null,
    totalAIRequests: Number(userData.totalAIRequests || 0),
    createdAt: String(userData.createdAt || tempData.createdAt || ''),
    updatedAt: String(userData.updatedAt || tempData.updatedAt || ''),
    deletedAt: String(userData.deletedAt || tempData.deletedAt || ''),
    isDeleted: Boolean(userData.isDeleted),
    readOnly: computedStatus === 'deleted',
    lifecycle: {
      lastCreditDeductedAt: String(tempData.lastCreditDeductedAt || ''),
      convertedAt: String(tempData.convertedAt || ''),
      convertedToScope: String(tempData.convertedToScope || ''),
    },
    statusContext: {
      suspensionReason:
        String(statusContext.suspensionReason || userData.statusMessage || ''),
      reactivationMessage: String(statusContext.reactivationMessage || ''),
      pendingReactivationNotice: Boolean(statusContext.pendingReactivationNotice),
      lastStatusChangedAt: String(statusContext.lastStatusChangedAt || ''),
      lastStatusChangedBy: String(statusContext.lastStatusChangedBy || ''),
    },
    internalNotes: String(adminControl.internalNotes || ''),
    deletionAudit: null,
  };
};

const buildFastAccessDeletedAuditListEntry = (
  auditId: string,
  auditData: Record<string, unknown>
) => {
  const userData = ((auditData.userSnapshot || {}) as Record<string, unknown>);
  const tempData = ((auditData.tempSnapshot || {}) as Record<string, unknown>);
  const tempProfile = ((tempData.profile || {}) as Record<string, unknown>);
  const statusContext = (userData.statusContext || {}) as Record<string, unknown>;
  const adminControl = (tempData.adminControl || {}) as Record<string, unknown>;
  const deletedAt = String(auditData.deletedAt || auditData.completedAt || auditData.updatedAt || '');
  const deletedBy = ((auditData.deletedBy || {}) as Record<string, unknown>);
  const deletedReason =
    normalizeOptionalString(auditData.deleteReason) ||
    normalizeOptionalString(statusContext.suspensionReason) ||
    normalizeOptionalString(userData.statusMessage) ||
    '';

  return {
    id: String(auditData.userId || auditId),
    auditId,
    name: String(userData.name || tempProfile.fullName || 'Deleted CU Science Student'),
    email: String(userData.email || ''),
    username: String(userData.username || ''),
    phoneNumber: String(userData.phoneNumber || tempData.phoneNumber || ''),
    department: String(userData.department || tempProfile.department || ''),
    universityCode: String(userData.universityCode || tempProfile.universityCode || ''),
    academicYear: String(userData.academicYear || tempProfile.academicYear || ''),
    status: 'deleted',
    accountScope: String(userData.accountScope || tempData.accountScope || FACULTY_FAST_ACCESS_SCOPE),
    temporaryAccessType: String(userData.temporaryAccessType || tempData.temporaryAccessType || FACULTY_FAST_ACCESS_TYPE),
    isTemporaryAccess: true,
    fastAccessCredits: normalizeFastAccessCredits(userData.fastAccessCredits ?? tempData.fastAccessCredits),
    temporaryAccessExpiresAt: String(userData.temporaryAccessExpiresAt || tempData.expiresAt || ''),
    usage: userData.usage || null,
    limits: userData.limits || null,
    totalAIRequests: Number(userData.totalAIRequests || 0),
    createdAt: String(userData.createdAt || tempData.createdAt || ''),
    updatedAt: deletedAt,
    deletedAt,
    isDeleted: true,
    readOnly: true,
    lifecycle: {
      lastCreditDeductedAt: String(tempData.lastCreditDeductedAt || ''),
      convertedAt: String(tempData.convertedAt || ''),
      convertedToScope: String(tempData.convertedToScope || ''),
    },
    statusContext: {
      suspensionReason: deletedReason,
      reactivationMessage: '',
      pendingReactivationNotice: false,
      lastStatusChangedAt: deletedAt,
      lastStatusChangedBy: String(deletedBy.uid || ''),
    },
    internalNotes: String(auditData.internalNote || adminControl.internalNotes || ''),
    deletionAudit: {
      auditId,
      deletedAt,
      deletedByUid: String(deletedBy.uid || ''),
      deletedByEmail: String(deletedBy.email || ''),
      deleteReason: deletedReason,
      deletionState: String(auditData.deletionState || ''),
      source: String(auditData.deletionSource || ''),
    },
  };
};

const rejectFastAccessTargetFromGenericAdminRoute = (targetUser: Record<string, unknown>): string | null => {
  if (!isFacultyFastAccessScopedUser(targetUser)) {
    return null;
  }

  return 'Faculty fast-access accounts must be managed through the dedicated fast-access admin routes to preserve temporary/full-account separation.';
};

const archiveAndDeleteFastAccessAccount = async (params: {
  userId: string;
  requester: { uid: string; email?: string | null };
  userData: Record<string, unknown>;
  tempData: Record<string, unknown>;
  reason?: string;
  internalNote?: string;
  source: string;
}) => {
  const {
    userId,
    requester,
    userData,
    tempData,
    reason,
    internalNote,
    source,
  } = params;

  const nowIso = new Date().toISOString();
  const auditRef = db.collection(COLLECTIONS.FACULTY_FAST_ACCESS_DELETION_AUDITS).doc();
  const userRef = db.collection(COLLECTIONS.USERS).doc(userId);
  const tempRef = db.collection(COLLECTIONS.FACULTY_FAST_ACCESS_ACCOUNTS).doc(userId);

  let authSnapshot: Record<string, unknown> | null = null;
  try {
    const authUser = await admin.auth().getUser(userId);
    authSnapshot = {
      uid: authUser.uid,
      phoneNumber: authUser.phoneNumber || '',
      email: authUser.email || '',
      displayName: authUser.displayName || '',
      disabled: authUser.disabled,
      providerIds: Array.isArray(authUser.providerData)
        ? authUser.providerData.map((provider) => String(provider.providerId || '')).filter(Boolean)
        : [],
    };
  } catch (error: any) {
    if (error?.code !== 'auth/user-not-found') {
      throw error;
    }
  }

  await auditRef.set({
    userId,
    accountScope: FACULTY_FAST_ACCESS_SCOPE,
    temporaryAccessType: FACULTY_FAST_ACCESS_TYPE,
    status: 'deleted',
    deletedAt: nowIso,
    deletedBy: {
      uid: requester.uid,
      email: normalizeOptionalString(requester.email) || '',
    },
    deleteReason: reason || '',
    internalNote: internalNote || '',
    deletionSource: source,
    deletionState: 'started',
    reRegistrationAllowed: true,
    userSnapshot: userData,
    tempSnapshot: tempData,
    authSnapshot,
    preservedCollections: [
      COLLECTIONS.FACULTY_FAST_ACCESS_CREDIT_EVENTS,
      'activities',
    ],
    createdAt: nowIso,
    updatedAt: nowIso,
  }, { merge: true });

  /**
   * DELETE / RE-REGISTRATION SAFETY GUARANTEE
   * ------------------------------------------------------------------
   * We release the Firebase Auth identity before removing Firestore profile
   * documents. That ordering is intentional: for phone-based temporary access,
   * freeing the auth record is what releases the phone number and allows the
   * same student to register again later without stale auth residue.
   */
  let authDeletionState = 'deleted';
  try {
    await admin.auth().deleteUser(userId);
  } catch (error: any) {
    if (error?.code === 'auth/user-not-found') {
      authDeletionState = 'already-missing';
    } else {
      await auditRef.set({
        deletionState: 'auth-delete-failed',
        authDeletionError: normalizeOptionalString(error?.message) || 'Failed to delete auth user.',
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      throw error;
    }
  }

  try {
    await Promise.all([
      userRef.delete(),
      tempRef.delete(),
    ]);
  } catch (error: any) {
    await auditRef.set({
      deletionState: 'auth-released-live-cleanup-failed',
      authDeletionState,
      liveCleanupError: normalizeOptionalString(error?.message) || 'Failed to remove live fast-access documents.',
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    throw error;
  }

  const completedAt = new Date().toISOString();
  await auditRef.set({
    deletionState: 'completed',
    authDeletionState,
    completedAt,
    liveDocumentsDeletedAt: completedAt,
    updatedAt: completedAt,
  }, { merge: true });

  return {
    auditId: auditRef.id,
    deletedAt: completedAt,
    authDeletionState,
  };
};

const normalizeFastAccessOperationId = (value: unknown, fallback: string): string => {
  const base = typeof value === 'string' ? value.trim() : '';
  const raw = base || fallback;
  return raw.replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 120) || fallback;
};

const buildFastAccessCreditEventDocId = (userId: string, operationId: string): string => {
  return crypto.createHash('sha256').update(`${userId}:${operationId}`).digest('hex');
};

const buildStandardCreditEventDocId = (userId: string, operationId: string): string => {
  return crypto.createHash('sha256').update(`standard:${userId}:${operationId}`).digest('hex');
};

const normalizeGiftCodeValue = (value: unknown): string => {
  const raw = normalizeRequiredString(value, 'code');
  return raw.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 64);
};

const applyFastAccessCreditDeduction = async (
  params: {
    userId: string;
    operationId: string;
    traceId: string;
    toolId: string;
    modelId: string;
    promptHash: string;
    fallbackHappened: boolean;
    usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
    resultTextLength: number;
  }
): Promise<FastAccessCreditDeductionResult> => {
  const { userId, operationId, traceId, toolId, modelId, promptHash, fallbackHappened, usage, resultTextLength } = params;
  const eventId = buildFastAccessCreditEventDocId(userId, operationId);
  const userRef = db.collection(COLLECTIONS.USERS).doc(userId);
  const tempAccessRef = db.collection(COLLECTIONS.FACULTY_FAST_ACCESS_ACCOUNTS).doc(userId);
  const creditEventRef = db.collection(COLLECTIONS.FACULTY_FAST_ACCESS_CREDIT_EVENTS).doc(eventId);

  const result = await db.runTransaction<FastAccessCreditDeductionResult>(async (tx) => {
    const [userSnap, eventSnap] = await Promise.all([tx.get(userRef), tx.get(creditEventRef)]);

    if (!userSnap.exists) {
      throw new Error('Fast-access user profile not found for credit deduction.');
    }

    if (eventSnap.exists && String(eventSnap.data()?.status || '').toLowerCase() === 'deducted') {
      const eventData = eventSnap.data() || {};
      const afterCredits = normalizeFastAccessCredits(eventData.afterCredits);
      return {
        applied: false,
        alreadyApplied: true,
        remainingCredits: afterCredits,
        exhausted: afterCredits <= 0,
        eventId,
      };
    }

    const userData = userSnap.data() || {};
    const currentCredits = normalizeFastAccessCredits(userData.fastAccessCredits);
    if (currentCredits < FACULTY_FAST_ACCESS_CREDIT_COST_PER_SUCCESS) {
      return {
        applied: false,
        alreadyApplied: false,
        remainingCredits: currentCredits,
        exhausted: true,
        eventId,
        reason: 'insufficient',
      };
    }

    const nowIso = new Date().toISOString();
    const nextCredits = currentCredits - FACULTY_FAST_ACCESS_CREDIT_COST_PER_SUCCESS;

    // SAFETY GUARANTEE:
    // We write the deduction event and new balance in the same transaction.
    // This keeps deduction idempotent and prevents duplicate charges across retries.
    tx.set(creditEventRef, {
      userId,
      operationId,
      traceId,
      status: 'deducted',
      amount: FACULTY_FAST_ACCESS_CREDIT_COST_PER_SUCCESS,
      beforeCredits: currentCredits,
      afterCredits: nextCredits,
      toolId,
      modelId,
      promptHash,
      fallbackHappened,
      usage: usage || null,
      resultTextLength,
      creditedSystem: 'faculty_fast_access_temporary',
      createdAt: nowIso,
      updatedAt: nowIso,
    }, { merge: true });

    tx.set(userRef, {
      fastAccessCredits: nextCredits,
      fastAccessCreditsUpdatedAt: nowIso,
      fastAccessCreditPolicy: {
        initialCredits: FACULTY_FAST_ACCESS_INITIAL_CREDITS,
        deductionPerSuccess: FACULTY_FAST_ACCESS_CREDIT_COST_PER_SUCCESS,
        lastDeductionAt: nowIso,
        lastDeductionOperationId: operationId,
        lastDeductionTraceId: traceId,
      },
      updatedAt: nowIso,
    }, { merge: true });

    tx.set(tempAccessRef, {
      fastAccessCredits: nextCredits,
      lastCreditDeductedAt: nowIso,
      lastCreditOperationId: operationId,
      updatedAt: nowIso,
    }, { merge: true });

    return {
      applied: true,
      alreadyApplied: false,
      remainingCredits: nextCredits,
      exhausted: nextCredits <= 0,
      eventId,
    };
  });

  return result;
};

const applyStandardCreditDeduction = async (
  params: {
    userId: string;
    operationId: string;
    traceId: string;
    toolId: string;
    modelId: string;
    promptHash: string;
    fallbackHappened: boolean;
    usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
    resultTextLength: number;
  }
): Promise<StandardCreditDeductionResult> => {
  const { userId, operationId, traceId, toolId, modelId, promptHash, fallbackHappened, usage, resultTextLength } = params;
  const eventId = buildStandardCreditEventDocId(userId, operationId);
  const userRef = db.collection(COLLECTIONS.USERS).doc(userId);
  const creditEventRef = db.collection(COLLECTIONS.USER_CREDIT_EVENTS).doc(eventId);

  const result = await db.runTransaction<StandardCreditDeductionResult>(async (tx) => {
    const [userSnap, eventSnap] = await Promise.all([tx.get(userRef), tx.get(creditEventRef)]);

    if (!userSnap.exists) {
      throw new Error('User profile not found for credit deduction.');
    }

    if (eventSnap.exists && String(eventSnap.data()?.status || '').toLowerCase() === 'deducted') {
      const eventData = eventSnap.data() || {};
      const afterCredits = normalizeUserCredits(eventData.afterCredits);
      return {
        applied: false,
        alreadyApplied: true,
        remainingCredits: afterCredits,
        exhausted: afterCredits <= 0,
        eventId,
      };
    }

    const userData = userSnap.data() || {};
    const currentCredits = normalizeUserCredits(userData.credits);
    if (currentCredits < 1) {
      return {
        applied: false,
        alreadyApplied: false,
        remainingCredits: currentCredits,
        exhausted: true,
        eventId,
        reason: 'insufficient',
      };
    }

    const nowIso = new Date().toISOString();
    const nextCredits = currentCredits - 1;

    /**
     * ARCHITECTURE SAFETY NOTE (Standard Credits)
     * ------------------------------------------------------------------
     * Normal-account AI credits are charged only in backend success paths.
     * This event+balance write is transactional and operation-idempotent,
     * preventing duplicate deductions on retries with the same operationId.
     */
    tx.set(creditEventRef, {
      userId,
      operationId,
      traceId,
      status: 'deducted',
      amount: 1,
      beforeCredits: currentCredits,
      afterCredits: nextCredits,
      toolId,
      modelId,
      promptHash,
      fallbackHappened,
      usage: usage || null,
      resultTextLength,
      creditedSystem: 'standard_user_account',
      createdAt: nowIso,
      updatedAt: nowIso,
    }, { merge: true });

    tx.set(userRef, {
      credits: nextCredits,
      creditsUpdatedAt: nowIso,
      creditPolicy: {
        deductionPerSuccess: 1,
        lastDeductionAt: nowIso,
        lastDeductionOperationId: operationId,
        lastDeductionTraceId: traceId,
      },
      updatedAt: nowIso,
    }, { merge: true });

    return {
      applied: true,
      alreadyApplied: false,
      remainingCredits: nextCredits,
      exhausted: nextCredits <= 0,
      eventId,
    };
  });

  return result;
};

const FAST_ACCESS_THROTTLE = {
  windowMs: 15 * 60 * 1000,
  maxRequestsPerWindow: 20,
  maxFailedAttemptsPerWindow: 6,
  blockDurationMs: 30 * 60 * 1000,
} as const;

type FastAccessThrottleEntry = {
  windowStart: number;
  requestCount: number;
  failedAttempts: number;
  blockedUntil?: number;
};

const fastAccessThrottleStore = new Map<string, FastAccessThrottleEntry>();

const isValidEmail = (value: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

const normalizeRoleLabel = (value: unknown): 'Admin' | 'User' => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'admin' ? 'Admin' : 'User';
};

const normalizeUserStatusLabel = (value: unknown): string => {
  return String(value || '').trim().toLowerCase();
};

const isReservedAdminEmail = (value: unknown): boolean => {
  const email = String(value || '').trim().toLowerCase();
  if (!email) return false;

  return ADMIN_IDENTITIES.some((identity) => String(identity.email || '').trim().toLowerCase() === email);
};

const resolveRoleContext = (
  decodedToken: admin.auth.DecodedIdToken,
  userData: Record<string, unknown> | undefined
) => {
  const claimRole = normalizeRoleLabel((decodedToken as any)?.role);
  const docRole = normalizeRoleLabel(userData?.role);
  const adminByEmail = isReservedAdminEmail(decodedToken?.email);
  const isAdmin = claimRole === 'Admin' || docRole === 'Admin' || adminByEmail;

  return {
    role: isAdmin ? 'Admin' as const : 'User' as const,
    adminLevel: normalizeOptionalString(userData?.adminLevel) || normalizeOptionalString((decodedToken as any)?.adminLevel),
    isAdmin,
    normalizedStatus: normalizeUserStatusLabel(userData?.status),
  };
};

const normalizeExpectedAuthType = (value: unknown): PlatformAuthType | null => {
  return value === 'admin' || value === 'fast_access' || value === 'normal'
    ? value
    : null;
};

const normalizeAuthSessionBootstrapSource = (
  value: unknown,
  fallback: 'login' | 'restore' | 'refresh'
): 'login' | 'restore' | 'refresh' => {
  return value === 'login' || value === 'restore' || value === 'refresh'
    ? value
    : fallback;
};

const buildSessionBootstrapInput = (params: {
  decodedToken: admin.auth.DecodedIdToken;
  userData: Record<string, unknown>;
  roleContext: ReturnType<typeof resolveRoleContext>;
  expectedAuthType?: PlatformAuthType | null;
  source: 'login' | 'restore' | 'refresh' | 'middleware_auto_recover' | 'logout';
}) => {
  const authType = resolvePlatformAuthType({
    decodedToken: params.decodedToken as Record<string, unknown>,
    userData: params.userData,
    isAdmin: params.roleContext.isAdmin,
  });

  return {
    authType,
    input: {
      decodedToken: params.decodedToken as admin.auth.DecodedIdToken & Record<string, unknown>,
      userData: params.userData,
      role: params.roleContext.role,
      adminLevel: params.roleContext.adminLevel,
      authType,
      expectedAuthType: params.expectedAuthType || null,
      source: params.source,
    },
  };
};

const isPrimaryAdmin = (userContext: any): boolean => {
  return userContext?.adminLevel === 'primary';
};

const canManageTargetUser = (actor: any, targetUser: any): { allowed: boolean; message?: string; code?: number } => {
  const targetEmail = String(targetUser?.email || '').toLowerCase();
  const targetRole = String(targetUser?.role || 'User');

  if (OWNER_EMAILS.has(targetEmail)) {
    return { allowed: false, message: 'Owner account is protected.', code: 403 };
  }

  if (actor?.uid && targetUser?.id && actor.uid === targetUser.id) {
    return { allowed: false, message: 'You cannot perform this action on your own account.', code: 400 };
  }

  if (targetRole === 'Admin' && !isPrimaryAdmin(actor)) {
    return { allowed: false, message: 'Only primary admin can manage other admin accounts.', code: 403 };
  }

  return { allowed: true };
};

const resolveAdminRecipients = async (
  db: FirebaseFirestore.Firestore
): Promise<{ emails: string[]; userIds: string[] }> => {
  const knownAdminEmails = new Set<string>([
    ...Array.from(OWNER_EMAILS),
    ...ADMIN_IDENTITIES.map((identity) => String(identity.email || '').toLowerCase()).filter(Boolean),
  ]);

  const configuredAdminEmail = normalizeOptionalString(process.env.ADMIN_EMAIL)?.toLowerCase();
  if (configuredAdminEmail) {
    knownAdminEmails.add(configuredAdminEmail);
  }

  const emails = new Set<string>(Array.from(knownAdminEmails));
  const userIds = new Set<string>();

  try {
    const roleSnapshot = await db
      .collection(COLLECTIONS.USERS)
      .where('role', 'in', ['Admin', 'admin'])
      .get();

    roleSnapshot.docs.forEach((doc) => {
      const user = doc.data() || {};
      const email = String(user.email || '').toLowerCase();
      if (email) {
        emails.add(email);
      }
      userIds.add(doc.id);
    });
  } catch (error) {
    logDiagnostic('warn', 'admin.recipient_lookup_role_query_failed', {
      area: 'auth',
      stage: 'resolveAdminRecipients',
      details: normalizeError(error),
    });
  }

  for (const email of knownAdminEmails) {
    try {
      const snapshot = await db.collection(COLLECTIONS.USERS).where('email', '==', email).get();
      snapshot.docs.forEach((doc) => {
        userIds.add(doc.id);
      });
    } catch (error) {
      logDiagnostic('warn', 'admin.recipient_lookup_email_query_failed', {
        area: 'auth',
        stage: 'resolveAdminRecipients',
        details: { email, ...normalizeError(error) },
      });
    }
  }

  return {
    emails: Array.from(emails),
    userIds: Array.from(userIds),
  };
};

const buildStatusNotification = (name: string, status: string, reason?: string) => {
  switch (status) {
    case 'Active':
      return {
        subject: 'Your Account has been Approved - Zootopia Club',
        html: `
          <h2>Welcome to Zootopia Club, ${name}!</h2>
          <p>Great news! Your account has been approved by our administrators.</p>
          <p>You can now log in and access all the features of the platform.</p>
          <a href="${process.env.APP_URL || 'https://zootopiaclub.com'}/login" style="display: inline-block; padding: 10px 20px; background-color: #10b981; color: white; text-decoration: none; border-radius: 5px; margin-top: 15px;">Log In Now</a>
        `,
        internalMessage: 'Your account has been approved. Welcome to Zootopia Club!',
      };
    case 'Rejected':
      return {
        subject: 'Update on Your Account Application - Zootopia Club',
        html: `
          <h2>Account Application Update</h2>
          <p>Dear ${name},</p>
          <p>Thank you for your interest in Zootopia Club. After careful review, we are unable to approve your account application at this time.</p>
          ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
          <p>If you believe this is a mistake, please contact our support team.</p>
        `,
        internalMessage: `Your account application has been rejected. ${reason ? `Reason: ${reason}` : ''}`,
      };
    case 'Suspended':
      return {
        subject: 'Your Account has been Suspended - Zootopia Club',
        html: `
          <h2>Account Suspended</h2>
          <p>Dear ${name},</p>
          <p>Your account has been temporarily suspended.</p>
          ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
          <p>Please contact support for more information or to appeal this decision.</p>
        `,
        internalMessage: `Your account has been suspended. ${reason ? `Reason: ${reason}` : ''}`,
      };
    case 'Blocked':
      return {
        subject: 'Your Account has been Blocked - Zootopia Club',
        html: `
          <h2>Account Blocked</h2>
          <p>Dear ${name},</p>
          <p>Your account has been blocked due to a violation of our terms of service.</p>
          ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
          <p>This action is final.</p>
        `,
        internalMessage: `Your account has been blocked. ${reason ? `Reason: ${reason}` : ''}`,
      };
    default:
      return null;
  }
};

const notifyUserStatusChange = async (
  userId: string,
  email: string,
  name: string,
  status: string,
  reason: string | undefined,
  communicationService: CommunicationService,
  transporter: nodemailer.Transporter
) => {
  const payload = buildStatusNotification(name, status, reason);
  if (!payload) {
    throw new Error('Invalid status');
  }

  if (process.env.EMAIL_USER && process.env.EMAIL_PASS && email) {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || `"Zootopia Club" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: payload.subject,
      html: payload.html,
    });
  }

  await communicationService.dispatchInternalMessage({
    userId,
    type: 'notification',
    purpose: 'account-status',
    title: payload.subject,
    message: payload.internalMessage,
  });
};

const getRequestIp = (req: express.Request): string => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0 && forwarded[0]) {
    return String(forwarded[0]).trim();
  }
  return req.ip || 'unknown';
};

const getFastAccessThrottleEntry = (key: string): FastAccessThrottleEntry => {
  const now = Date.now();
  const existing = fastAccessThrottleStore.get(key);

  if (!existing) {
    const initial: FastAccessThrottleEntry = {
      windowStart: now,
      requestCount: 0,
      failedAttempts: 0,
    };
    fastAccessThrottleStore.set(key, initial);
    return initial;
  }

  if (now - existing.windowStart > FAST_ACCESS_THROTTLE.windowMs) {
    existing.windowStart = now;
    existing.requestCount = 0;
    existing.failedAttempts = 0;
    existing.blockedUntil = undefined;
  }

  return existing;
};

const cleanupFastAccessThrottleStore = () => {
  const now = Date.now();
  for (const [key, value] of fastAccessThrottleStore.entries()) {
    const windowExpired = now - value.windowStart > FAST_ACCESS_THROTTLE.windowMs;
    const blockExpired = !value.blockedUntil || now > value.blockedUntil;
    if (windowExpired && blockExpired) {
      fastAccessThrottleStore.delete(key);
    }
  }
};

const checkFastAccessThrottle = (key: string) => {
  cleanupFastAccessThrottleStore();
  const now = Date.now();
  const entry = getFastAccessThrottleEntry(key);

  if (entry.blockedUntil && now < entry.blockedUntil) {
    const retryAfterSeconds = Math.ceil((entry.blockedUntil - now) / 1000);
    return {
      allowed: false,
      retryAfterSeconds,
      message: 'Too many OTP attempts. Please try again later.',
    };
  }

  entry.requestCount += 1;

  if (entry.requestCount > FAST_ACCESS_THROTTLE.maxRequestsPerWindow) {
    entry.blockedUntil = now + FAST_ACCESS_THROTTLE.blockDurationMs;
    const retryAfterSeconds = Math.ceil(FAST_ACCESS_THROTTLE.blockDurationMs / 1000);
    return {
      allowed: false,
      retryAfterSeconds,
      message: 'Fast-access verification is temporarily throttled.',
    };
  }

  return { allowed: true, retryAfterSeconds: 0, message: '' };
};

const recordFastAccessFailure = (key: string) => {
  const now = Date.now();
  const entry = getFastAccessThrottleEntry(key);
  entry.failedAttempts += 1;

  if (entry.failedAttempts >= FAST_ACCESS_THROTTLE.maxFailedAttemptsPerWindow) {
    entry.blockedUntil = now + FAST_ACCESS_THROTTLE.blockDurationMs;
  }
};

const recordFastAccessSuccess = (key: string) => {
  const entry = getFastAccessThrottleEntry(key);
  entry.failedAttempts = 0;
};

const validateFastAccessProfile = (input: unknown) => {
  const profile = typeof input === 'object' && input ? input as Record<string, unknown> : {};
  const fullName = normalizeRequiredString(profile.fullName, 'fullName');
  const universityCode = normalizeRequiredString(profile.universityCode, 'universityCode').replace(/\D/g, '');
  const department = normalizeOptionalString(profile.department);
  const derivedPrefix = universityCode.slice(0, 2);
  const academicYear = Number.parseInt(`20${derivedPrefix}`, 10);

  /**
   * VALIDATION GUARD (workflow-critical)
   * ------------------------------------------------------------------
   * Temporary Faculty student identity must follow strict onboarding policy:
   * - name required
   * - student code exactly 7 digits
   * - batch year derived from the first two digits of the code
   * - valid prefixes are limited to 13..31 (2013..2031)
   *
   * Keep this backend-enforced even if frontend UX changes.
   */
  if (fullName.length > 120) {
    throw new Error('fullName exceeds max length');
  }
  if (department && department.length > 120) {
    throw new Error('department exceeds max length');
  }
  if (!/^\d{7}$/.test(universityCode)) {
    throw new Error('universityCode must be exactly 7 digits');
  }
  if (!FACULTY_FAST_ACCESS_ALLOWED_BATCH_PREFIXES.has(derivedPrefix)) {
    throw new Error(
      `universityCode must begin with a valid batch prefix between ${String(FACULTY_FAST_ACCESS_BATCH_YEAR_MIN).slice(-2)} and ${String(FACULTY_FAST_ACCESS_BATCH_YEAR_MAX).slice(-2)}`
    );
  }
  if (!Number.isInteger(academicYear) || academicYear < FACULTY_FAST_ACCESS_BATCH_YEAR_MIN || academicYear > FACULTY_FAST_ACCESS_BATCH_YEAR_MAX) {
    throw new Error(`academicYear must be between ${FACULTY_FAST_ACCESS_BATCH_YEAR_MIN} and ${FACULTY_FAST_ACCESS_BATCH_YEAR_MAX}`);
  }

  return {
    fullName,
    universityCode,
    department: department || 'Faculty of Science',
    academicYear: String(academicYear),
  };
};

const normalizeFastAccessProfileCompletionStage = (
  value: unknown,
  fallback: 'pending_profile_completion' | 'temporary_onboarding_complete' | 'converted_to_full_account' = 'temporary_onboarding_complete'
) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'pending_profile_completion') return 'pending_profile_completion' as const;
  if (normalized === 'temporary_onboarding_complete') return 'temporary_onboarding_complete' as const;
  if (normalized === 'converted_to_full_account') return 'converted_to_full_account' as const;
  return fallback;
};

const hasCompletedFastAccessProfileData = (
  userData: Record<string, unknown> | null,
  tempData: Record<string, unknown> | null
) => {
  const tempProfile =
    typeof tempData?.profile === 'object' && tempData?.profile
      ? tempData.profile as Record<string, unknown>
      : null;

  const fullName =
    normalizeOptionalString(userData?.name) ||
    normalizeOptionalString(tempProfile?.fullName) ||
    '';
  const universityCode =
    normalizeOptionalString(userData?.universityCode) ||
    normalizeOptionalString(tempProfile?.universityCode) ||
    '';

  return Boolean(fullName) && Boolean(universityCode);
};

const resolveFastAccessProfileCompletionStage = (
  userData: Record<string, unknown> | null,
  tempData: Record<string, unknown> | null
) => {
  const metadata =
    typeof userData?.fastAccessMetadata === 'object' && userData.fastAccessMetadata
      ? userData.fastAccessMetadata as Record<string, unknown>
      : null;

  const explicitStage =
    normalizeOptionalString(metadata?.profileCompletionStage) ||
    normalizeOptionalString(tempData?.profileCompletionStage);

  if (explicitStage) {
    return normalizeFastAccessProfileCompletionStage(explicitStage);
  }

  return hasCompletedFastAccessProfileData(userData, tempData)
    ? 'temporary_onboarding_complete'
    : 'pending_profile_completion';
};

const normalizeAuthProviderList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((provider): provider is string => typeof provider === 'string' && provider.trim().length > 0)
    .map((provider) => provider.trim());
};

const logAdminUserAction = async (
  db: FirebaseFirestore.Firestore,
  adminUserId: string,
  action: string,
  metadata: Record<string, unknown> = {}
) => {
  try {
    await db.collection('activities').add({
      userId: adminUserId,
      type: 'admin_action',
      description: action,
      timestamp: new Date().toISOString(),
      status: 'success',
      metadata,
    });
  } catch (error) {
    console.error('Failed to log admin action:', error);
  }
};

  const communicationService = new CommunicationService(db, transporter);
  billingService.setCommunicationService(communicationService);
  const codeService = new CodeService(db);

  /**
   * ARCHITECTURE GUARD (Auth/Admin Separation)
   * ------------------------------------------------------------------
   * Keep authorization split in layers:
   * 1) `authMiddleware` proves caller identity for signed-in user flows.
   * 2) `adminMiddleware` is authoritative for admin-only operations.
   *
   * Do not collapse these checks into frontend guards or UI visibility rules.
   * Backend middleware remains the security boundary for privileged access.
   */
  const resolveRequestUserContext = async (
    req: express.Request,
    expectedAuthType?: PlatformAuthType
  ) => {
    const idToken = req.headers.authorization?.split('Bearer ')[1];
    if (!idToken) {
      return {
        ok: false as const,
        statusCode: 401,
        payload: { success: false, error: 'Unauthorized: Missing token' },
      };
    }

    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const userDoc = await db.collection(COLLECTIONS.USERS).doc(decodedToken.uid).get();
      const userData = (userDoc.data() || {}) as Record<string, unknown>;
      const roleContext = resolveRoleContext(decodedToken, userData);

      if (!roleContext.isAdmin && ['suspended', 'blocked', 'rejected'].includes(roleContext.normalizedStatus)) {
        const statusContext = (userData.statusContext || {}) as Record<string, unknown>;
        return {
          ok: false as const,
          statusCode: 403,
          payload: {
            success: false,
            error: 'Account access is currently restricted.',
            code: 'ACCOUNT_RESTRICTED',
            accountStatus: String(userData.status || ''),
            statusMessage:
              normalizeOptionalString(statusContext.suspensionReason) ||
              normalizeOptionalString(userData.statusMessage) ||
              null,
            reinstatementMessage:
              normalizeOptionalString(statusContext.reactivationMessage) || null,
          },
        };
      }

      if (expectedAuthType === 'admin' && ['suspended', 'blocked', 'rejected'].includes(roleContext.normalizedStatus)) {
        return {
          ok: false as const,
          statusCode: 403,
          payload: {
            success: false,
            error: 'Forbidden: Admin account is not active',
          },
        };
      }

      const sessionBootstrap = buildSessionBootstrapInput({
        decodedToken,
        userData,
        roleContext,
        expectedAuthType,
        source: 'middleware_auto_recover',
      });

      const sessionValidation = await authSessionService.validateSession({
        ...sessionBootstrap.input,
        autoRecover: true,
      });

      if (sessionValidation.ok === false) {
        return {
          ok: false as const,
          statusCode: sessionValidation.statusCode,
          payload: {
            success: false,
            error: sessionValidation.error,
            code: sessionValidation.code,
            sessionState: sessionValidation.session?.sessionState || null,
          },
        };
      }

      if (expectedAuthType && sessionValidation.session.authType !== expectedAuthType) {
        return {
          ok: false as const,
          statusCode: expectedAuthType === 'admin' ? 403 : 409,
          payload: {
            success: false,
            error:
              expectedAuthType === 'admin'
                ? 'Forbidden: Admin access required'
                : expectedAuthType === 'fast_access'
                  ? 'Only temporary Faculty fast-access sessions may access this route.'
                  : 'Authentication mode mismatch detected.',
            code: 'AUTH_MODE_MISMATCH',
            authType: sessionValidation.session.authType,
          },
        };
      }

      return {
        ok: true as const,
        userContext: {
          uid: decodedToken.uid,
          email: decodedToken.email || null,
          role: roleContext.role,
          adminLevel: roleContext.adminLevel,
          isAdmin: roleContext.isAdmin,
          authType: sessionValidation.session.authType,
          authSession: sessionValidation.session,
        },
      };
    } catch (error) {
      return {
        ok: false as const,
        statusCode: 401,
        payload: {
          success: false,
          error: 'Unauthorized: Invalid token',
          details: normalizeError(error),
        },
      };
    }
  };

  const authMiddleware = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const resolved = await resolveRequestUserContext(req);
    if (!resolved.ok) {
      return res.status(resolved.statusCode).json(resolved.payload);
    }

    (req as any).userContext = resolved.userContext;
    next();
  };

  // Strong Admin Authorization Middleware
  const adminMiddleware = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const resolved = await resolveRequestUserContext(req, 'admin');
    if (!resolved.ok) {
      return res.status(resolved.statusCode).json(resolved.payload);
    }

    /**
     * SECURITY BOUNDARY (Admin Authorization)
     * ------------------------------------------------------------------
     * Frontend route guards are UX helpers only.
     * Backend admin middleware is the authoritative gate for all
     * admin-prefixed routes and must remain strict and normalized.
     */
    if (!resolved.userContext.isAdmin) {
      return res.status(403).json({ success: false, error: "Forbidden: Admin access required" });
    }

    (req as any).userContext = resolved.userContext;
    next();
  };

  const fastAccessAuthMiddleware = async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    const resolved = await resolveRequestUserContext(req, 'fast_access');
    if (!resolved.ok) {
      return res.status(resolved.statusCode).json(resolved.payload);
    }

    (req as any).userContext = resolved.userContext;
    next();
  };

  app.post('/api/auth/session/bootstrap', async (req, res) => {
    const idToken = req.headers.authorization?.split('Bearer ')[1];
    if (!idToken) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Missing token' });
    }

    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const userDoc = await db.collection(COLLECTIONS.USERS).doc(decodedToken.uid).get();
      const userData = (userDoc.data() || {}) as Record<string, unknown>;
      const roleContext = resolveRoleContext(decodedToken, userData);
      const expectedAuthType = normalizeExpectedAuthType(req.body?.expectedAuthType);
      const sessionBootstrap = buildSessionBootstrapInput({
        decodedToken,
        userData,
        roleContext,
        expectedAuthType,
        source: normalizeAuthSessionBootstrapSource(req.body?.source, 'restore'),
      });

      const session = await authSessionService.bootstrapSession(sessionBootstrap.input);

      return res.json({
        success: true,
        data: {
          session,
        },
      });
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: 'Failed to bootstrap session.',
        details: normalizeError(error),
      });
    }
  });

  app.post('/api/auth/session/refresh', async (req, res) => {
    const idToken = req.headers.authorization?.split('Bearer ')[1];
    if (!idToken) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Missing token' });
    }

    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const userDoc = await db.collection(COLLECTIONS.USERS).doc(decodedToken.uid).get();
      const userData = (userDoc.data() || {}) as Record<string, unknown>;
      const roleContext = resolveRoleContext(decodedToken, userData);
      const expectedAuthType = normalizeExpectedAuthType(req.body?.expectedAuthType);
      const sessionBootstrap = buildSessionBootstrapInput({
        decodedToken,
        userData,
        roleContext,
        expectedAuthType,
        source: normalizeAuthSessionBootstrapSource(req.body?.source, 'refresh'),
      });

      const session = await authSessionService.refreshSession(sessionBootstrap.input);

      return res.json({
        success: true,
        data: {
          session,
        },
      });
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: 'Failed to refresh session.',
        details: normalizeError(error),
      });
    }
  });

  app.post('/api/auth/session/logout', async (req, res) => {
    const idToken = req.headers.authorization?.split('Bearer ')[1];
    if (!idToken) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Missing token' });
    }

    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const userDoc = await db.collection(COLLECTIONS.USERS).doc(decodedToken.uid).get();
      const userData = (userDoc.data() || {}) as Record<string, unknown>;
      const roleContext = resolveRoleContext(decodedToken, userData);
      const sessionBootstrap = buildSessionBootstrapInput({
        decodedToken,
        userData,
        roleContext,
        expectedAuthType: normalizeExpectedAuthType(req.body?.authType),
        source: 'logout',
      });

      const session = await authSessionService.logoutSession({
        ...sessionBootstrap.input,
        source: 'logout',
        reason: normalizeOptionalString(req.body?.reason) || 'logout',
      });

      return res.json({
        success: true,
        data: {
          session,
        },
      });
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: 'Failed to invalidate session.',
        details: normalizeError(error),
      });
    }
  });

  app.get('/api/assets/:assetId/content', authMiddleware, assetAccessRateLimiter, async (req, res) => {
    try {
      const requester = (req as any).userContext as {
        uid: string;
        isAdmin?: boolean;
      };
      const assetId = normalizeRequiredString(req.params.assetId, 'assetId');
      const assetDoc = await db.collection(GENERATED_ASSET_COLLECTION).doc(assetId).get();

      if (!assetDoc.exists) {
        return res.status(404).json({
          success: false,
          error: 'Asset not found.',
        });
      }

      const assetData = (assetDoc.data() || {}) as Record<string, unknown>;
      const ownerUserId = normalizeRequiredString(assetData.userId, 'asset.userId');
      const storagePath = normalizeRequiredString(assetData.storagePath, 'asset.storagePath');
      const mimeType = normalizeOptionalString(assetData.mimeType) || 'application/octet-stream';
      const expiresAt = assetData.expiresAt as { toDate?: () => Date } | undefined;
      const isExpired = expiresAt?.toDate ? expiresAt.toDate().getTime() <= Date.now() : false;

      if (isExpired) {
        return res.status(410).json({
          success: false,
          error: 'Asset has expired.',
        });
      }

      if (!requester?.isAdmin && requester?.uid !== ownerUserId) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden: You can only access your own private assets.',
        });
      }

      if (!FIREBASE_STORAGE_BUCKET) {
        return res.status(500).json({
          success: false,
          error: 'Storage bucket is not configured on the server.',
        });
      }

      const bucket = admin.storage().bucket(FIREBASE_STORAGE_BUCKET);
      const storageFile = bucket.file(storagePath);
      const [exists] = await storageFile.exists();

      if (!exists) {
        return res.status(404).json({
          success: false,
          error: 'Stored asset file not found.',
        });
      }

      const requestedDisposition =
        String(req.query.disposition || req.query.download || '').trim().toLowerCase();
      const dispositionType =
        requestedDisposition === 'attachment' || requestedDisposition === 'true'
          ? 'attachment'
          : 'inline';
      const safeFileName = sanitizeAttachmentFileName(assetData.title, 'generated-asset');

      res.setHeader('Content-Type', mimeType);
      res.setHeader(
        'Content-Disposition',
        `${dispositionType}; filename="${safeFileName}"; filename*=UTF-8''${encodeURIComponent(safeFileName)}`
      );
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      res.setHeader('X-Content-Type-Options', 'nosniff');

      const readStream = storageFile.createReadStream();
      readStream.on('error', (error) => {
        logDiagnostic('error', 'assets.content.stream_failed', {
          area: 'assets',
          route: '/api/assets/:assetId/content',
          userId: requester?.uid,
          details: {
            ...normalizeError(error),
            assetId,
          },
        });
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: 'Failed to stream asset content.',
          });
        } else {
          res.end();
        }
      });

      logDiagnostic('info', 'assets.content.stream_started', {
        area: 'assets',
        route: '/api/assets/:assetId/content',
        userId: requester?.uid,
        status: 'success',
        details: {
          assetId,
          mimeType,
          dispositionType,
          requesterRole: requester?.isAdmin ? 'admin' : 'user',
        },
      });

      readStream.pipe(res);
    } catch (error: any) {
      logDiagnostic('error', 'assets.content.request_failed', {
        area: 'assets',
        route: '/api/assets/:assetId/content',
        details: normalizeError(error),
      });
      res.status(500).json({
        success: false,
        error: error?.message || 'Failed to resolve asset content.',
      });
    }
  });

  app.post(
    '/api/documents/intake',
    authMiddleware,
    express.raw({ type: 'application/octet-stream', limit: '50mb' }),
    async (req, res) => {
      try {
        const actor = resolveDocumentActorContextFromRequest(req);
        const encodedFileNameHeader = Array.isArray(req.headers['x-zootopia-file-name'])
          ? req.headers['x-zootopia-file-name'][0]
          : req.headers['x-zootopia-file-name'];
        const encodedMimeTypeHeader = Array.isArray(req.headers['x-zootopia-file-type'])
          ? req.headers['x-zootopia-file-type'][0]
          : req.headers['x-zootopia-file-type'];
        const requestedPathwayHeader = Array.isArray(req.headers['x-zootopia-document-pathway'])
          ? req.headers['x-zootopia-document-pathway'][0]
          : req.headers['x-zootopia-document-pathway'];

        const fileName = decodeUriComponentSafe(encodedFileNameHeader);
        const mimeType = normalizeOptionalString(encodedMimeTypeHeader) || 'application/octet-stream';
        const requestedPathway = normalizeDocumentProcessingPathway(requestedPathwayHeader);
        const fileBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || []);

        if (!fileName) {
          return res.status(400).json({
            success: false,
            error: 'file-name-required',
          });
        }

        if (!fileBuffer.byteLength) {
          return res.status(400).json({
            success: false,
            error: 'file-body-required',
          });
        }

        const result = await documentIntakeService.intake({
          actor,
          fileName,
          mimeType,
          buffer: fileBuffer,
          requestedPathway,
        });

        return res.json({
          success: true,
          document: {
            documentId: result.document.documentId,
            workflowId: result.document.workflowId,
            artifactId: result.artifact.artifactId,
            sourceFileId: result.document.sourceFileId,
            fileName: result.document.fileName,
            mimeType: result.document.mimeType,
            fileType: result.document.fileType,
            fileSizeBytes: result.document.fileSizeBytes,
            status: result.document.status,
            processingPathway: result.document.processingPathway,
            runtimeOperationId: result.document.runtimeOperationId,
            workspaceScope: result.document.workspaceScope,
            ownerRole: result.document.ownerRole,
          },
          artifact: {
            artifactId: result.artifact.artifactId,
            extractionStrategy: result.artifact.extractionStrategy,
            extractionVersion: result.artifact.extractionVersion,
            languageHints: result.artifact.languageHints,
            textLength: result.artifact.textLength,
            pageCount: result.artifact.pageCount,
            extractedText: result.payload.normalizedText || result.payload.fullText,
          },
          runtime: result.runtime,
          operation: result.operation,
        });
      } catch (error: any) {
        const message = normalizeOptionalString(error?.message) || 'document-intake-failed';
        const status =
          message === 'DOCUMENT_RUNTIME_LOCK_CONFLICT'
            ? 409
            : message === 'DOCUMENT_RUNTIME_STALE_WRITE_BLOCKED'
              ? 409
              : message === 'DOCUMENT_OPERATION_CANCELLED' || message === 'File processing was cancelled.'
                ? 409
            : message === 'DOCUMENT_ACCESS_DENIED'
              ? 403
              : message === 'DIRECT_FILE_MODE_DISABLED'
                ? 409
                : 400;

        return res.status(status).json({
          success: false,
          error: message,
        });
      }
    }
  );

  app.get('/api/documents/:documentId/artifact', authMiddleware, async (req, res) => {
    try {
      const actor = resolveDocumentActorContextFromRequest(req);
      const documentId = normalizeRequiredString(req.params.documentId, 'documentId');
      const resolved = await documentArtifactStore.getArtifactForDocument(actor, documentId);

      res.json({
        success: true,
        document: resolved.document,
        artifact: resolved.artifact,
        payload: {
          artifactId: resolved.payload.artifactId,
          documentId: resolved.payload.documentId,
          workflowId: resolved.payload.workflowId,
          sourceFileId: resolved.payload.sourceFileId,
          sourceFileName: resolved.payload.sourceFileName,
          sourceMimeType: resolved.payload.sourceMimeType,
          fileType: resolved.payload.fileType,
          normalizedText: resolved.payload.normalizedText,
          normalizedMarkdown: resolved.payload.normalizedMarkdown,
          headingTree: resolved.payload.headingTree,
          pageMap: resolved.payload.pageMap,
          extractionMeta: resolved.payload.extractionMeta,
          languageHints: resolved.payload.languageHints,
          pageSegments: resolved.payload.pageSegments,
          sourceAttribution: resolved.payload.sourceAttribution,
        },
      });
    } catch (error: any) {
      const message = normalizeOptionalString(error?.message) || 'document-artifact-load-failed';
      const status =
        message === 'DOCUMENT_ACCESS_DENIED'
          ? 403
          : message === 'DOCUMENT_ARTIFACT_EXPIRED'
            ? 410
            : message === 'DOCUMENT_ARTIFACT_NOT_READY'
              ? 409
              : 404;
      res.status(status).json({
        success: false,
        error: message,
      });
    }
  });

  app.get('/api/documents/:documentId/context', authMiddleware, async (req, res) => {
    try {
      const actor = resolveDocumentActorContextFromRequest(req);
      const documentId = normalizeRequiredString(req.params.documentId, 'documentId');
      const toolId = normalizeRequiredString(req.query.toolId, 'toolId');
      const mode = normalizeOptionalString(req.query.mode) || null;
      const charLimit = parseOptionalPositiveInt(req.query.limit, 'limit');
      const resolved = await promptContextResolver.resolve({
        actor,
        documentId,
        toolId,
        mode,
        charLimit,
      });

      res.json({
        success: true,
        documentId: resolved.document.documentId,
        artifactId: resolved.artifact.artifactId,
        fileContext: resolved.fileContext,
        additionalContext: resolved.additionalContext,
      });
    } catch (error: any) {
      const message = normalizeOptionalString(error?.message) || 'document-context-load-failed';
      const status =
        message === 'DOCUMENT_ACCESS_DENIED'
          ? 403
          : message === 'DOCUMENT_ARTIFACT_EXPIRED'
            ? 410
            : message === 'DOCUMENT_ARTIFACT_NOT_READY'
              ? 409
              : 404;
      res.status(status).json({
        success: false,
        error: message,
      });
    }
  });

  app.delete('/api/documents/:documentId/artifact', authMiddleware, async (req, res) => {
    try {
      const actor = resolveDocumentActorContextFromRequest(req);
      const documentId = normalizeRequiredString(req.params.documentId, 'documentId');
      await cleanupCoordinator.invalidateDocument(actor, documentId, 'Document removed by actor.');

      res.json({
        success: true,
        documentId,
      });
    } catch (error: any) {
      const message = normalizeOptionalString(error?.message) || 'document-delete-failed';
      res.status(message === 'DOCUMENT_ACCESS_DENIED' ? 403 : 404).json({
        success: false,
        error: message,
      });
    }
  });

  app.post('/api/documents/:documentId/cancel', authMiddleware, async (req, res) => {
    try {
      const actor = resolveDocumentActorContextFromRequest(req);
      const documentId = normalizeRequiredString(req.params.documentId, 'documentId');
      const document = await documentArtifactStore.getOwnedDocument(actor, documentId);
      const operationId =
        normalizeOptionalString(req.body?.operationId) || document.runtimeOperationId;

      await cleanupCoordinator.cancelOperation(actor, documentId, operationId);

      res.json({
        success: true,
        documentId,
        operationId,
      });
    } catch (error: any) {
      const message = normalizeOptionalString(error?.message) || 'document-cancel-failed';
      res.status(message === 'DOCUMENT_ACCESS_DENIED' ? 403 : 404).json({
        success: false,
        error: message,
      });
    }
  });

  app.post('/api/documents/:documentId/direct-dispatch/prepare', authMiddleware, async (req, res) => {
    try {
      const actor = resolveDocumentActorContextFromRequest(req);
      const documentId = normalizeRequiredString(req.params.documentId, 'documentId');
      const toolId = normalizeRequiredString(req.body?.toolId, 'toolId');
      const modelId = normalizeRequiredString(req.body?.modelId, 'modelId');
      const result = await directModelFileDispatchService.prepare({
        actor,
        documentId,
        toolId,
        modelId,
        providerSettings: req.body?.providerSettings,
        toolSettings: req.body?.toolSettings,
        userPreferences: normalizeOptionalString(req.body?.userPreferences),
        mode: normalizeOptionalString(req.body?.mode) || null,
      });

      res.json({
        success: true,
        preparation: result,
      });
    } catch (error: any) {
      const message = normalizeOptionalString(error?.message) || 'direct-dispatch-prepare-failed';
      const status =
        message === 'DIRECT_FILE_MODE_DISABLED'
          ? 409
          : message === 'DOCUMENT_ACCESS_DENIED'
            ? 403
            : 400;

      res.status(status).json({
        success: false,
        error: message,
      });
    }
  });

  app.get('/api/admin/security/provider-config-summary', adminMiddleware, adminSecuritySummaryRateLimiter, async (req, res) => {
    try {
      const requester = (req as any).userContext;
      const summary = buildProviderSecuritySummary(process.env);

      logDiagnostic('info', 'admin.security.provider_summary_loaded', {
        area: 'security',
        route: '/api/admin/security/provider-config-summary',
        userId: requester?.uid,
        status: 'success',
        details: {
          googleConfigured: summary.providers.google.configured,
          alibabaConfigured: summary.providers.alibabaModelStudio.configured,
          alibabaRegion: summary.providers.alibabaModelStudio.region,
          sourceMapsEnabled: summary.sourceMapsEnabled,
          assetDeliveryMode: summary.assetDeliveryMode,
        },
      });

      res.json({
        success: true,
        summary,
      });
    } catch (error: any) {
      logDiagnostic('error', 'admin.security.provider_summary_failed', {
        area: 'security',
        route: '/api/admin/security/provider-config-summary',
        details: normalizeError(error),
      });
      res.status(500).json({
        success: false,
        error: error?.message || 'Failed to load provider security summary.',
      });
    }
  });

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Admin Custom Claims Endpoint
  app.post("/api/admin/set-claims", adminMiddleware, async (req, res) => {
    const { uid, email } = req.body;
    
    if (!uid || !email) {
      return res.status(400).json({ success: false, error: "UID and Email are required" });
    }

    const adminIdentity = ADMIN_IDENTITIES.find(a => a.email === email);
    
    if (!adminIdentity) {
      return res.status(403).json({ success: false, error: "User is not in the authorized admin list" });
    }

    const requester = (req as any).userContext;
    if (!isPrimaryAdmin(requester) && requester?.uid !== uid) {
      return res.status(403).json({ success: false, error: 'Only primary admin can assign claims for other users' });
    }

    try {
      await admin.auth().setCustomUserClaims(uid, {
        role: 'Admin',
        adminLevel: adminIdentity.level
      });
      console.log(`Custom claims set for user: ${email}`);
      res.json({ success: true, message: "Custom claims updated" });
    } catch (error: any) {
      console.error("Error setting custom claims:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Code Generation Endpoint
  app.post("/api/admin/generate-code", adminMiddleware, async (req, res) => {
    try {
      const { 
        purpose, 
        codeType = 'singleUse', 
        usageMode = 'single-use',
        maxUses,
        expiresAt,
        neverExpires = false,
        recipientUserId,
        recipientEmail,
        recipientUsername,
        title,
        description,
        notes,
        deliveryChannel = 'internal',
        templateId,
        messageType,
        metadata = {} 
      } = req.body;

      // Phase 1A scaffolding: canonical contract validation is currently advisory.
      // Enforcement switches are intentionally deferred to later phases.
      try {
        validateUnlockCodePolicy({
          purpose,
          usageMode,
          maxUses,
          expiresAtIso: expiresAt,
          neverExpires,
        });
      } catch (contractError) {
        logDiagnostic('warn', 'contracts.unlock_code_policy_noncanonical', {
          area: 'contracts',
          stage: 'api/admin/generate-code',
          details: normalizeError(contractError),
        });
      }

      const normalizedPurpose = normalizeRequiredString(purpose, 'purpose');
      const normalizedRecipientUserId = normalizeOptionalString(recipientUserId);
      const normalizedRecipientEmail = normalizeOptionalString(recipientEmail)?.toLowerCase();
      const normalizedRecipientUsername = normalizeOptionalString(recipientUsername);
      const normalizedTitle = normalizeOptionalString(title);
      const normalizedDescription = normalizeOptionalString(description);
      const normalizedNotes = normalizeOptionalString(notes);
      const normalizedTemplateId = normalizeOptionalString(templateId);
      const normalizedMessageType = normalizeOptionalString(messageType);
      const normalizedExpiresAt = normalizeOptionalIsoDate(expiresAt, 'expiresAt');
      const normalizedMaxUses = parseOptionalPositiveInt(maxUses, 'maxUses');
      
      const generateCodeValue = (purpose: string) => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        const randomStr = (len: number) => Array.from({length: len}, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
        
        const prefix = purpose === 'secrets-access' ? 'SEC' :
                       purpose === 'gift-code' ? 'GIFT' :
                       purpose === 'chat-unlock' ? 'CHAT' :
                       purpose === 'tool-unlock' ? 'TOOL' :
                       purpose === 'model-unlock' ? 'MOD' : 'GEN';
        
        return `${prefix}-${randomStr(4)}-${randomStr(4)}`;
      };

      let result = '';
      let isDuplicate = true;
      let attempts = 0;
      
      while (isDuplicate && attempts < 10) {
        result = generateCodeValue(normalizedPurpose);
        const snapshot = await db.collection(COLLECTIONS.ISSUED_CODES).where('codeValue', '==', result).get();
        isDuplicate = !snapshot.empty;
        attempts++;
      }
      
      if (isDuplicate) {
        return res.status(500).json({ success: false, error: "Failed to generate a unique code after multiple attempts." });
      }
      
      const codeData: any = {
        codeValue: result,
        codeType,
        usageMode,
        purpose: normalizedPurpose,
        title: normalizedTitle,
        description: normalizedDescription,
        notes: normalizedNotes,
        issuedByAdminId: (req as any).userContext.uid,
        issuedByAdminName: (req as any).userContext.email || 'Admin',
        issuedAt: new Date().toISOString(),
        expiresAt: normalizedExpiresAt,
        neverExpires,
        maxUses: normalizedMaxUses,
        deliveryChannel,
        templateId: normalizedTemplateId,
        messageType: normalizedMessageType,
        metadata
      };
      if (normalizedRecipientUserId) codeData.recipientUserId = normalizedRecipientUserId;
      if (normalizedRecipientEmail) codeData.recipientEmail = normalizedRecipientEmail;
      if (normalizedRecipientUsername) codeData.recipientUsername = normalizedRecipientUsername;

      const codeId = await codeService.issueCode(codeData);
      
      res.json({ code: result, id: codeId });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Code Verification Endpoint
  app.post("/api/codes/verify", async (req, res) => {
    try {
      const { codeValue, purpose } = req.body;
      const normalizedCodeValue = normalizeRequiredString(codeValue, 'codeValue');
      const normalizedPurpose = normalizeRequiredString(purpose, 'purpose');
      const idToken = req.headers.authorization?.split('Bearer ')[1];
      if (!idToken) return res.status(401).json({ error: "Unauthorized" });
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      
      const code = await codeService.verifyAndRedeem(normalizedCodeValue, decodedToken.uid, decodedToken.email || '', normalizedPurpose);
      
      res.json({ success: true, code });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post('/api/unlocks/redeem-tool-code', async (req, res) => {
    try {
      const idToken = req.headers.authorization?.split('Bearer ')[1];
      if (!idToken) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const codeValue = normalizeRequiredString(req.body?.codeValue, 'codeValue');
      const requestedToolId = normalizeRequiredString(req.body?.toolId, 'toolId');

      if (!isToolUnlockEligible(requestedToolId)) {
        return res.status(400).json({ success: false, error: 'invalid-tool-id' });
      }

      const redeemedCode = await codeService.verifyAndRedeem(
        codeValue,
        decodedToken.uid,
        decodedToken.email || '',
        'tool-unlock'
      );

      const metadataTargetToolId = normalizeOptionalString((redeemedCode as any)?.metadata?.targetToolId);
      if (metadataTargetToolId && metadataTargetToolId !== 'all') {
        if (!isToolUnlockEligible(metadataTargetToolId)) {
          throw new Error('code-target-tool-invalid');
        }
        if (metadataTargetToolId !== requestedToolId) {
          throw new Error('wrong-tool');
        }
      }

      const effectiveToolId = metadataTargetToolId || requestedToolId;
      const selectedToolIds = resolveToolUnlockSelection(effectiveToolId);

      /**
       * SECURITY CRITICAL:
       * Entitlements must be granted only by backend-controlled writes after
       * successful code verification. Client-side writes would allow bypassing
       * expiry/revocation/usage constraints and would corrupt source-of-truth
       * provenance between code, payment, and manual-admin sources.
       */
      const grantResults = await Promise.all(
        selectedToolIds.map((toolId) =>
          grantToolEntitlement(db, {
            userId: decodedToken.uid,
            toolId,
            source: 'code',
            referenceId: redeemedCode.id,
          })
        )
      );

      const unlockedToolIds = Array.from(new Set(grantResults.flatMap((result) => result.unlockedTools)));
      const unlockedPageIds = Array.from(new Set(grantResults.flatMap((result) => result.unlockedPages)));

      try {
        await communicationService.dispatchInternalMessage({
          userId: decodedToken.uid,
          type: 'notification',
          purpose: 'tool-unlock',
          title: 'Tool Unlocked',
          message: `Access granted: ${unlockedToolIds.join(', ') || requestedToolId}`,
          code: redeemedCode.codeValue,
          notes: 'source:code-redemption',
        });
      } catch (notificationError) {
        logDiagnostic('warn', 'tool_unlock.code_notification_failed', {
          area: 'entitlements',
          stage: 'api/unlocks/redeem-tool-code',
          userId: decodedToken.uid,
          details: normalizeError(notificationError),
        });
      }

      res.json({
        success: true,
        unlockedToolIds,
        unlockedPageIds,
        codeId: redeemedCode.id,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, error: normalizeOptionalString(error?.message) || 'tool-unlock-failed' });
    }
  });

  app.post('/api/unlocks/redeem-model-code', async (req, res) => {
    try {
      const idToken = req.headers.authorization?.split('Bearer ')[1];
      if (!idToken) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const codeValue = normalizeRequiredString(req.body?.codeValue, 'codeValue');
      const requestedModelId = toCanonicalModelId(normalizeRequiredString(req.body?.modelId, 'modelId'));

      const redeemedCode = await codeService.verifyAndRedeem(
        codeValue,
        decodedToken.uid,
        decodedToken.email || '',
        'model-unlock'
      );

      const rawTargetId = normalizeOptionalString((redeemedCode as any)?.metadata?.targetId);
      const targetId = rawTargetId && rawTargetId !== 'all' ? toCanonicalModelId(rawTargetId) : rawTargetId;
      if (targetId && targetId !== 'all' && targetId !== requestedModelId) {
        throw new Error('wrong-model');
      }

      const grant = await grantModelEntitlement(db, {
        userId: decodedToken.uid,
        modelId: requestedModelId,
        source: 'code',
        referenceId: redeemedCode.id,
      });

      try {
        await communicationService.dispatchInternalMessage({
          userId: decodedToken.uid,
          type: 'notification',
          purpose: 'model-unlock',
          title: 'Model Unlocked',
          message: `Access granted to model: ${requestedModelId}`,
          code: redeemedCode.codeValue,
          notes: `source:code-redemption;model:${requestedModelId}`,
        });
      } catch (notificationError) {
        logDiagnostic('warn', 'model_unlock.code_notification_failed', {
          area: 'entitlements',
          stage: 'api/unlocks/redeem-model-code',
          userId: decodedToken.uid,
          details: normalizeError(notificationError),
        });
      }

      res.json({ success: true, codeId: redeemedCode.id, modelId: requestedModelId, grant });
    } catch (error: any) {
      res.status(400).json({ success: false, error: normalizeOptionalString(error?.message) || 'model-unlock-failed' });
    }
  });

  app.post('/api/unlocks/redeem-page-code', async (req, res) => {
    try {
      const idToken = req.headers.authorization?.split('Bearer ')[1];
      if (!idToken) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const codeValue = normalizeRequiredString(req.body?.codeValue, 'codeValue');
      const pageId = normalizeRequiredString(req.body?.pageId, 'pageId');
      const requestedPurpose = normalizeRequiredString(req.body?.purpose, 'purpose');

      const allowedPurposes = new Set(['tool-unlock', 'chat-unlock', 'secrets-access']);
      if (!allowedPurposes.has(requestedPurpose)) {
        return res.status(400).json({ success: false, error: 'invalid-purpose' });
      }

      const redeemedCode = await codeService.verifyAndRedeem(
        codeValue,
        decodedToken.uid,
        decodedToken.email || '',
        requestedPurpose
      );

      const targetId = normalizeOptionalString((redeemedCode as any)?.metadata?.targetId);
      if (targetId && targetId !== 'all' && targetId !== pageId) {
        throw new Error('wrong-page');
      }

      await db.collection(COLLECTIONS.USERS).doc(decodedToken.uid).set({
        unlockedPages: admin.firestore.FieldValue.arrayUnion(pageId),
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      res.json({ success: true, codeId: redeemedCode.id, pageId });
    } catch (error: any) {
      res.status(400).json({ success: false, error: normalizeOptionalString(error?.message) || 'page-unlock-failed' });
    }
  });

  // Code Management Endpoints
  app.get("/api/admin/codes", adminMiddleware, async (req, res) => {
    try {
      const codes = await codeService.listCodes();
      res.json({ success: true, codes });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.put("/api/admin/codes/:id/status", adminMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const normalizedId = normalizeRequiredString(id, 'id');
      const normalizedStatus = normalizeRequiredString(status, 'status') as any;
      await codeService.updateCodeStatus(normalizedId, normalizedStatus, (req as any).userContext.uid);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/admin/tool-entitlements', adminMiddleware, async (req, res) => {
    try {
      const userId = normalizeOptionalString(req.query.userId);
      const includeEvents = String(req.query.includeEvents || '').toLowerCase() === 'true';
      const limitRaw = Number(req.query.limit);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.floor(limitRaw))) : 100;

      let entitlementQuery: FirebaseFirestore.Query = db
        .collection(COLLECTIONS.TOOL_ENTITLEMENTS)
        .orderBy('updatedAt', 'desc')
        .limit(limit);

      if (userId) {
        entitlementQuery = entitlementQuery.where('userId', '==', userId);
      }

      const entitlementSnap = await entitlementQuery.get();
      const entitlements = entitlementSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));

      let events: any[] = [];
      if (includeEvents) {
        let eventQuery: FirebaseFirestore.Query = db
          .collection(COLLECTIONS.TOOL_ENTITLEMENT_EVENTS)
          .orderBy('createdAt', 'desc')
          .limit(limit);
        if (userId) {
          eventQuery = eventQuery.where('userId', '==', userId);
        }
        const eventSnap = await eventQuery.get();
        events = eventSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
      }

      res.json({ success: true, entitlements, events });
    } catch (error: any) {
      res.status(500).json({ success: false, error: normalizeOptionalString(error?.message) || 'failed-to-fetch-tool-entitlements' });
    }
  });

  app.post('/api/admin/tool-entitlements/grant', adminMiddleware, async (req, res) => {
    try {
      const userId = normalizeRequiredString(req.body?.userId, 'userId');
      const toolId = normalizeRequiredString(req.body?.toolId, 'toolId');
      const reason = normalizeOptionalString(req.body?.reason);

      if (!isToolUnlockEligible(toolId)) {
        return res.status(400).json({ success: false, error: 'invalid-tool-id' });
      }

      const grant = await grantToolEntitlement(db, {
        userId,
        toolId,
        source: 'admin',
        actorUserId: (req as any).userContext.uid,
        reason,
      });

      await db.collection('activities').add({
        userId: (req as any).userContext.uid,
        type: 'admin_action',
        description: `Granted ${toolId} entitlement to ${userId}`,
        timestamp: new Date().toISOString(),
        status: 'success',
        metadata: {
          source: 'admin_override',
          toolId,
          targetUserId: userId,
          reason: reason || null,
          eventId: grant.eventId,
        },
      });

      try {
        await communicationService.dispatchInternalMessage({
          userId,
          type: 'notification',
          purpose: 'tool-unlock',
          title: 'Tool Unlocked',
          message: `Admin granted access to tool: ${toolId}`,
          notes: `source:admin-grant;reason:${reason || 'none'}`,
        });
      } catch (notificationError) {
        logDiagnostic('warn', 'tool_unlock.admin_grant_notification_failed', {
          area: 'entitlements',
          stage: 'api/admin/tool-entitlements/grant',
          userId,
          details: normalizeError(notificationError),
        });
      }

      res.json({ success: true, grant });
    } catch (error: any) {
      res.status(400).json({ success: false, error: normalizeOptionalString(error?.message) || 'failed-to-grant-tool-entitlement' });
    }
  });

  app.post('/api/admin/tool-entitlements/revoke', adminMiddleware, async (req, res) => {
    try {
      const userId = normalizeRequiredString(req.body?.userId, 'userId');
      const toolId = normalizeRequiredString(req.body?.toolId, 'toolId');
      const reason = normalizeOptionalString(req.body?.reason);

      if (!isToolUnlockEligible(toolId)) {
        return res.status(400).json({ success: false, error: 'invalid-tool-id' });
      }

      /**
       * SAFETY NOTE:
       * Manual admin override is a distinct entitlement source. Do not merge
       * this flow with payment/code processors; keeping source boundaries
       * explicit is required for auditability and incident forensics.
       */
      const revoke = await revokeToolEntitlement(db, {
        userId,
        toolId,
        actorUserId: (req as any).userContext.uid,
        reason,
      });

      await db.collection('activities').add({
        userId: (req as any).userContext.uid,
        type: 'admin_action',
        description: `Revoked ${toolId} entitlement from ${userId}`,
        timestamp: new Date().toISOString(),
        status: 'success',
        metadata: {
          source: 'admin_override',
          toolId,
          targetUserId: userId,
          reason: reason || null,
          eventId: revoke.eventId,
        },
      });

      try {
        await communicationService.dispatchInternalMessage({
          userId,
          type: 'notification',
          purpose: 'tool-unlock',
          title: 'Access Revoked',
          message: `Admin revoked access to tool: ${toolId}`,
          notes: `source:admin-revoke;reason:${reason || 'none'}`,
        });
      } catch (notificationError) {
        logDiagnostic('warn', 'tool_unlock.admin_revoke_notification_failed', {
          area: 'entitlements',
          stage: 'api/admin/tool-entitlements/revoke',
          userId,
          details: normalizeError(notificationError),
        });
      }

      res.json({ success: true, revoke });
    } catch (error: any) {
      res.status(400).json({ success: false, error: normalizeOptionalString(error?.message) || 'failed-to-revoke-tool-entitlement' });
    }
  });

  app.get('/api/admin/model-entitlements', adminMiddleware, async (req, res) => {
    try {
      const userId = normalizeOptionalString(req.query.userId);
      const modelId = normalizeOptionalString(req.query.modelId);
      const includeEvents = String(req.query.includeEvents || '').toLowerCase() === 'true';
      const limitRaw = Number(req.query.limit);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.floor(limitRaw))) : 100;

      let entitlementQuery: FirebaseFirestore.Query = db
        .collection(COLLECTIONS.MODEL_ENTITLEMENTS)
        .orderBy('updatedAt', 'desc')
        .limit(limit);

      if (userId) {
        entitlementQuery = entitlementQuery.where('userId', '==', userId);
      }
      if (modelId) {
        entitlementQuery = entitlementQuery.where('modelId', '==', toCanonicalModelId(modelId));
      }

      const entitlementSnap = await entitlementQuery.get();
      const entitlements = entitlementSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));

      let events: any[] = [];
      if (includeEvents) {
        let eventQuery: FirebaseFirestore.Query = db
          .collection(COLLECTIONS.MODEL_ENTITLEMENT_EVENTS)
          .orderBy('createdAt', 'desc')
          .limit(limit);

        if (userId) {
          eventQuery = eventQuery.where('userId', '==', userId);
        }
        if (modelId) {
          eventQuery = eventQuery.where('modelId', '==', toCanonicalModelId(modelId));
        }

        const eventSnap = await eventQuery.get();
        events = eventSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
      }

      res.json({ success: true, entitlements, events });
    } catch (error: any) {
      res.status(500).json({ success: false, error: normalizeOptionalString(error?.message) || 'failed-to-fetch-model-entitlements' });
    }
  });

  app.post('/api/admin/model-entitlements/grant', adminMiddleware, async (req, res) => {
    try {
      const userId = normalizeRequiredString(req.body?.userId, 'userId');
      const modelId = toCanonicalModelId(normalizeRequiredString(req.body?.modelId, 'modelId'));
      const reason = normalizeOptionalString(req.body?.reason);

      if (!getModelByAnyId(modelId)) {
        return res.status(400).json({ success: false, error: 'invalid-model-id' });
      }

      const grant = await grantModelEntitlement(db, {
        userId,
        modelId,
        source: 'admin',
        actorUserId: (req as any).userContext.uid,
        reason,
      });

      await db.collection('activities').add({
        userId: (req as any).userContext.uid,
        type: 'admin_action',
        description: `Granted ${modelId} model entitlement to ${userId}`,
        timestamp: new Date().toISOString(),
        status: 'success',
        metadata: {
          source: 'admin_override',
          modelId,
          targetUserId: userId,
          reason: reason || null,
          eventId: grant.eventId,
        },
      });

      try {
        await communicationService.dispatchInternalMessage({
          userId,
          type: 'notification',
          purpose: 'model-unlock',
          title: 'Model Unlocked',
          message: `Admin granted access to model: ${modelId}`,
          notes: `source:admin-grant;reason:${reason || 'none'};model:${modelId}`,
        });
      } catch (notificationError) {
        logDiagnostic('warn', 'model_unlock.admin_grant_notification_failed', {
          area: 'entitlements',
          stage: 'api/admin/model-entitlements/grant',
          userId,
          details: normalizeError(notificationError),
        });
      }

      res.json({ success: true, grant });
    } catch (error: any) {
      res.status(400).json({ success: false, error: normalizeOptionalString(error?.message) || 'failed-to-grant-model-entitlement' });
    }
  });

  app.post('/api/admin/model-entitlements/revoke', adminMiddleware, async (req, res) => {
    try {
      const userId = normalizeRequiredString(req.body?.userId, 'userId');
      const modelId = toCanonicalModelId(normalizeRequiredString(req.body?.modelId, 'modelId'));
      const reason = normalizeOptionalString(req.body?.reason);

      if (!getModelByAnyId(modelId)) {
        return res.status(400).json({ success: false, error: 'invalid-model-id' });
      }

      const revoke = await revokeModelEntitlement(db, {
        userId,
        modelId,
        actorUserId: (req as any).userContext.uid,
        reason,
      });

      await db.collection('activities').add({
        userId: (req as any).userContext.uid,
        type: 'admin_action',
        description: `Revoked ${modelId} model entitlement from ${userId}`,
        timestamp: new Date().toISOString(),
        status: 'success',
        metadata: {
          source: 'admin_override',
          modelId,
          targetUserId: userId,
          reason: reason || null,
          eventId: revoke.eventId,
        },
      });

      try {
        await communicationService.dispatchInternalMessage({
          userId,
          type: 'notification',
          purpose: 'model-unlock',
          title: 'Model Access Revoked',
          message: `Admin revoked access to model: ${modelId}`,
          notes: `source:admin-revoke;reason:${reason || 'none'};model:${modelId}`,
        });
      } catch (notificationError) {
        logDiagnostic('warn', 'model_unlock.admin_revoke_notification_failed', {
          area: 'entitlements',
          stage: 'api/admin/model-entitlements/revoke',
          userId,
          details: normalizeError(notificationError),
        });
      }

      res.json({ success: true, revoke });
    } catch (error: any) {
      res.status(400).json({ success: false, error: normalizeOptionalString(error?.message) || 'failed-to-revoke-model-entitlement' });
    }
  });

  // Admin Monitoring Endpoints
  app.get('/api/admin/monitoring/history', adminMiddleware, async (req, res) => {
    try {
      const provider = req.query.provider as string;
      const history = await getProviderUsageHistory(db, provider);
      res.json({ success: true, history });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch history' });
    }
  });

  app.get('/api/admin/monitoring/aggregated', adminMiddleware, async (req, res) => {
    try {
      const aggregated = await getAggregatedUsage(db);
      res.json({ success: true, aggregated });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch aggregated usage' });
    }
  });

  app.get('/api/admin/fast-access/credit-events', adminMiddleware, async (req, res) => {
    try {
      const userIdFilter = normalizeOptionalString(req.query.userId);
      const toolIdFilter = normalizeOptionalString(req.query.toolId);
      const statusFilter = normalizeOptionalString(req.query.status);
      const fromDateFilter = normalizeOptionalString(req.query.fromDate);
      const toDateFilter = normalizeOptionalString(req.query.toDate);
      const limitRaw = Number(req.query.limit);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.floor(limitRaw))) : 80;

      let fromIso: string | undefined;
      let toIso: string | undefined;

      if (fromDateFilter) {
        const fromDate = new Date(`${fromDateFilter}T00:00:00.000Z`);
        if (Number.isNaN(fromDate.getTime())) {
          return res.status(400).json({ success: false, error: 'fromDate must be a valid date (YYYY-MM-DD)' });
        }
        fromIso = fromDate.toISOString();
      }

      if (toDateFilter) {
        const toDate = new Date(`${toDateFilter}T23:59:59.999Z`);
        if (Number.isNaN(toDate.getTime())) {
          return res.status(400).json({ success: false, error: 'toDate must be a valid date (YYYY-MM-DD)' });
        }
        toIso = toDate.toISOString();
      }

      if (fromIso && toIso && fromIso > toIso) {
        return res.status(400).json({ success: false, error: 'fromDate cannot be later than toDate' });
      }

      let query: FirebaseFirestore.Query = db
        .collection(COLLECTIONS.FACULTY_FAST_ACCESS_CREDIT_EVENTS)
        .orderBy('createdAt', 'desc')
        .limit(limit);

      if (fromIso) {
        query = query.where('createdAt', '>=', fromIso);
      }
      if (toIso) {
        query = query.where('createdAt', '<=', toIso);
      }

      if (userIdFilter) {
        query = query.where('userId', '==', userIdFilter);
      }
      if (toolIdFilter) {
        query = query.where('toolId', '==', toolIdFilter);
      }
      if (statusFilter) {
        query = query.where('status', '==', statusFilter);
      }

      const snapshot = await query.get();
      const events = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() || {}),
      }));

      res.json({
        success: true,
        events,
        count: events.length,
        filters: {
          userId: userIdFilter || null,
          toolId: toolIdFilter || null,
          status: statusFilter || null,
          fromDate: fromDateFilter || null,
          toDate: toDateFilter || null,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: normalizeOptionalString(error?.message) || 'Failed to fetch fast-access credit events',
      });
    }
  });

  app.get('/api/admin/credits/events', adminMiddleware, async (req, res) => {
    try {
      const userIdFilter = normalizeOptionalString(req.query.userId);
      const toolIdFilter = normalizeOptionalString(req.query.toolId);
      const statusFilter = normalizeOptionalString(req.query.status);
      const fromDateFilter = normalizeOptionalString(req.query.fromDate);
      const toDateFilter = normalizeOptionalString(req.query.toDate);
      const limitRaw = Number(req.query.limit);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.floor(limitRaw))) : 80;

      let fromIso: string | undefined;
      let toIso: string | undefined;

      if (fromDateFilter) {
        const fromDate = new Date(`${fromDateFilter}T00:00:00.000Z`);
        if (Number.isNaN(fromDate.getTime())) {
          return res.status(400).json({ success: false, error: 'fromDate must be a valid date (YYYY-MM-DD)' });
        }
        fromIso = fromDate.toISOString();
      }

      if (toDateFilter) {
        const toDate = new Date(`${toDateFilter}T23:59:59.999Z`);
        if (Number.isNaN(toDate.getTime())) {
          return res.status(400).json({ success: false, error: 'toDate must be a valid date (YYYY-MM-DD)' });
        }
        toIso = toDate.toISOString();
      }

      if (fromIso && toIso && fromIso > toIso) {
        return res.status(400).json({ success: false, error: 'fromDate cannot be later than toDate' });
      }

      let query: FirebaseFirestore.Query = db
        .collection(COLLECTIONS.USER_CREDIT_EVENTS)
        .orderBy('createdAt', 'desc')
        .limit(limit);

      if (fromIso) {
        query = query.where('createdAt', '>=', fromIso);
      }
      if (toIso) {
        query = query.where('createdAt', '<=', toIso);
      }

      if (userIdFilter) {
        query = query.where('userId', '==', userIdFilter);
      }
      if (toolIdFilter) {
        query = query.where('toolId', '==', toolIdFilter);
      }
      if (statusFilter) {
        query = query.where('status', '==', statusFilter);
      }

      const snapshot = await query.get();
      const events = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() || {}),
      }));

      res.json({
        success: true,
        events,
        count: events.length,
        filters: {
          userId: userIdFilter || null,
          toolId: toolIdFilter || null,
          status: statusFilter || null,
          fromDate: fromDateFilter || null,
          toDate: toDateFilter || null,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: normalizeOptionalString(error?.message) || 'Failed to fetch standard credit events',
      });
    }
  });

  app.get('/api/admin/fast-access/accounts', adminMiddleware, async (req, res) => {
    /**
     * ARCHITECTURE GUARD (Temporary Account Isolation)
     * ------------------------------------------------------------------
     * These endpoints intentionally manage only Faculty temporary accounts.
     * Do not merge this path into generic full-user CRUD without explicit
     * migration rules, because credits, lifecycle, and auth semantics differ.
     */
    try {
      const search = normalizeOptionalString(req.query.search)?.toLowerCase();
      const statusFilter = normalizeOptionalString(req.query.status)?.toLowerCase();
      const limitRaw = Number(req.query.limit);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.floor(limitRaw))) : 120;

      if (statusFilter && statusFilter !== 'all' && !ALLOWED_FAST_ACCESS_ADMIN_STATUSES.has(statusFilter)) {
        return res.status(400).json({ success: false, error: 'status must be one of: all, active, disabled, deleted' });
      }

      let accounts: any[] = [];

      if (statusFilter === 'deleted') {
        const auditSnapshot = await db
          .collection(COLLECTIONS.FACULTY_FAST_ACCESS_DELETION_AUDITS)
          .limit(limit)
          .get();

        accounts = auditSnapshot.docs
          .map((docSnap) => buildFastAccessDeletedAuditListEntry(docSnap.id, (docSnap.data() || {}) as Record<string, unknown>))
          .filter((entry) => {
            if (!search) return true;
            return [
              entry.name,
              entry.email,
              entry.username,
              entry.phoneNumber,
              entry.universityCode,
            ].some((field) => String(field || '').toLowerCase().includes(search));
          })
          .sort((a, b) => String(b.deletedAt || b.updatedAt || '').localeCompare(String(a.deletedAt || a.updatedAt || '')));
      } else {
        const usersSnapshot = await db
          .collection(COLLECTIONS.USERS)
          .where('accountScope', '==', FACULTY_FAST_ACCESS_SCOPE)
          .limit(limit)
          .get();

        const userDocs = usersSnapshot.docs;
        const tempDocs = await Promise.all(
          userDocs.map((docSnap) => db.collection(COLLECTIONS.FACULTY_FAST_ACCESS_ACCOUNTS).doc(docSnap.id).get())
        );

        const tempById = new Map<string, FirebaseFirestore.DocumentData | undefined>();
        tempDocs.forEach((tempDoc) => {
          tempById.set(tempDoc.id, tempDoc.exists ? tempDoc.data() : undefined);
        });

        accounts = userDocs
          .map((docSnap) => {
            const userData = (docSnap.data() || {}) as Record<string, unknown>;
            const tempData = (tempById.get(docSnap.id) || {}) as Record<string, unknown>;
            return buildFastAccessLiveAccountListEntry(docSnap.id, userData, tempData);
          })
          .filter((entry) => {
            if (statusFilter && statusFilter !== 'all' && entry.status !== statusFilter) {
              return false;
            }
            if (!search) return true;
            return [
              entry.name,
              entry.email,
              entry.username,
              entry.phoneNumber,
              entry.universityCode,
            ].some((field) => String(field || '').toLowerCase().includes(search));
          })
          .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
      }

      res.json({ success: true, accounts, count: accounts.length });
    } catch (error: any) {
      res.status(500).json({ success: false, error: normalizeOptionalString(error?.message) || 'Failed to fetch fast-access accounts' });
    }
  });

  app.post('/api/admin/fast-access/accounts', adminMiddleware, async (req, res) => {
    /**
     * ARCHITECTURE GUARD (Temporary Account Isolation)
     * ------------------------------------------------------------------
     * Admin-created temporary accounts are intentionally phone-first and
     * temporary-scoped. Do not repurpose this route for full-account onboarding.
     */
    try {
      const requester = (req as any).userContext;
      const phoneNumber = normalizeE164Phone(req.body?.phoneNumber);
      const fullName = normalizeOptionalString(req.body?.fullName) || 'CU Science Student';
      const universityCode = normalizeOptionalString(req.body?.universityCode);
      const academicYear = normalizeOptionalString(req.body?.academicYear);
      const department = normalizeOptionalString(req.body?.department) || 'Faculty of Science';
      const initialCredits = req.body?.initialCredits === undefined
        ? FACULTY_FAST_ACCESS_INITIAL_CREDITS
        : normalizeFastAccessCredits(req.body?.initialCredits);

      try {
        const existingAuthUser = await admin.auth().getUserByPhoneNumber(phoneNumber);
        if (existingAuthUser?.uid) {
          return res.status(409).json({ success: false, error: 'Phone number is already linked to an existing account.' });
        }
      } catch (error: any) {
        if (error?.code !== 'auth/user-not-found') {
          throw error;
        }
      }

      const authUser = await admin.auth().createUser({
        phoneNumber,
        displayName: fullName,
        disabled: false,
      });

      const userId = authUser.uid;
      const nowIso = new Date().toISOString();
      const expiresAtIso = new Date(Date.now() + FACULTY_FAST_ACCESS_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
      const syntheticEmail = `temp-${userId}@fast-access.local`;
      const syntheticUsername = `temp_science_${userId.slice(0, 8)}`;

      const userPayload = {
        id: userId,
        name: fullName,
        email: syntheticEmail,
        username: syntheticUsername,
        usernameLower: syntheticUsername.toLowerCase(),
        role: 'User',
        plan: 'free',
        status: 'Active',
        firstLoginDate: nowIso,
        lastLogin: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
        authProviders: ['phone-fast-access', 'admin-provisioned-phone'],
        isVerified: true,
        permissions: {
          ...DEFAULT_USER_PERMISSIONS,
          accessPremiumTools: false,
          viewAdvancedVisuals: false,
        },
        limits: DEFAULT_USER_LIMITS,
        usage: {
          aiRequestsToday: 0,
          quizGenerationsToday: 0,
          uploadsToday: 0,
          lastResetDate: nowIso.split('T')[0],
        },
        credits: 0,
        fastAccessCredits: initialCredits,
        fastAccessCreditsUpdatedAt: nowIso,
        fastAccessCreditPolicy: {
          initialCredits,
          deductionPerSuccess: FACULTY_FAST_ACCESS_CREDIT_COST_PER_SUCCESS,
          provisionedByAdminAt: nowIso,
        },
        totalUploads: 0,
        totalAIRequests: 0,
        totalQuizzes: 0,
        institution: 'Cairo University',
        department,
        academicYear,
        universityCode,
        phoneNumber,
        isTemporaryAccess: true,
        temporaryAccessType: FACULTY_FAST_ACCESS_TYPE,
        temporaryAccessExpiresAt: expiresAtIso,
        accountScope: FACULTY_FAST_ACCESS_SCOPE,
        fastAccessMetadata: {
          institution: 'Cairo University',
          faculty: 'Faculty of Science',
          onboardingMethod: 'admin_provisioned_phone',
        },
        statusContext: {
          current: 'active',
          pendingReactivationNotice: false,
          lastStatusChangedAt: nowIso,
          lastStatusChangedBy: requester?.uid || null,
        },
      };

      const tempAccessPayload = {
        userId,
        phoneNumber,
        status: 'active',
        accountScope: FACULTY_FAST_ACCESS_SCOPE,
        temporaryAccessType: FACULTY_FAST_ACCESS_TYPE,
        institution: 'Cairo University',
        faculty: 'Faculty of Science',
        profile: {
          fullName,
          universityCode,
          department,
          academicYear,
        },
        authProvider: 'admin_provisioned_phone',
        otpVerifiedAt: null,
        fastAccessCredits: initialCredits,
        createdAt: nowIso,
        updatedAt: nowIso,
        expiresAt: expiresAtIso,
        profileCompletionStage: 'temporary_onboarding_complete',
        onboardingPath: 'admin_provisioned_phone',
        createdByAdminId: requester?.uid || null,
        adminControl: {
          internalNotes: '',
          lastStatusChangedAt: nowIso,
          lastStatusChangedBy: requester?.uid || null,
        },
      };

      await db.collection(COLLECTIONS.USERS).doc(userId).set(userPayload, { merge: true });
      await db.collection(COLLECTIONS.FACULTY_FAST_ACCESS_ACCOUNTS).doc(userId).set(tempAccessPayload, { merge: true });

      await admin.auth().setCustomUserClaims(userId, {
        role: 'User',
        accountScope: FACULTY_FAST_ACCESS_SCOPE,
        temporaryAccessType: FACULTY_FAST_ACCESS_TYPE,
        isTemporaryAccess: true,
      });

      await logAdminUserAction(db, requester.uid, 'Admin provisioned Faculty fast-access account', {
        targetUserId: userId,
        phoneNumber,
        initialCredits,
      });

      res.status(201).json({ success: true, account: userPayload });
    } catch (error: any) {
      res.status(500).json({ success: false, error: normalizeOptionalString(error?.message) || 'Failed to create fast-access account' });
    }
  });

  app.post('/api/admin/fast-access/accounts/:userId/status', adminMiddleware, async (req, res) => {
    try {
      const requester = (req as any).userContext;
      const userId = normalizeRequiredString(req.params.userId, 'userId');
      const requestedStatus = normalizeRequiredString(req.body?.status, 'status').toLowerCase();
      const reason = normalizeOptionalBoundedString(req.body?.reason, 500);
      const restorationMessage = normalizeOptionalBoundedString(req.body?.restorationMessage, 500);
      const internalNoteRaw = req.body?.internalNote;
      const internalNote = typeof internalNoteRaw === 'string' ? internalNoteRaw.trim().slice(0, 2000) : undefined;

      if (!ALLOWED_FAST_ACCESS_ADMIN_STATUSES.has(requestedStatus)) {
        return res.status(400).json({ success: false, error: 'status must be one of: active, disabled, deleted' });
      }

      if (requestedStatus === 'disabled' && !reason) {
        return res.status(400).json({ success: false, error: 'Suspension reason is required when disabling a fast-access account.' });
      }

      const userRef = db.collection(COLLECTIONS.USERS).doc(userId);
      const tempRef = db.collection(COLLECTIONS.FACULTY_FAST_ACCESS_ACCOUNTS).doc(userId);
      const [userSnap, tempSnap] = await Promise.all([userRef.get(), tempRef.get()]);

      if (!userSnap.exists) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      const userData = (userSnap.data() || {}) as Record<string, unknown>;
      if (!isFacultyFastAccessScopedUser(userData)) {
        return res.status(409).json({ success: false, error: 'Target account is not a Faculty fast-access account.' });
      }

      const tempData = (tempSnap.data() || {}) as Record<string, unknown>;

      if (requestedStatus === 'deleted') {
        const deletionReason = reason || 'Fast-access account deleted by administrator.';
        const deletionResult = await archiveAndDeleteFastAccessAccount({
          userId,
          requester,
          userData,
          tempData,
          reason: deletionReason,
          internalNote,
          source: 'status-route',
        });

        await logAdminUserAction(db, requester.uid, 'Admin deleted fast-access account via status endpoint', {
          targetUserId: userId,
          status: requestedStatus,
          reason: deletionReason,
          auditId: deletionResult.auditId,
        });

        return res.json({
          success: true,
          status: requestedStatus,
          auditId: deletionResult.auditId,
          deletedAt: deletionResult.deletedAt,
          releasedForReRegistration: true,
        });
      }

      const nowIso = new Date().toISOString();
      const nextUserStatus = requestedStatus === 'active' ? 'Active' : 'Suspended';
      const shouldDisableAuth = false;

      const userUpdate: Record<string, unknown> = {
        status: nextUserStatus,
        isDeleted: false,
        deletedAt: admin.firestore.FieldValue.delete(),
        deletedBy: admin.firestore.FieldValue.delete(),
        updatedAt: nowIso,
        'statusContext.current': requestedStatus,
        'statusContext.lastStatusChangedAt': nowIso,
        'statusContext.lastStatusChangedBy': requester.uid,
      };

      const tempUpdate: Record<string, unknown> = {
        status: requestedStatus,
        updatedAt: nowIso,
        deletedAt: requestedStatus === 'deleted' ? nowIso : admin.firestore.FieldValue.delete(),
        'adminControl.lastStatusChangedAt': nowIso,
        'adminControl.lastStatusChangedBy': requester.uid,
      };

      if (requestedStatus === 'disabled') {
        const suspendedMessage = reason || 'Your temporary access account has been suspended by an administrator.';
        userUpdate.statusMessage = suspendedMessage;
        userUpdate['statusContext.suspensionReason'] = suspendedMessage;
        userUpdate['statusContext.suspendedAt'] = nowIso;
        userUpdate['statusContext.suspendedBy'] = requester.uid;
        userUpdate['statusContext.pendingReactivationNotice'] = false;
        userUpdate['statusContext.reactivationMessage'] = admin.firestore.FieldValue.delete();
        tempUpdate['adminControl.lastStatusReason'] = suspendedMessage;
      }

      if (requestedStatus === 'active') {
        const reactivation = restorationMessage || 'Your account has been reactivated. You can access your tools again.';
        userUpdate.statusMessage = admin.firestore.FieldValue.delete();
        userUpdate['statusContext.reactivatedAt'] = nowIso;
        userUpdate['statusContext.reactivatedBy'] = requester.uid;
        userUpdate['statusContext.reactivationMessage'] = reactivation;
        userUpdate['statusContext.pendingReactivationNotice'] = true;
        tempUpdate['adminControl.lastRestorationMessage'] = reactivation;
      }

      if (internalNote !== undefined) {
        tempUpdate['adminControl.internalNotes'] = internalNote || admin.firestore.FieldValue.delete();
      }

      await userRef.set(userUpdate, { merge: true });

      await tempRef.set(tempUpdate, { merge: true });

      await admin.auth().updateUser(userId, { disabled: shouldDisableAuth }).catch((error: any) => {
        if (requestedStatus === 'deleted' && error?.code === 'auth/user-not-found') {
          return;
        }
        throw error;
      });

      await logAdminUserAction(db, requester.uid, 'Admin changed fast-access account status', {
        targetUserId: userId,
        status: requestedStatus,
        reason: reason || null,
        restorationMessage: restorationMessage || null,
        tempRecordExists: tempSnap.exists,
      });

      res.json({ success: true, status: requestedStatus });
    } catch (error: any) {
      res.status(500).json({ success: false, error: normalizeOptionalString(error?.message) || 'Failed to update fast-access account status' });
    }
  });

  app.patch('/api/admin/fast-access/accounts/:userId', adminMiddleware, async (req, res) => {
    try {
      const requester = (req as any).userContext;
      const userId = normalizeRequiredString(req.params.userId, 'userId');
      const fullName = normalizeOptionalBoundedString(req.body?.fullName, 120);
      const department = normalizeOptionalBoundedString(req.body?.department, 120);
      const universityCodeRaw = normalizeOptionalString(req.body?.universityCode);
      const academicYearRaw = normalizeOptionalString(req.body?.academicYear);
      const internalNotesRaw = req.body?.internalNotes;
      const expiresAtRaw = normalizeOptionalIsoDate(req.body?.temporaryAccessExpiresAt, 'temporaryAccessExpiresAt');
      const fastAccessCreditsRaw = req.body?.fastAccessCredits;
      const fastAccessCredits = fastAccessCreditsRaw === undefined ? undefined : normalizeFastAccessCredits(fastAccessCreditsRaw);

      const userRef = db.collection(COLLECTIONS.USERS).doc(userId);
      const tempRef = db.collection(COLLECTIONS.FACULTY_FAST_ACCESS_ACCOUNTS).doc(userId);
      const [userSnap, tempSnap] = await Promise.all([userRef.get(), tempRef.get()]);

      if (!userSnap.exists) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      const userData = (userSnap.data() || {}) as Record<string, unknown>;
      const tempData = (tempSnap.data() || {}) as Record<string, unknown>;
      const tempProfile = ((tempData.profile || {}) as Record<string, unknown>);

      if (!isFacultyFastAccessScopedUser(userData)) {
        return res.status(409).json({ success: false, error: 'Target account is not a Faculty fast-access account.' });
      }

      const mergedUniversityCode = (universityCodeRaw || String(userData.universityCode || tempProfile.universityCode || '')).replace(/\D/g, '');
      const mergedAcademicYearRaw = academicYearRaw || String(userData.academicYear || tempProfile.academicYear || '');
      const mergedAcademicYear = mergedAcademicYearRaw ? Number.parseInt(mergedAcademicYearRaw, 10) : undefined;

      if (mergedUniversityCode && !/^\d{7}$/.test(mergedUniversityCode)) {
        return res.status(400).json({ success: false, error: 'universityCode must be exactly 7 digits.' });
      }

      if (mergedAcademicYear !== undefined) {
        if (!Number.isInteger(mergedAcademicYear) || mergedAcademicYear < FACULTY_FAST_ACCESS_BATCH_YEAR_MIN || mergedAcademicYear > FACULTY_FAST_ACCESS_BATCH_YEAR_MAX) {
          return res.status(400).json({ success: false, error: `academicYear must be between ${FACULTY_FAST_ACCESS_BATCH_YEAR_MIN} and ${FACULTY_FAST_ACCESS_BATCH_YEAR_MAX}` });
        }
        if (mergedUniversityCode) {
          const expectedPrefix = String(mergedAcademicYear).slice(-2);
          if (!mergedUniversityCode.startsWith(expectedPrefix)) {
            return res.status(400).json({ success: false, error: `universityCode must start with ${expectedPrefix} for academicYear ${mergedAcademicYear}` });
          }
        }
      }

      const nowIso = new Date().toISOString();
      const userUpdate: Record<string, unknown> = {
        updatedAt: nowIso,
      };
      const tempUpdate: Record<string, unknown> = {
        updatedAt: nowIso,
        'adminControl.profileUpdatedAt': nowIso,
        'adminControl.profileUpdatedBy': requester.uid,
      };

      if (fullName) {
        userUpdate.name = fullName;
        tempUpdate['profile.fullName'] = fullName;
      }
      if (department) {
        userUpdate.department = department;
        tempUpdate['profile.department'] = department;
      }
      if (universityCodeRaw !== undefined) {
        userUpdate.universityCode = mergedUniversityCode || admin.firestore.FieldValue.delete();
        tempUpdate['profile.universityCode'] = mergedUniversityCode || admin.firestore.FieldValue.delete();
      }
      if (academicYearRaw !== undefined) {
        const normalizedAcademicYear = mergedAcademicYear ? String(mergedAcademicYear) : undefined;
        userUpdate.academicYear = normalizedAcademicYear || admin.firestore.FieldValue.delete();
        tempUpdate['profile.academicYear'] = normalizedAcademicYear || admin.firestore.FieldValue.delete();
      }
      if (fastAccessCredits !== undefined) {
        userUpdate.fastAccessCredits = fastAccessCredits;
        userUpdate.fastAccessCreditsUpdatedAt = nowIso;
        tempUpdate.fastAccessCredits = fastAccessCredits;
      }
      if (expiresAtRaw !== undefined) {
        userUpdate.temporaryAccessExpiresAt = expiresAtRaw;
        tempUpdate.expiresAt = expiresAtRaw;
      }

      if (typeof internalNotesRaw === 'string') {
        const internalNotes = internalNotesRaw.trim().slice(0, 2000);
        tempUpdate['adminControl.internalNotes'] = internalNotes || admin.firestore.FieldValue.delete();
      }

      await Promise.all([
        userRef.set(userUpdate, { merge: true }),
        tempRef.set(tempUpdate, { merge: true }),
      ]);

      await logAdminUserAction(db, requester.uid, 'Admin edited fast-access account profile', {
        targetUserId: userId,
        fields: Object.keys(req.body || {}),
      });

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, error: normalizeOptionalString(error?.message) || 'Failed to update fast-access account' });
    }
  });

  app.delete('/api/admin/fast-access/accounts/:userId', adminMiddleware, async (req, res) => {
    try {
      const requester = (req as any).userContext;
      const userId = normalizeRequiredString(req.params.userId, 'userId');
      const mode = normalizeOptionalString(req.query.mode);
      const reason = normalizeOptionalBoundedString(req.body?.reason, 500);
      const internalNoteRaw = req.body?.internalNote;
      const internalNote = typeof internalNoteRaw === 'string' ? internalNoteRaw.trim().slice(0, 2000) : undefined;

      const userRef = db.collection(COLLECTIONS.USERS).doc(userId);
      const tempRef = db.collection(COLLECTIONS.FACULTY_FAST_ACCESS_ACCOUNTS).doc(userId);
      const [userSnap, tempSnap] = await Promise.all([userRef.get(), tempRef.get()]);

      if (!userSnap.exists) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      const userData = (userSnap.data() || {}) as Record<string, unknown>;
      if (!isFacultyFastAccessScopedUser(userData)) {
        return res.status(409).json({ success: false, error: 'Target account is not a Faculty fast-access account.' });
      }

      const deletionResult = await archiveAndDeleteFastAccessAccount({
        userId,
        requester,
        userData,
        tempData: (tempSnap.data() || {}) as Record<string, unknown>,
        reason: reason || 'Fast-access account deleted by administrator.',
        internalNote,
        source: mode === 'hard' ? 'delete-endpoint-hard' : 'delete-endpoint',
      });

      await logAdminUserAction(db, requester.uid, 'Admin deleted fast-access account', {
        targetUserId: userId,
        requestedMode: mode || 'default',
        auditId: deletionResult.auditId,
        reason: reason || null,
      });

      res.json({
        success: true,
        mode: 'safe-delete',
        auditId: deletionResult.auditId,
        deletedAt: deletionResult.deletedAt,
        releasedForReRegistration: true,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: normalizeOptionalString(error?.message) || 'Failed to remove fast-access account' });
    }
  });

  // Check Username Availability Endpoint
  app.get("/api/check-username", async (req, res) => {
    const { username } = req.query;
    if (!username || typeof username !== 'string') {
      return res.status(400).json({ available: false, error: "Username is required" });
    }

    try {
      const db = getFirestore(admin.app(), "zootopiaclub");
      const usersRef = db.collection(COLLECTIONS.USERS);
      const snapshot = await usersRef.where('usernameLower', '==', username.toLowerCase()).get();
      
      if (snapshot.empty) {
        res.json({ available: true });
      } else {
        res.json({ available: false });
      }
    } catch (error: any) {
      console.error("Error checking username:", error);
      res.status(500).json({ available: false, error: error.message });
    }
  });

  // Resolve Username to Email Endpoint
  app.get("/api/resolve-username", async (req, res) => {
    const { username } = req.query;
    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: "Username is required" });
    }

    try {
      const db = getFirestore(admin.app(), "zootopiaclub");
      const usersRef = db.collection(COLLECTIONS.USERS);
      const snapshot = await usersRef.where('usernameLower', '==', username.toLowerCase()).get();
      
      if (snapshot.empty) {
        return res.status(404).json({ error: "Username not found" });
      } else {
        const userDoc = snapshot.docs[0].data();
        res.json({ email: userDoc.email });
      }
    } catch (error: any) {
      console.error("Error resolving username:", error);
      res.status(500).json({ error: error.message });
    }
  });

  const verifyFastAccessPhoneToken = async (idToken: string) => {
    const decodedToken = await admin.auth().verifyIdToken(idToken, true);
    const signInProvider = String(decodedToken.firebase?.sign_in_provider || '').toLowerCase();
    const phoneNumber = normalizeOptionalString(decodedToken.phone_number);

    if (signInProvider !== 'phone' || !phoneNumber) {
      throw new Error('Fast access requires verified Firebase phone OTP token.');
    }

    return {
      decodedToken,
      userId: decodedToken.uid,
      phoneNumber,
    };
  };

  const loadFastAccessIdentity = async (userId: string) => {
    const userRef = db.collection(COLLECTIONS.USERS).doc(userId);
    const tempAccessRef = db.collection(COLLECTIONS.FACULTY_FAST_ACCESS_ACCOUNTS).doc(userId);
    const [userSnap, tempSnap] = await Promise.all([userRef.get(), tempAccessRef.get()]);
    const userData = userSnap.exists ? (userSnap.data() || {}) as Record<string, unknown> : null;
    const tempData = tempSnap.exists ? (tempSnap.data() || {}) as Record<string, unknown> : null;
    const existingScope = String(userData?.accountScope || '');
    const existingTemporaryType = String(userData?.temporaryAccessType || '');
    const existingIsTemporary =
      Boolean(userData?.isTemporaryAccess) ||
      existingScope === FACULTY_FAST_ACCESS_SCOPE ||
      existingTemporaryType === FACULTY_FAST_ACCESS_TYPE;

    return {
      userRef,
      tempAccessRef,
      userSnap,
      tempSnap,
      userData,
      tempData,
      fastAccessExists: existingIsTemporary || tempSnap.exists,
      fullAccountExists: Boolean(userData) && !existingIsTemporary && existingScope !== FACULTY_FAST_ACCESS_SCOPE,
    };
  };

  const loadFastAccessIdentityByPhone = async (phoneNumber: string) => {
    const [userQuerySnap, tempQuerySnap] = await Promise.all([
      db.collection(COLLECTIONS.USERS).where('phoneNumber', '==', phoneNumber).limit(4).get(),
      db.collection(COLLECTIONS.FACULTY_FAST_ACCESS_ACCOUNTS).where('phoneNumber', '==', phoneNumber).limit(4).get(),
    ]);

    const userDocs = userQuerySnap.docs.map((docSnap) => ({
      id: docSnap.id,
      data: (docSnap.data() || {}) as Record<string, unknown>,
    }));
    const tempDocs = tempQuerySnap.docs.map((docSnap) => ({
      id: docSnap.id,
      data: (docSnap.data() || {}) as Record<string, unknown>,
    }));

    const temporaryUserDoc = userDocs.find((entry) => isFacultyFastAccessScopedUser(entry.data));
    const fullUserDoc = userDocs.find((entry) => !isFacultyFastAccessScopedUser(entry.data));
    const tempDoc = tempDocs.find((entry) => {
      const rawStatus = String(entry.data.status || '').trim().toLowerCase();
      return rawStatus !== 'deleted' && rawStatus !== 'converted';
    });

    return {
      fastAccessExists: Boolean(temporaryUserDoc) || Boolean(tempDoc),
      fullAccountExists: Boolean(fullUserDoc),
    };
  };

  const assertFastAccessAccountIsUsable = (userData: Record<string, unknown> | null) => {
    const existingStatus = normalizeUserStatusLabel(userData?.status);
    const existingStatusContext = (userData?.statusContext || {}) as Record<string, unknown>;

    if (existingStatus === 'suspended') {
      const reason = normalizeOptionalString(existingStatusContext.suspensionReason) || normalizeOptionalString(userData?.statusMessage);
      throw new Error(reason ? `Fast-access account is suspended: ${reason}` : 'Fast-access account is suspended. Contact platform administration.');
    }

    if (existingStatus === 'blocked' || existingStatus === 'rejected') {
      const reason = normalizeOptionalString(existingStatusContext.suspensionReason) || normalizeOptionalString(userData?.statusMessage);
      throw new Error(reason ? `Fast-access account is blocked: ${reason}` : 'Fast-access account is blocked. Contact platform administration.');
    }
  };

  const createFastAccessSessionPayload = async ({
    userId,
    phoneNumber,
    expiresAtIso,
    fastAccessCredits,
    profileCompletionStage,
  }: {
    userId: string;
    phoneNumber: string;
    expiresAtIso: string;
    fastAccessCredits: number;
    profileCompletionStage: 'pending_profile_completion' | 'temporary_onboarding_complete' | 'converted_to_full_account';
  }) => {
    const customToken = await admin.auth().createCustomToken(userId, {
      role: 'User',
      accountScope: FACULTY_FAST_ACCESS_SCOPE,
      temporaryAccessType: FACULTY_FAST_ACCESS_TYPE,
      isTemporaryAccess: true,
    });

    return {
      customToken,
      account: {
        uid: userId,
        phoneNumber,
        accountScope: FACULTY_FAST_ACCESS_SCOPE,
        isTemporaryAccess: true,
        temporaryAccessType: FACULTY_FAST_ACCESS_TYPE,
        temporaryAccessExpiresAt: expiresAtIso,
        fastAccessCredits,
        profileCompletionStage,
      },
    };
  };

  app.post('/api/auth/fast-access/faculty-science/preflight', async (req, res) => {
    /**
     * PREFLIGHT NOTE
     * ------------------------------------------------------------------
     * This is a UX-only lookup used to keep the phone-first entry flow smart
     * without weakening authentication. OTP is still required for both new and
     * existing phones before any session is granted.
     */
    const clientIp = getRequestIp(req);
    const ipKey = `ip:${clientIp}`;
    const ipLimit = checkFastAccessThrottle(ipKey);
    if (!ipLimit.allowed) {
      return res.status(429).json({
        success: false,
        error: ipLimit.message,
        retryAfterSeconds: ipLimit.retryAfterSeconds,
      });
    }

    try {
      const phoneNumber = normalizeE164Phone(req.body?.phoneNumber);
      const phoneKey = `phone:${phoneNumber}`;
      const phoneLimit = checkFastAccessThrottle(phoneKey);

      if (!phoneLimit.allowed) {
        return res.status(429).json({
          success: false,
          error: phoneLimit.message,
          retryAfterSeconds: phoneLimit.retryAfterSeconds,
        });
      }

      const identity = await loadFastAccessIdentityByPhone(phoneNumber);
      const accountState = identity.fullAccountExists
        ? 'full_account_exists'
        : identity.fastAccessExists
          ? 'fast_access_exists'
          : 'eligible_for_registration';

      recordFastAccessSuccess(ipKey);
      recordFastAccessSuccess(phoneKey);

      res.json({
        success: true,
        data: {
          phoneNumber,
          nextStep: 'otp_verification',
          accountState,
        },
      });
    } catch (error: any) {
      const message = normalizeOptionalString(error?.message) || 'Failed to prepare fast-access verification';
      recordFastAccessFailure(ipKey);
      res.status(400).json({ success: false, error: message });
    }
  });

  app.post('/api/auth/fast-access/faculty-science/status', async (req, res) => {
    /**
     * INTENT CHECK NOTE
     * ------------------------------------------------------------------
     * This route verifies the OTP-backed phone identity first, then tells the
     * client which flow is actually allowed for that phone:
     * - existing temporary account => login
     * - no temporary account => registration
     * - converted/full account => regular full login
     *
     * Keeping this server-authoritative prevents duplicate temporary accounts
     * and avoids UX guesswork on the client.
     */
    const clientIp = getRequestIp(req);
    const ipKey = `ip:${clientIp}`;
    const ipLimit = checkFastAccessThrottle(ipKey);
    if (!ipLimit.allowed) {
      return res.status(429).json({
        success: false,
        error: ipLimit.message,
        retryAfterSeconds: ipLimit.retryAfterSeconds,
      });
    }

    const throttleSuccessKeys = [ipKey];
    const throttleFailureKeys = [ipKey];

    try {
      const idToken = normalizeRequiredString(req.body?.idToken, 'idToken');
      const { userId, phoneNumber } = await verifyFastAccessPhoneToken(idToken);
      const userKey = `uid:${userId}`;
      const phoneKey = `phone:${phoneNumber}`;
      const userLimit = checkFastAccessThrottle(userKey);
      const phoneLimit = checkFastAccessThrottle(phoneKey);

      if (!userLimit.allowed || !phoneLimit.allowed) {
        const retryAfterSeconds = Math.max(userLimit.retryAfterSeconds, phoneLimit.retryAfterSeconds);
        const errorMessage = !userLimit.allowed ? userLimit.message : phoneLimit.message;
        return res.status(429).json({
          success: false,
          error: errorMessage,
          retryAfterSeconds,
        });
      }

      throttleSuccessKeys.push(userKey, phoneKey);
      throttleFailureKeys.push(userKey, phoneKey);

      const identity = await loadFastAccessIdentity(userId);

      if (identity.fastAccessExists && identity.userData) {
        assertFastAccessAccountIsUsable(identity.userData);
      }

      const fastAccessCredits = normalizeFastAccessCredits(
        identity.userData?.fastAccessCredits ?? identity.tempData?.fastAccessCredits
      );

      const responseState = identity.fullAccountExists
        ? {
            accountState: 'full_account_exists' as const,
            recommendedNextStep: 'full_login' as const,
          }
        : identity.fastAccessExists
          ? {
              accountState: 'fast_access_exists' as const,
              recommendedNextStep: 'login' as const,
            }
          : {
              accountState: 'eligible_for_registration' as const,
              recommendedNextStep: 'register' as const,
            };

      res.json({
        success: true,
        data: {
          phoneNumber,
          accountState: responseState.accountState,
          recommendedNextStep: responseState.recommendedNextStep,
          existingAccount: identity.fastAccessExists
            ? {
                uid: userId,
                fastAccessCredits,
                fullName: normalizeOptionalString(identity.userData?.name) || normalizeOptionalString((identity.tempData?.profile as Record<string, unknown> | undefined)?.fullName),
                universityCode:
                  normalizeOptionalString(identity.userData?.universityCode) ||
                  normalizeOptionalString((identity.tempData?.profile as Record<string, unknown> | undefined)?.universityCode),
              }
            : undefined,
        },
      });

      throttleSuccessKeys.forEach(recordFastAccessSuccess);
    } catch (error: any) {
      const message = normalizeOptionalString(error?.message) || 'Failed to determine fast-access phone status';
      const statusCode = message.includes('verified Firebase phone OTP token') ? 403 : 400;
      throttleFailureKeys.forEach(recordFastAccessFailure);
      res.status(statusCode).json({ success: false, error: message });
    }
  });

  app.post('/api/auth/fast-access/faculty-science/login', async (req, res) => {
    /**
     * LOGIN NOTE
     * ------------------------------------------------------------------
     * OTP proves phone ownership; this route then restores the existing
     * temporary Faculty account on the same identity without asking for a
     * password or re-running registration fields.
     */
    const clientIp = getRequestIp(req);
    const ipKey = `ip:${clientIp}`;
    const ipLimit = checkFastAccessThrottle(ipKey);
    if (!ipLimit.allowed) {
      return res.status(429).json({
        success: false,
        error: ipLimit.message,
        retryAfterSeconds: ipLimit.retryAfterSeconds,
      });
    }

    const throttleSuccessKeys = [ipKey];
    const throttleFailureKeys = [ipKey];

    try {
      const idToken = normalizeRequiredString(req.body?.idToken, 'idToken');
      const { userId, phoneNumber } = await verifyFastAccessPhoneToken(idToken);
      const userKey = `uid:${userId}`;
      const phoneKey = `phone:${phoneNumber}`;
      const userLimit = checkFastAccessThrottle(userKey);
      const phoneLimit = checkFastAccessThrottle(phoneKey);

      if (!userLimit.allowed || !phoneLimit.allowed) {
        const retryAfterSeconds = Math.max(userLimit.retryAfterSeconds, phoneLimit.retryAfterSeconds);
        const errorMessage = !userLimit.allowed ? userLimit.message : phoneLimit.message;
        return res.status(429).json({
          success: false,
          error: errorMessage,
          retryAfterSeconds,
        });
      }

      throttleSuccessKeys.push(userKey, phoneKey);
      throttleFailureKeys.push(userKey, phoneKey);

      const identity = await loadFastAccessIdentity(userId);
      if (identity.fullAccountExists) {
        return res.status(409).json({
          success: false,
          error: 'This phone is already attached to a full account. Use the regular login flow.',
        });
      }

      if (!identity.fastAccessExists) {
        return res.status(404).json({
          success: false,
          error: 'No Faculty Fast Access account was found for this phone number. Register first.',
        });
      }

      assertFastAccessAccountIsUsable(identity.userData);

      const nowIso = new Date().toISOString();
      const expiresAtIso = new Date(Date.now() + FACULTY_FAST_ACCESS_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
      const initialFastAccessCredits = normalizeFastAccessCredits(
        identity.userData?.fastAccessCredits ?? identity.tempData?.fastAccessCredits
      );
      const profileCompletionStage = resolveFastAccessProfileCompletionStage(identity.userData, identity.tempData);
      const tempProfile =
        typeof identity.tempData?.profile === 'object' && identity.tempData?.profile
          ? identity.tempData.profile as Record<string, unknown>
          : {};
      const existingMetadata =
        typeof identity.userData?.fastAccessMetadata === 'object' && identity.userData?.fastAccessMetadata
          ? identity.userData.fastAccessMetadata as Record<string, unknown>
          : {};
      const completedProfileMetadata =
        profileCompletionStage === 'temporary_onboarding_complete'
          ? {
              profileCompletedAt:
                normalizeOptionalString(existingMetadata.profileCompletedAt) ||
                normalizeOptionalString(identity.tempData?.profileCompletedAt) ||
                nowIso,
              creditsGrantedAt:
                normalizeOptionalString(existingMetadata.creditsGrantedAt) ||
                normalizeOptionalString(identity.tempData?.creditsGrantedAt) ||
                nowIso,
            }
          : {};
      const mergedProviders = Array.from(new Set([
        'phone-fast-access',
        ...normalizeAuthProviderList(identity.userData?.authProviders),
      ]));

      await db.runTransaction(async (tx) => {
        tx.set(identity.userRef, {
          id: userId,
          email: normalizeOptionalString(identity.userData?.email) || `temp-${userId}@fast-access.local`,
          username: normalizeOptionalString(identity.userData?.username) || `temp_science_${userId.slice(0, 8)}`,
          usernameLower: normalizeOptionalString(identity.userData?.usernameLower) || `temp_science_${userId.slice(0, 8)}`.toLowerCase(),
          name:
            normalizeOptionalString(identity.userData?.name) ||
            normalizeOptionalString(tempProfile.fullName) ||
            'CU Science Student',
          phoneNumber,
          role: 'User',
          plan: 'free',
          status: 'Active',
          isVerified: true,
          authProviders: mergedProviders,
          institution: 'Cairo University',
          department:
            normalizeOptionalString(identity.userData?.department) ||
            normalizeOptionalString(tempProfile.department) ||
            'Faculty of Science',
          academicYear:
            normalizeOptionalString(identity.userData?.academicYear) ||
            normalizeOptionalString(tempProfile.academicYear) ||
            '',
          universityCode:
            normalizeOptionalString(identity.userData?.universityCode) ||
            normalizeOptionalString(tempProfile.universityCode) ||
            '',
          isTemporaryAccess: true,
          temporaryAccessType: FACULTY_FAST_ACCESS_TYPE,
          temporaryAccessExpiresAt: expiresAtIso,
          accountScope: FACULTY_FAST_ACCESS_SCOPE,
          fastAccessCredits: initialFastAccessCredits,
          fastAccessCreditsUpdatedAt: nowIso,
          fastAccessMetadata: {
            institution: 'Cairo University',
            faculty: 'Faculty of Science',
            onboardingMethod:
              normalizeOptionalString((identity.userData?.fastAccessMetadata as Record<string, unknown> | undefined)?.onboardingMethod) ||
              normalizeOptionalString(identity.tempData?.authProvider) ||
              'firebase_phone_otp',
            profileCompletionStage,
            ...completedProfileMetadata,
          },
          statusMessage: admin.firestore.FieldValue.delete(),
          statusContext: {
            current: 'active',
            pendingReactivationNotice: false,
            lastStatusChangedAt: nowIso,
            lastStatusChangedBy: 'system:fast_access_login',
          },
          lastLogin: nowIso,
          updatedAt: nowIso,
          ...(identity.userData ? {} : { createdAt: nowIso, firstLoginDate: nowIso }),
        }, { merge: true });

        tx.set(identity.tempAccessRef, {
          userId,
          phoneNumber,
          status: 'active',
          accountScope: FACULTY_FAST_ACCESS_SCOPE,
          temporaryAccessType: FACULTY_FAST_ACCESS_TYPE,
          institution: 'Cairo University',
          faculty: 'Faculty of Science',
          profile: {
            fullName:
              normalizeOptionalString(tempProfile.fullName) ||
              normalizeOptionalString(identity.userData?.name) ||
              'CU Science Student',
            universityCode:
              normalizeOptionalString(tempProfile.universityCode) ||
              normalizeOptionalString(identity.userData?.universityCode) ||
              '',
            department:
              normalizeOptionalString(tempProfile.department) ||
              normalizeOptionalString(identity.userData?.department) ||
              'Faculty of Science',
            academicYear:
              normalizeOptionalString(tempProfile.academicYear) ||
              normalizeOptionalString(identity.userData?.academicYear) ||
              '',
          },
          authProvider: normalizeOptionalString(identity.tempData?.authProvider) || 'firebase_phone_otp',
          otpVerifiedAt: nowIso,
          fastAccessCredits: initialFastAccessCredits,
          updatedAt: nowIso,
          expiresAt: expiresAtIso,
          profileCompletionStage,
          ...completedProfileMetadata,
          onboardingPath:
            normalizeOptionalString(identity.tempData?.onboardingPath) ||
            'self_service_phone_registration',
          ...(identity.tempSnap.exists ? {} : { createdAt: nowIso }),
        }, { merge: true });
      });

      res.json({
        success: true,
        data: await createFastAccessSessionPayload({
          userId,
          phoneNumber,
          expiresAtIso,
          fastAccessCredits: initialFastAccessCredits,
          profileCompletionStage,
        }),
      });

      throttleSuccessKeys.forEach(recordFastAccessSuccess);
    } catch (error: any) {
      const message = normalizeOptionalString(error?.message) || 'Failed to log in to fast-access account';
      const statusCode =
        message.includes('No Faculty Fast Access account')
          ? 404
          : message.includes('full account')
            ? 409
            : message.includes('verified Firebase phone OTP token')
              ? 403
              : 400;
      throttleFailureKeys.forEach(recordFastAccessFailure);
      res.status(statusCode).json({ success: false, error: message });
    }
  });

  app.post('/api/auth/fast-access/faculty-science/verify', async (req, res) => {
    /**
     * ARCHITECTURE SAFETY NOTE
     * ------------------------------------------------------------------
     * This route must stay isolated from full-account registration/login routes.
     * It verifies Firebase phone OTP proof and provisions a temporary, clearly
     * marked Faculty-of-Science access profile through backend authority only.
     */
    const clientIp = getRequestIp(req);
    const ipKey = `ip:${clientIp}`;
    const ipLimit = checkFastAccessThrottle(ipKey);
    if (!ipLimit.allowed) {
      return res.status(429).json({
        success: false,
        error: ipLimit.message,
        retryAfterSeconds: ipLimit.retryAfterSeconds,
      });
    }

    const throttleSuccessKeys = [ipKey];
    const throttleFailureKeys = [ipKey];

    try {
      const idToken = normalizeRequiredString(req.body?.idToken, 'idToken');
      const { userId, phoneNumber } = await verifyFastAccessPhoneToken(idToken);
      const userKey = `uid:${userId}`;
      const phoneKey = `phone:${phoneNumber}`;
      const userLimit = checkFastAccessThrottle(userKey);
      const phoneLimit = checkFastAccessThrottle(phoneKey);

      if (!userLimit.allowed || !phoneLimit.allowed) {
        const retryAfterSeconds = Math.max(userLimit.retryAfterSeconds, phoneLimit.retryAfterSeconds);
        const errorMessage = !userLimit.allowed ? userLimit.message : phoneLimit.message;
        return res.status(429).json({
          success: false,
          error: errorMessage,
          retryAfterSeconds,
        });
      }

      throttleSuccessKeys.push(userKey, phoneKey);
      throttleFailureKeys.push(userKey, phoneKey);

      const identity = await loadFastAccessIdentity(userId);
      if (identity.fullAccountExists) {
        return res.status(409).json({
          success: false,
          error: 'This phone is already attached to a full account. Use the regular login flow.',
        });
      }

      if (identity.fastAccessExists) {
        if (identity.userData) {
          assertFastAccessAccountIsUsable(identity.userData);
        }
        return res.status(409).json({
          success: false,
          error: 'This phone number is already registered for Faculty Fast Access. Use the login flow instead.',
        });
      }

      const nowIso = new Date().toISOString();
      const expiresAtIso = new Date(Date.now() + FACULTY_FAST_ACCESS_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
      let resolvedFastAccessCredits = 0;
      const profileCompletionStage = 'pending_profile_completion' as const;

      await db.runTransaction(async (tx) => {
        const existingUserSnap = await tx.get(identity.userRef);
        const existingUserData = existingUserSnap.exists ? (existingUserSnap.data() || {}) as Record<string, unknown> : null;
        const providerSet = new Set<string>(['phone-fast-access']);
        normalizeAuthProviderList(existingUserData?.authProviders).forEach((provider) => providerSet.add(provider));
        const mergedProviders = Array.from(providerSet);

        const initialFastAccessCredits = 0;
        resolvedFastAccessCredits = initialFastAccessCredits;

        const baseUserPayload: Record<string, unknown> = {
          id: userId,
          email: typeof existingUserData?.email === 'string' && String(existingUserData.email).trim()
            ? existingUserData.email
            : `temp-${userId}@fast-access.local`,
          username: typeof existingUserData?.username === 'string' && String(existingUserData.username).trim()
            ? existingUserData.username
            : `temp_science_${userId.slice(0, 8)}`,
          usernameLower: typeof existingUserData?.usernameLower === 'string' && String(existingUserData.usernameLower).trim()
            ? existingUserData.usernameLower
            : `temp_science_${userId.slice(0, 8)}`.toLowerCase(),
          name:
            (typeof existingUserData?.name === 'string' && String(existingUserData.name).trim()) ||
            'CU Science Student',
          phoneNumber,
          role: 'User',
          plan: 'free',
          status: 'Active',
          isVerified: true,
          authProviders: mergedProviders,
          permissions: {
            ...DEFAULT_USER_PERMISSIONS,
            accessPremiumTools: false,
            viewAdvancedVisuals: false,
          },
          limits: DEFAULT_USER_LIMITS,
          usage: {
            aiRequestsToday: 0,
            quizGenerationsToday: 0,
            uploadsToday: 0,
            lastResetDate: nowIso.split('T')[0],
          },
          settings: {
            theme: 'system',
            preferredModelId: 'gemini-3-flash-preview',
            language: 'English',
            quizDefaults: {
              questionCount: 10,
              difficulty: 'Intermediate',
              type: 'MCQ',
            },
            notifications: {
              email: false,
              browser: true,
              system: true,
            },
            exportFormat: 'PDF',
          },
          // Keep temporary-credit accounting isolated from normal account credits.
          // `credits` is left untouched (or zero-initialized) while `fastAccessCredits`
          // is the only balance used by the temporary Faculty flow.
          credits: typeof existingUserData?.credits === 'number' ? existingUserData.credits : 0,
          fastAccessCredits: initialFastAccessCredits,
          fastAccessCreditsUpdatedAt: nowIso,
          fastAccessCreditPolicy: {
            initialCredits: FACULTY_FAST_ACCESS_INITIAL_CREDITS,
            deductionPerSuccess: FACULTY_FAST_ACCESS_CREDIT_COST_PER_SUCCESS,
          },
          totalUploads: typeof existingUserData?.totalUploads === 'number' ? existingUserData.totalUploads : 0,
          totalAIRequests: typeof existingUserData?.totalAIRequests === 'number' ? existingUserData.totalAIRequests : 0,
          totalQuizzes: typeof existingUserData?.totalQuizzes === 'number' ? existingUserData.totalQuizzes : 0,
          institution: 'Cairo University',
          department:
            (typeof existingUserData?.department === 'string' && String(existingUserData.department).trim()) ||
            'Faculty of Science',
          academicYear:
            (typeof existingUserData?.academicYear === 'string' && String(existingUserData.academicYear).trim()) ||
            '',
          universityCode:
            (typeof existingUserData?.universityCode === 'string' && String(existingUserData.universityCode).trim()) ||
            '',
          country: typeof existingUserData?.country === 'string' && existingUserData.country ? existingUserData.country : 'Egypt',
          nationality: typeof existingUserData?.nationality === 'string' && existingUserData.nationality ? existingUserData.nationality : 'Egyptian',
          isTemporaryAccess: true,
          temporaryAccessType: FACULTY_FAST_ACCESS_TYPE,
          temporaryAccessExpiresAt: expiresAtIso,
          accountScope: FACULTY_FAST_ACCESS_SCOPE,
          fastAccessMetadata: {
            institution: 'Cairo University',
            faculty: 'Faculty of Science',
            onboardingMethod: 'firebase_phone_otp',
            profileCompletionStage,
          },
          statusMessage: admin.firestore.FieldValue.delete(),
          statusContext: {
            current: 'active',
            pendingReactivationNotice: false,
            lastStatusChangedAt: nowIso,
            lastStatusChangedBy: 'system:fast_access_verify',
          },
          lastLogin: nowIso,
          updatedAt: nowIso,
        };

        if (!existingUserData) {
          baseUserPayload.createdAt = nowIso;
          baseUserPayload.firstLoginDate = nowIso;
        }

        tx.set(identity.userRef, baseUserPayload, { merge: true });

        const tempPayload: Record<string, unknown> = {
          userId,
          phoneNumber,
          status: 'active',
          accountScope: FACULTY_FAST_ACCESS_SCOPE,
          temporaryAccessType: FACULTY_FAST_ACCESS_TYPE,
          institution: 'Cairo University',
          faculty: 'Faculty of Science',
          profile: {
            department:
              (typeof existingUserData?.department === 'string' && String(existingUserData.department).trim()) ||
              'Faculty of Science',
          },
          authProvider: 'firebase_phone_otp',
          otpVerifiedAt: nowIso,
          fastAccessCredits: initialFastAccessCredits,
          updatedAt: nowIso,
          expiresAt: expiresAtIso,
          profileCompletionStage,
          onboardingPath: 'self_service_phone_registration',
        };

        tempPayload.createdAt = nowIso;

        tx.set(identity.tempAccessRef, tempPayload, { merge: true });
      });

      res.json({
        success: true,
        data: await createFastAccessSessionPayload({
          userId,
          phoneNumber,
          expiresAtIso,
          fastAccessCredits: resolvedFastAccessCredits,
          profileCompletionStage,
        }),
      });

      throttleSuccessKeys.forEach(recordFastAccessSuccess);
    } catch (error: any) {
      const message = normalizeOptionalString(error?.message) || 'Failed to complete fast-access verification';
      const statusCode =
        message.includes('already attached to a full account') || message.includes('already registered for Faculty Fast Access')
          ? 409
          : message.includes('verified Firebase phone OTP token')
            ? 403
            : 400;
      throttleFailureKeys.forEach(recordFastAccessFailure);
      res.status(statusCode).json({ success: false, error: message });
    }
  });

  app.post('/api/auth/fast-access/faculty-science/complete-profile', fastAccessAuthMiddleware, async (req, res) => {
    /**
     * COMPLETION NOTE
     * ------------------------------------------------------------------
     * Profile completion is the activation checkpoint for new temporary users.
     * The first 3 Faculty fast-access credits are granted here, not at raw OTP
     * verification time, so the phone-first flow can stay minimal while the
     * backend keeps quota authority.
     */
    try {
      const userContext = (req as any).userContext;
      const userId = normalizeRequiredString(userContext?.uid, 'uid');
      const profile = validateFastAccessProfile(req.body?.profile);
      const userRef = db.collection(COLLECTIONS.USERS).doc(userId);
      const tempAccessRef = db.collection(COLLECTIONS.FACULTY_FAST_ACCESS_ACCOUNTS).doc(userId);
      const [userSnap, tempSnap] = await Promise.all([userRef.get(), tempAccessRef.get()]);

      if (!userSnap.exists) {
        return res.status(404).json({ success: false, error: 'User profile not found.' });
      }

      const userData = (userSnap.data() || {}) as Record<string, unknown>;
      const tempData = tempSnap.exists ? (tempSnap.data() || {}) as Record<string, unknown> : null;

      if (!isFacultyFastAccessScopedUser(userData)) {
        return res.status(409).json({
          success: false,
          error: 'Only temporary Faculty fast-access accounts can complete this activation step.',
        });
      }

      const currentStage = resolveFastAccessProfileCompletionStage(userData, tempData);
      const nowIso = new Date().toISOString();
      const existingMetadata =
        typeof userData.fastAccessMetadata === 'object' && userData.fastAccessMetadata
          ? userData.fastAccessMetadata as Record<string, unknown>
          : {};
      const currentCredits = normalizeFastAccessCredits(userData.fastAccessCredits ?? tempData?.fastAccessCredits);
      const shouldGrantInitialCredits = currentStage !== 'temporary_onboarding_complete';
      const nextCredits = shouldGrantInitialCredits
        ? FACULTY_FAST_ACCESS_INITIAL_CREDITS
        : currentCredits;
      const grantedCredits = shouldGrantInitialCredits ? FACULTY_FAST_ACCESS_INITIAL_CREDITS : 0;
      const completedProfileMetadata = {
        profileCompletionStage: 'temporary_onboarding_complete' as const,
        profileCompletedAt:
          normalizeOptionalString(existingMetadata.profileCompletedAt) ||
          normalizeOptionalString(tempData?.profileCompletedAt) ||
          nowIso,
        creditsGrantedAt:
          normalizeOptionalString(existingMetadata.creditsGrantedAt) ||
          normalizeOptionalString(tempData?.creditsGrantedAt) ||
          nowIso,
      };

      await db.runTransaction(async (tx) => {
        tx.set(userRef, {
          name: profile.fullName,
          universityCode: profile.universityCode,
          department: profile.department,
          academicYear: profile.academicYear,
          fastAccessCredits: nextCredits,
          fastAccessCreditsUpdatedAt: nowIso,
          fastAccessCreditPolicy: {
            initialCredits: FACULTY_FAST_ACCESS_INITIAL_CREDITS,
            deductionPerSuccess: FACULTY_FAST_ACCESS_CREDIT_COST_PER_SUCCESS,
          },
          fastAccessMetadata: {
            institution: 'Cairo University',
            faculty: 'Faculty of Science',
            onboardingMethod:
              normalizeOptionalString(existingMetadata.onboardingMethod) ||
              normalizeOptionalString(tempData?.authProvider) ||
              'firebase_phone_otp',
            ...completedProfileMetadata,
          },
          updatedAt: nowIso,
        }, { merge: true });

        tx.set(tempAccessRef, {
          userId,
          phoneNumber:
            normalizeOptionalString(userData.phoneNumber) ||
            normalizeOptionalString(tempData?.phoneNumber) ||
            '',
          profile,
          fastAccessCredits: nextCredits,
          profileCompletionStage: 'temporary_onboarding_complete',
          profileCompletedAt: completedProfileMetadata.profileCompletedAt,
          creditsGrantedAt: completedProfileMetadata.creditsGrantedAt,
          updatedAt: nowIso,
        }, { merge: true });
      });

      res.json({
        success: true,
        data: {
          completed: true,
          fastAccessCredits: nextCredits,
          grantedCredits,
          profileCompletionStage: 'temporary_onboarding_complete',
        },
      });
    } catch (error: any) {
      const message = normalizeOptionalString(error?.message) || 'Failed to complete fast-access profile';
      res.status(400).json({ success: false, error: message });
    }
  });

  app.post('/api/auth/fast-access/faculty-science/convert', fastAccessAuthMiddleware, async (req, res) => {
    /**
     * ARCHITECTURE SAFETY NOTE
     * ------------------------------------------------------------------
     * Conversion must remain backend-controlled to enforce migration policy,
     * preserve full-account security rules, and avoid accidental privilege drift.
     */
    try {
      const userContext = (req as any).userContext;
      const userId = normalizeRequiredString(userContext?.uid, 'uid');
      const email = normalizeRequiredString(req.body?.email, 'email').toLowerCase();
      const username = normalizeRequiredString(req.body?.username, 'username');
      const password = normalizeRequiredString(req.body?.password, 'password');
      const fullName = normalizeRequiredString(req.body?.fullName, 'fullName');
      const country = normalizeRequiredString(req.body?.country, 'country');
      const nationality = normalizeRequiredString(req.body?.nationality, 'nationality');
      const dateOfBirth = normalizeRequiredString(req.body?.dateOfBirth, 'dateOfBirth');
      const gender = normalizeRequiredString(req.body?.gender, 'gender');
      const department = normalizeRequiredString(req.body?.department, 'department');
      const academicYear = normalizeRequiredString(req.body?.academicYear, 'academicYear');
      const migrationPolicyAccepted = req.body?.migrationPolicyAccepted === true;

      if (!migrationPolicyAccepted) {
        return res.status(400).json({
          success: false,
          error: 'Migration policy acceptance is required.',
        });
      }

      if (!isValidEmail(email)) {
        return res.status(400).json({ success: false, error: 'Invalid email format.' });
      }

      if (!/^[A-Za-z0-9._-]{3,32}$/.test(username)) {
        return res.status(400).json({
          success: false,
          error: 'Username must be 3-32 characters and contain only letters, numbers, dot, underscore, or dash.',
        });
      }

      if (!/^(?=.*[a-zA-Z])(?=.*\d).{8,}$/.test(password)) {
        return res.status(400).json({
          success: false,
          error: 'Password must be at least 8 characters and include letters and numbers.',
        });
      }

      if (!/^[A-Za-z][A-Za-z\s.'-]{1,118}$/.test(fullName)) {
        return res.status(400).json({
          success: false,
          error: 'Full name must use English letters only.',
        });
      }

      if (!/^[A-Za-z][A-Za-z\s.'-]{1,78}$/.test(country)) {
        return res.status(400).json({ success: false, error: 'Country must use English letters only.' });
      }

      if (!/^[A-Za-z][A-Za-z\s.'-]{1,78}$/.test(nationality)) {
        return res.status(400).json({ success: false, error: 'Nationality must use English letters only.' });
      }

      if (!/^[A-Za-z0-9][A-Za-z0-9\s&()'./-]{1,118}$/.test(department)) {
        return res.status(400).json({
          success: false,
          error: 'Department must use English characters only.',
        });
      }

      if (!FULL_ACCOUNT_ACADEMIC_LEVELS.has(academicYear)) {
        return res.status(400).json({
          success: false,
          error: 'Academic level is invalid.',
        });
      }

      const allowedGenders = new Set(['male', 'female', 'other', 'prefer_not_to_say']);
      if (!allowedGenders.has(gender)) {
        return res.status(400).json({ success: false, error: 'Gender value is invalid.' });
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
        return res.status(400).json({ success: false, error: 'Date of birth must use YYYY-MM-DD format.' });
      }

      const birthDate = new Date(`${dateOfBirth}T00:00:00.000Z`);
      if (Number.isNaN(birthDate.getTime()) || birthDate.toISOString().slice(0, 10) !== dateOfBirth) {
        return res.status(400).json({ success: false, error: 'Date of birth is invalid.' });
      }

      if (birthDate.getTime() > Date.now()) {
        return res.status(400).json({ success: false, error: 'Date of birth cannot be in the future.' });
      }

      const userRef = db.collection(COLLECTIONS.USERS).doc(userId);
      const tempAccessRef = db.collection(COLLECTIONS.FACULTY_FAST_ACCESS_ACCOUNTS).doc(userId);
      const [userSnap, tempSnap] = await Promise.all([userRef.get(), tempAccessRef.get()]);

      if (!userSnap.exists) {
        return res.status(404).json({ success: false, error: 'User profile not found.' });
      }

      const userData = userSnap.data() as Record<string, any>;
      const isTemporary = Boolean(userData?.isTemporaryAccess) || userData?.accountScope === FACULTY_FAST_ACCESS_SCOPE;

      if (!isTemporary || userData?.temporaryAccessType !== FACULTY_FAST_ACCESS_TYPE) {
        return res.status(409).json({
          success: false,
          error: 'Only temporary Faculty of Science fast-access accounts can be converted.',
        });
      }

      const usernameLower = username.toLowerCase();

      const usernameConflictSnap = await db
        .collection(COLLECTIONS.USERS)
        .where('usernameLower', '==', usernameLower)
        .get();

      const usernameConflict = usernameConflictSnap.docs.find((docSnap) => docSnap.id !== userId);
      if (usernameConflict) {
        return res.status(409).json({ success: false, error: 'This username is already taken.' });
      }

      const emailConflictSnap = await db
        .collection(COLLECTIONS.USERS)
        .where('email', '==', email)
        .get();

      const emailConflict = emailConflictSnap.docs.find((docSnap) => docSnap.id !== userId);
      if (emailConflict) {
        return res.status(409).json({ success: false, error: 'This email is already in use.' });
      }

      try {
        const authUserByEmail = await admin.auth().getUserByEmail(email);
        if (authUserByEmail.uid !== userId) {
          return res.status(409).json({ success: false, error: 'This email is already linked to another account.' });
        }
      } catch (error: any) {
        if (error?.code !== 'auth/user-not-found') {
          throw error;
        }
      }

      const nowIso = new Date().toISOString();
      await admin.auth().updateUser(userId, {
        email,
        password,
        emailVerified: false,
        displayName: fullName || userData?.name || 'Student',
      });

      await admin.auth().setCustomUserClaims(userId, {
        role: 'User',
        accountScope: FULL_ACCOUNT_SCOPE,
        isTemporaryAccess: false,
      });

      const existingProviders = normalizeAuthProviderList(userData?.authProviders);
      const authProviders = Array.from(new Set([...existingProviders, 'password', 'phone-fast-access']));

      await db.runTransaction(async (tx) => {
        tx.update(userRef, {
          email,
          username,
          usernameLower,
          name: fullName,
          country,
          nationality,
          dateOfBirth,
          gender,
          department,
          academicYear,
          institution: 'Cairo University',
          role: 'User',
          status: 'PendingEmailVerification',
          isVerified: false,
          isTemporaryAccess: false,
          accountScope: FULL_ACCOUNT_SCOPE,
          authProviders,
          convertedFromFastAccessAt: nowIso,
          fastAccessCredits: admin.firestore.FieldValue.delete(),
          fastAccessCreditsUpdatedAt: admin.firestore.FieldValue.delete(),
          fastAccessCreditPolicy: admin.firestore.FieldValue.delete(),
          temporaryAccessType: admin.firestore.FieldValue.delete(),
          temporaryAccessExpiresAt: admin.firestore.FieldValue.delete(),
          updatedAt: nowIso,
        });

        tx.set(tempAccessRef, {
          status: 'converted',
          convertedAt: nowIso,
          convertedToScope: FULL_ACCOUNT_SCOPE,
          profileCompletionStage: 'converted_to_full_account',
          updatedAt: nowIso,
        }, { merge: true });

        tx.set(db.collection(COLLECTIONS.FACULTY_FAST_ACCESS_MIGRATIONS).doc(), {
          userId,
          previousScope: FACULTY_FAST_ACCESS_SCOPE,
          nextScope: FULL_ACCOUNT_SCOPE,
          convertedAt: nowIso,
          email,
          username,
          fullName,
          country,
          nationality,
          dateOfBirth,
          gender,
          department,
          academicYear,
          migrationPolicyAccepted: true,
          previousTemporaryRecordExists: tempSnap.exists,
          actorUserId: userId,
          actorEmail: userContext?.email || '',
          actorIp: getRequestIp(req),
        });
      });

      await db.collection('activities').add({
        userId,
        type: 'profile_update',
        description: 'Converted temporary Faculty fast-access account to full account',
        timestamp: nowIso,
        status: 'success',
        metadata: {
          fromScope: FACULTY_FAST_ACCESS_SCOPE,
          toScope: FULL_ACCOUNT_SCOPE,
          accountCompletionMode: 'deferred_upgrade',
        },
      });

      res.json({
        success: true,
        data: {
          converted: true,
          nextStatus: 'PendingEmailVerification',
          accountScope: FULL_ACCOUNT_SCOPE,
          requiresEmailVerification: true,
        },
      });
    } catch (error: any) {
      const message = normalizeOptionalString(error?.message) || 'Failed to convert temporary account';
      res.status(400).json({ success: false, error: message });
    }
  });

  // Billing & Payments (New Provider-Agnostic System)
  app.post("/api/billing/create-subscription", authMiddleware, async (req, res) => {
    console.log("POST /api/billing/create-subscription hit");
    try {
      const traceId = createTraceId('billing-route-subscription');
      const { planId, currency, successUrl, cancelUrl } = req.body;
      const userContext = (req as any).userContext;

      const userId = userContext?.uid;
      const userEmail = userContext?.email || normalizeOptionalString(req.body?.userEmail) || 'unknown@zootopiaclub.com';
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }
      
      const response = await billingService.createSubscription({
        planId,
        userId,
        userEmail,
        currency,
        successUrl,
        cancelUrl
      });

      logDiagnostic('info', 'billing.route_create_subscription_success', {
        traceId,
        area: 'billing',
        route: '/api/billing/create-subscription',
        stage: 'createSubscription',
        userId,
        details: { planId, provider: response.provider },
      });

      res.json({ success: true, checkoutUrl: response.checkoutUrl });
    } catch (error: any) {
      console.error("Billing Subscription Error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/billing/create-tool-unlock-checkout', async (req, res) => {
    try {
      const idToken = req.headers.authorization?.split('Bearer ')[1];
      if (!idToken) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const toolId = normalizeRequiredString(req.body?.toolId, 'toolId');
      const successUrl = normalizeRequiredString(req.body?.successUrl, 'successUrl');
      const cancelUrl = normalizeRequiredString(req.body?.cancelUrl, 'cancelUrl');

      if (!isToolUnlockEligible(toolId)) {
        return res.status(400).json({ success: false, error: 'invalid-tool-id' });
      }

      const checkout = await billingService.createDonation({
        amount: CANONICAL_UNLOCK_PRICE_EGP,
        currency: 'EGP',
        userId: decodedToken.uid,
        userEmail: decodedToken.email || 'unknown@zootopiaclub.com',
        successUrl,
        cancelUrl,
      });

      await db.collection('transactions').doc(checkout.sessionId).set({
        type: 'tool_unlock',
        purpose: 'tool-unlock',
        toolId,
        unlockPriceEgp: CANONICAL_UNLOCK_PRICE_EGP,
        entitlementGrantStatus: 'pending',
        entitlementSource: 'payment',
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      res.json(checkout);
    } catch (error: any) {
      res.status(500).json({ success: false, error: normalizeOptionalString(error?.message) || 'failed-to-create-tool-unlock-checkout' });
    }
  });

  app.post('/api/billing/create-model-unlock-checkout', async (req, res) => {
    try {
      const idToken = req.headers.authorization?.split('Bearer ')[1];
      if (!idToken) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const modelId = toCanonicalModelId(normalizeRequiredString(req.body?.modelId, 'modelId'));
      const successUrl = normalizeRequiredString(req.body?.successUrl, 'successUrl');
      const cancelUrl = normalizeRequiredString(req.body?.cancelUrl, 'cancelUrl');

      if (!getModelByAnyId(modelId)) {
        return res.status(400).json({ success: false, error: 'invalid-model-id' });
      }

      const checkout = await billingService.createDonation({
        amount: MODEL_UNLOCK_PRICE_EGP,
        currency: 'EGP',
        userId: decodedToken.uid,
        userEmail: decodedToken.email || 'unknown@zootopiaclub.com',
        successUrl,
        cancelUrl,
      });

      await db.collection('transactions').doc(checkout.sessionId).set({
        type: 'model_unlock',
        purpose: 'model-unlock',
        modelId,
        unlockPriceEgp: MODEL_UNLOCK_PRICE_EGP,
        entitlementGrantStatus: 'pending',
        entitlementSource: 'payment',
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      res.json(checkout);
    } catch (error: any) {
      res.status(500).json({ success: false, error: normalizeOptionalString(error?.message) || 'failed-to-create-model-unlock-checkout' });
    }
  });

  const DONATION_PAYMOB_CURRENCY = 'EGP';
  const DONATION_VERIFICATION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const DONATION_RECEIPT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

  const hashBillingVerificationToken = (token: string) =>
    crypto.createHash('sha256').update(token).digest('hex');

  const safeHashEquals = (left: string, right: string) => {
    const a = Buffer.from(String(left || ''), 'utf8');
    const b = Buffer.from(String(right || ''), 'utf8');
    if (a.length === 0 || a.length !== b.length) {
      return false;
    }
    return crypto.timingSafeEqual(a, b);
  };

  const normalizeDonationReceiptEmail = (value: unknown): string | null => {
    const normalized = normalizeOptionalString(value).toLowerCase();
    if (!normalized) {
      return null;
    }
    if (!DONATION_RECEIPT_EMAIL_PATTERN.test(normalized)) {
      throw new Error('receiptEmail must be a valid email address');
    }
    return normalized;
  };

  const resolveOptionalBillingRequester = async (req: express.Request) => {
    const idToken = req.headers.authorization?.split('Bearer ')[1];
    if (!idToken) {
      return null;
    }

    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const userDoc = await db.collection(COLLECTIONS.USERS).doc(decodedToken.uid).get();
      const userData = (userDoc.data() || {}) as Record<string, unknown>;
      const roleContext = resolveRoleContext(decodedToken, userData);

      if (!roleContext.isAdmin && ['suspended', 'blocked', 'rejected'].includes(roleContext.normalizedStatus)) {
        const statusContext = (userData.statusContext || {}) as Record<string, unknown>;
        return {
          error: {
            status: 403,
            body: {
              success: false,
              error: 'Account access is currently restricted.',
              code: 'ACCOUNT_RESTRICTED',
              accountStatus: String(userData.status || ''),
              statusMessage:
                normalizeOptionalString(statusContext.suspensionReason) ||
                normalizeOptionalString(userData.statusMessage) ||
                null,
              reinstatementMessage:
                normalizeOptionalString(statusContext.reactivationMessage) || null,
            },
          },
        };
      }

      return {
        userContext: {
          uid: decodedToken.uid,
          email: decodedToken.email,
          role: roleContext.role,
          adminLevel: roleContext.adminLevel,
          isAdmin: roleContext.isAdmin,
        },
      };
    } catch {
      return {
        error: {
          status: 401,
          body: {
            success: false,
            error: 'Unauthorized: Invalid token',
          },
        },
      };
    }
  };

  const resolveTransactionSnapshotByReference = async (reference: string) => {
    const normalizedReference = normalizeRequiredString(reference, 'sessionId');
    const directDoc = await db.collection('transactions').doc(normalizedReference).get();
    if (directDoc.exists) {
      return directDoc;
    }

    const bySessionId = await db.collection('transactions')
      .where('id', '==', normalizedReference)
      .limit(1)
      .get();

    if (!bySessionId.empty) {
      return bySessionId.docs[0];
    }

    const byProviderTransaction = await db.collection('transactions')
      .where('providerTransactionId', '==', normalizedReference)
      .limit(1)
      .get();

    if (!byProviderTransaction.empty) {
      return byProviderTransaction.docs[0];
    }

    const numericReference = Number(normalizedReference);
    if (Number.isFinite(numericReference) && numericReference > 0) {
      const byProviderOrderId = await db.collection('transactions')
        .where('providerMetadata.orderId', '==', numericReference)
        .limit(1)
        .get();

      if (!byProviderOrderId.empty) {
        return byProviderOrderId.docs[0];
      }
    }

    return null;
  };

  const canVerifyDonationWithToken = (txData: Record<string, unknown>, verificationToken: string) => {
    if (String(txData.type || '').trim().toLowerCase() !== 'donation') {
      return false;
    }

    const storedHash = normalizeOptionalString(txData.verificationAccessHash);
    const normalizedToken = normalizeOptionalString(verificationToken);
    if (!storedHash || !normalizedToken) {
      return false;
    }

    const expiresAt = Date.parse(normalizeOptionalString(txData.verificationAccessExpiresAt));
    if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
      return false;
    }

    return safeHashEquals(storedHash, hashBillingVerificationToken(normalizedToken));
  };

  const mapTransactionHistoryEntry = (id: string, txData: Record<string, unknown>) => ({
    id,
    type: normalizeOptionalString(txData.type) || 'payment',
    status: normalizeOptionalString(txData.status) || 'pending',
    amount: Number(txData.amount || 0),
    currency: normalizeOptionalString(txData.currency) || DONATION_PAYMOB_CURRENCY,
    provider: normalizeOptionalString(txData.provider) || 'unknown',
    planId: normalizeOptionalString(txData.planId) || null,
    toolId: normalizeOptionalString(txData.toolId) || null,
    modelId: normalizeOptionalString(txData.modelId) || null,
    donationAmountMode: normalizeOptionalString(txData.donationAmountMode) || null,
    donationTierId: normalizeOptionalString(txData.donationTierId) || null,
    isAnonymousDonation: txData.isAnonymousDonation === true,
    userId: normalizeOptionalString(txData.userId) || null,
    userEmail: normalizeOptionalString(txData.userEmail) || null,
    createdAt: normalizeOptionalString(txData.createdAt) || null,
    updatedAt: normalizeOptionalString(txData.updatedAt) || null,
    verifiedAt: normalizeOptionalString(txData.verifiedAt) || null,
  });

  app.get('/api/billing/history', authMiddleware, async (req, res) => {
    try {
      const requester = (req as any).userContext;
      const txSnapshot = await db.collection('transactions')
        .where('userId', '==', normalizeRequiredString(requester?.uid, 'userContext.uid'))
        .limit(200)
        .get();

      const transactions = txSnapshot.docs
        .map((doc) => mapTransactionHistoryEntry(doc.id, (doc.data() || {}) as Record<string, unknown>))
        .sort((left, right) => {
          const rightTime = Date.parse(right.createdAt || right.updatedAt || '') || 0;
          const leftTime = Date.parse(left.createdAt || left.updatedAt || '') || 0;
          return rightTime - leftTime;
        });

      res.json({ success: true, transactions });
    } catch (error: any) {
      res.status(500).json({ success: false, error: normalizeOptionalString(error?.message) || 'Failed to fetch billing history' });
    }
  });

  app.post("/api/billing/create-donation", async (req, res) => {
    try {
      const traceId = createTraceId('billing-route-donation');
      const { amount, successUrl, cancelUrl } = req.body;
      const amountMode = String(req.body?.amountMode || '').trim().toLowerCase() === 'fixed' ? 'fixed' : 'custom';
      const tierId = normalizeOptionalString(req.body?.tierId);
      const requestedCurrency = String(req.body?.currency || DONATION_PAYMOB_CURRENCY).trim().toUpperCase();
      if (requestedCurrency !== DONATION_PAYMOB_CURRENCY) {
        return res.status(400).json({
          success: false,
          error: `Donations through Paymob currently require ${DONATION_PAYMOB_CURRENCY}.`,
        });
      }

      // Optional authentication binding for donation flows:
      // - If a token is supplied, bind the donation to the authenticated principal.
      // - If no token is supplied, retain anonymous donation compatibility.
      const idToken = req.headers.authorization?.split('Bearer ')[1];
      let authenticatedUserId: string | undefined;
      let authenticatedEmail: string | undefined;
      if (idToken) {
        try {
          const decoded = await admin.auth().verifyIdToken(idToken);
          authenticatedUserId = decoded.uid;
          authenticatedEmail = decoded.email || undefined;
        } catch {
          return res.status(401).json({ success: false, error: 'Unauthorized: Invalid token' });
        }
      }

      const userId = authenticatedUserId || normalizeOptionalString(req.body?.userId);
      const userEmail = normalizeDonationReceiptEmail(
        authenticatedEmail || req.body?.receiptEmail || req.body?.userEmail
      );
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const verificationAccessIssuedAt = new Date().toISOString();
      const verificationAccessExpiresAt = new Date(Date.now() + DONATION_VERIFICATION_TOKEN_TTL_MS).toISOString();
      
      const response = await billingService.createDonation({
        amount,
        userId,
        userEmail: userEmail || undefined,
        currency: DONATION_PAYMOB_CURRENCY,
        successUrl,
        cancelUrl,
        provider: 'paymob',
        amountMode,
        tierId: tierId || undefined,
        metadata: {
          verificationAccessHash: hashBillingVerificationToken(verificationToken),
          verificationAccessIssuedAt,
          verificationAccessExpiresAt,
        },
      });

      logDiagnostic('info', 'billing.route_create_donation_success', {
        traceId,
        area: 'billing',
        route: '/api/billing/create-donation',
        stage: 'createDonation',
        userId,
        details: { amount, currency: DONATION_PAYMOB_CURRENCY, amountMode, tierId, provider: response.provider },
      });

      res.json({
        success: true,
        sessionId: response.sessionId,
        checkoutUrl: response.checkoutUrl,
        verificationToken,
      });
    } catch (error: any) {
      console.error("Billing Donation Error:", error);
      const message = normalizeOptionalString(error?.message) || 'Failed to initiate donation';
      const statusCode =
        message.includes('receiptEmail') ||
        message.includes('Invalid donation request') ||
        message.includes('Donations through Paymob currently require')
          ? 400
          : 500;
      res.status(statusCode).json({ success: false, error: message });
    }
  });

  app.post("/api/billing/verify-payment", async (req, res) => {
    console.log("POST /api/billing/verify-payment hit");
    try {
      const traceId = createTraceId('billing-route-verify');
      const sessionReference = normalizeRequiredString(req.body?.sessionId, 'sessionId');
      const verificationToken = normalizeOptionalString(req.body?.verificationToken);
      const requesterResult = await resolveOptionalBillingRequester(req);
      if (requesterResult?.error) {
        return res.status(requesterResult.error.status).json(requesterResult.error.body);
      }

      const requester = requesterResult?.userContext || null;
      const txSnap = await resolveTransactionSnapshotByReference(sessionReference);
      if (!txSnap?.exists) {
        return res.status(404).json({ success: false, error: 'Transaction not found' });
      }

      const canonicalSessionId = txSnap.id;
      const txRef = txSnap.ref;
      const txData = (txSnap.data() || {}) as Record<string, unknown>;
      const transactionUserId = normalizeOptionalString(txData.userId);
      const donationTokenAuthorized = canVerifyDonationWithToken(txData, verificationToken);

      /**
       * SECURITY CRITICAL (Verification Ownership)
       * ------------------------------------------------------------------
       * Authenticated callers may verify only their own transactions unless
       * they are admins. Anonymous donation callbacks must present the
       * one-time verification token issued during checkout creation.
       */
      if (requester) {
        if (transactionUserId && requester.uid !== transactionUserId && !requester.isAdmin && !donationTokenAuthorized) {
          return res.status(403).json({ success: false, error: 'Forbidden: not transaction owner' });
        }
      } else if (!donationTokenAuthorized) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized: donation verification token required',
        });
      }

      const status = await billingService.verifyPayment(canonicalSessionId);
      const normalizedStatus = String(status?.status || '').toLowerCase();

      logDiagnostic('info', 'billing.route_verify_payment_result', {
        traceId,
        area: 'billing',
        route: '/api/billing/verify-payment',
        stage: 'verifyPayment',
        userId: requester?.uid || transactionUserId || 'anonymous',
        status: normalizedStatus,
        details: { sessionReference, canonicalSessionId, type: txData.type || null },
      });

      // SECURITY CRITICAL:
      // Payment verification must remain backend-authoritative. The frontend can
      // observe success but must never grant unlock entitlements directly,
      // otherwise failed/replayed/forged callbacks can lead to unauthorized
      // access grants.
      if (normalizedStatus === 'success') {
        if (txSnap.exists) {
          if (txData.type === 'tool_unlock') {
            if (txData.entitlementGrantStatus === 'granted') {
              return res.json({
                success: true,
                paymentState: 'success',
                status: status.status,
                sessionId: canonicalSessionId,
                data: { ...status, sessionId: canonicalSessionId },
                confirmation: {
                  type: txData.type,
                  toolId: txData.toolId || null,
                  planId: txData.planId || null,
                  amount: txData.amount || status.amount || null,
                  currency: txData.currency || status.currency || null,
                  message: 'Payment verified. Unlock entitlement already granted.',
                },
                idempotentReplay: true,
              });
            }

            const toolId = normalizeOptionalString(txData.toolId);
            const userId = normalizeOptionalString(txData.userId);

            if (toolId && userId && isToolUnlockEligible(toolId)) {
              const grantResult = await grantToolEntitlement(db, {
                userId,
                toolId,
                source: 'payment',
                referenceId: canonicalSessionId,
              });

              await txRef.set({
                entitlementGrantStatus: 'granted',
                entitlementGrantedAt: new Date().toISOString(),
                entitlementGrantIdempotentReplay: grantResult.idempotentReplay,
                updatedAt: new Date().toISOString(),
              }, { merge: true });

              if (!grantResult.idempotentReplay) {
                try {
                  await communicationService.dispatchInternalMessage({
                    userId,
                    type: 'notification',
                    purpose: 'tool-unlock',
                    title: 'Tool Unlocked',
                    message: `Payment confirmed. Access granted to tool: ${toolId}`,
                    notes: `source:payment;session:${canonicalSessionId}`,
                  });
                } catch (notificationError) {
                  logDiagnostic('warn', 'tool_unlock.payment_notification_failed', {
                    area: 'billing',
                    stage: 'api/billing/verify-payment',
                    userId,
                    details: normalizeError(notificationError),
                  });
                }
              }
            } else {
              await txRef.set({
                entitlementGrantStatus: 'failed_invalid_metadata',
                updatedAt: new Date().toISOString(),
              }, { merge: true });
            }
          } else if (txData.type === 'model_unlock') {
            if (txData.entitlementGrantStatus === 'granted') {
              return res.json({
                success: true,
                paymentState: 'success',
                status: status.status,
                sessionId: canonicalSessionId,
                data: { ...status, sessionId: canonicalSessionId },
                confirmation: {
                  type: txData.type,
                  modelId: txData.modelId || null,
                  planId: txData.planId || null,
                  amount: txData.amount || status.amount || null,
                  currency: txData.currency || status.currency || null,
                  message: 'Payment verified. Model entitlement already granted.',
                },
                idempotentReplay: true,
              });
            }

            const modelId = normalizeOptionalString(txData.modelId);
            const userId = normalizeOptionalString(txData.userId);

            if (modelId && userId && getModelByAnyId(modelId)) {
              const grantResult = await grantModelEntitlement(db, {
                userId,
                modelId,
                source: 'payment',
                referenceId: canonicalSessionId,
              });

              await txRef.set({
                entitlementGrantStatus: 'granted',
                entitlementGrantedAt: new Date().toISOString(),
                entitlementGrantIdempotentReplay: grantResult.idempotentReplay,
                updatedAt: new Date().toISOString(),
              }, { merge: true });

              if (!grantResult.idempotentReplay) {
                try {
                  await communicationService.dispatchInternalMessage({
                    userId,
                    type: 'notification',
                    purpose: 'model-unlock',
                    title: 'Model Unlocked',
                    message: `Payment confirmed. Access granted to model: ${modelId}`,
                    notes: `source:payment;session:${canonicalSessionId};model:${modelId}`,
                  });
                } catch (notificationError) {
                  logDiagnostic('warn', 'model_unlock.payment_notification_failed', {
                    area: 'billing',
                    stage: 'api/billing/verify-payment',
                    userId,
                    details: normalizeError(notificationError),
                  });
                }
              }
            } else {
              await txRef.set({
                entitlementGrantStatus: 'failed_invalid_metadata',
                updatedAt: new Date().toISOString(),
              }, { merge: true });
            }
          }
        }
      }

      const confirmationMessage =
        normalizedStatus === 'success'
          ? (txData.type === 'tool_unlock'
              ? `Payment verified. Access granted to ${txData.toolId || 'the selected tool'}.`
              : txData.type === 'model_unlock'
                ? `Payment verified. Access granted to ${txData.modelId || 'the selected model'}.`
                : txData.type === 'subscription'
                  ? `Payment verified. Your ${txData.planId || 'subscription'} plan is active.`
                  : txData.type === 'donation'
                    ? `Donation verified. Thank you for supporting Zootopia Club${txData.amount ? ` with ${txData.amount} ${txData.currency || DONATION_PAYMOB_CURRENCY}` : ''}.`
                    : 'Payment verified successfully.')
          : normalizedStatus === 'pending'
            ? (txData.type === 'donation'
                ? 'Donation is still processing. Please retry shortly.'
                : 'Payment is still processing. Please retry shortly.')
            : normalizedStatus === 'cancelled'
              ? (txData.type === 'donation'
                  ? 'Donation was cancelled. No charge was applied.'
                  : 'Payment was cancelled. No changes were applied.')
              : (txData.type === 'donation'
                  ? 'Donation failed. No charge was applied.'
                  : 'Payment failed. No access was granted.');

      res.json({
        success: true,
        sessionId: canonicalSessionId,
        paymentState: normalizedStatus || 'pending',
        status: status.status,
        data: { ...status, sessionId: canonicalSessionId },
        confirmation: {
          type: txData.type || null,
          toolId: txData.toolId || null,
          modelId: txData.modelId || null,
          planId: txData.planId || null,
          amount: txData.amount || status.amount || null,
          currency: txData.currency || status.currency || null,
          amountMode: txData.donationAmountMode || null,
          tierId: txData.donationTierId || null,
          message: confirmationMessage,
        },
      });
    } catch (error: any) {
      console.error("Billing Verify Error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/billing/webhook/:provider", async (req, res) => {
    const { provider } = req.params;
    const signature = req.headers['x-paymob-signature'] as string;
    
    try {
      const traceId = createTraceId('billing-route-webhook');
      logDiagnostic('info', 'billing.route_webhook_received', {
        traceId,
        area: 'billing',
        route: '/api/billing/webhook/:provider',
        stage: 'handleWebhook',
        provider,
        details: { hasSignature: Boolean(signature) },
      });

      const status = await billingService.handleWebhook(provider, req.body, signature);
      logDiagnostic('info', 'billing.route_webhook_processed', {
        traceId,
        area: 'billing',
        route: '/api/billing/webhook/:provider',
        stage: 'handleWebhook',
        provider,
        status: status?.status || 'null',
        details: { sessionId: status?.sessionId || null },
      });
      res.json({ success: true, received: true });
    } catch (error: any) {
      console.error(`Webhook error for ${provider}:`, error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/admin/donations', adminMiddleware, async (req, res) => {
    try {
      const txSnapshot = await db.collection('transactions')
        .orderBy('createdAt', 'desc')
        .limit(500)
        .get();

      const donations = txSnapshot.docs
        .map((doc) => mapTransactionHistoryEntry(doc.id, (doc.data() || {}) as Record<string, unknown>))
        .filter((entry) => entry.type === 'donation');

      const summary = donations.reduce((acc, donation) => {
        acc.total += 1;
        if (donation.status === 'paid') {
          acc.successful += 1;
          acc.totalAmount += Number(donation.amount || 0);
        } else if (donation.status === 'pending') {
          acc.pending += 1;
        } else if (donation.status === 'failed' || donation.status === 'cancelled') {
          acc.unsuccessful += 1;
        }
        return acc;
      }, {
        total: 0,
        successful: 0,
        pending: 0,
        unsuccessful: 0,
        totalAmount: 0,
      });

      res.json({ success: true, donations, summary });
    } catch (error: any) {
      res.status(500).json({ success: false, error: normalizeOptionalString(error?.message) || 'Failed to fetch donations' });
    }
  });

  // Gift Code Endpoints
  app.get("/api/admin/gift-codes", adminMiddleware, async (req, res) => {
    try {
      const snapshot = await db.collection(COLLECTIONS.GIFT_CODES).get();
      const codes = snapshot.docs.map((doc) => {
        const data = doc.data() || {};
        const amount = normalizeUserCredits(data.creditAmount ?? data.amount);
        const maxRedemptions = Math.max(1, normalizeUserCredits(data.maxRedemptions ?? 1));
        const redemptionCount = normalizeUserCredits(
          data.redemptionCount ?? (Array.isArray(data.redeemedBy) ? data.redeemedBy.length : 0)
        );

        return {
          id: doc.id,
          code: String(data.code || ''),
          amount,
          isActive: data.isActive !== false,
          createdAt: normalizeOptionalString(data.createdAt) || null,
          expiresAt: normalizeOptionalString(data.expiresAt) || null,
          maxRedemptions,
          redemptionCount,
          revokedAt: normalizeOptionalString(data.revokedAt) || null,
          kind: normalizeOptionalString(data.kind) || 'gift-credit',
        };
      });
      res.json(codes);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/gift-codes", adminMiddleware, async (req, res) => {
    try {
      try {
        validateGiftCodeIssueInput(req.body);
      } catch (contractError) {
        logDiagnostic('warn', 'contracts.gift_code_payload_noncanonical', {
          area: 'contracts',
          stage: 'api/admin/gift-codes',
          details: normalizeError(contractError),
        });
      }

      const code = normalizeGiftCodeValue(req.body?.code);
      const amount = parseOptionalPositiveInt(req.body?.amount, 'amount') || 1;
      const isActive = req.body?.isActive !== false;
      const maxRedemptions = parseOptionalPositiveInt(req.body?.maxRedemptions, 'maxRedemptions') || 1;
      const expiresAt = normalizeOptionalIsoDate(req.body?.expiresAt, 'expiresAt');
      const nowIso = new Date().toISOString();

      // Gift-credit codes are distinct from unlock/access codes by design.
      if (code.startsWith('TOOL-') || code.startsWith('MOD-') || code.startsWith('SEC-') || code.startsWith('CHAT-')) {
        return res.status(400).json({ error: 'gift-code-prefix-conflicts-with-entitlement-codes' });
      }

      const existing = await db.collection(COLLECTIONS.GIFT_CODES).where('code', '==', code).limit(1).get();
      if (!existing.empty) {
        return res.status(409).json({ error: 'gift-code-already-exists' });
      }

      const ref = await db.collection(COLLECTIONS.GIFT_CODES).add({
        code,
        codeNormalized: code,
        amount,
        creditAmount: amount,
        kind: 'gift-credit',
        source: 'admin-issued',
        isActive,
        redeemedBy: [],
        redemptionCount: 0,
        maxRedemptions,
        expiresAt: expiresAt || null,
        revokedAt: null,
        createdByAdminId: (req as any).userContext.uid,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      res.json({ id: ref.id });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/admin/gift-codes/:id", adminMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const code = normalizeGiftCodeValue(req.body?.code);
      const amount = parseOptionalPositiveInt(req.body?.amount, 'amount') || 1;
      const isActive = req.body?.isActive !== false;
      const maxRedemptions = parseOptionalPositiveInt(req.body?.maxRedemptions, 'maxRedemptions') || 1;
      const expiresAt = normalizeOptionalIsoDate(req.body?.expiresAt, 'expiresAt');
      const nowIso = new Date().toISOString();

      const docRef = db.collection(COLLECTIONS.GIFT_CODES).doc(id);
      const existingDoc = await docRef.get();
      if (!existingDoc.exists) {
        return res.status(404).json({ error: 'gift-code-not-found' });
      }

      const duplicate = await db
        .collection(COLLECTIONS.GIFT_CODES)
        .where('code', '==', code)
        .limit(2)
        .get();
      const duplicateDoc = duplicate.docs.find((doc) => doc.id !== id);
      if (duplicateDoc) {
        return res.status(409).json({ error: 'gift-code-already-exists' });
      }

      const currentData = existingDoc.data() || {};
      const nextRevokedAt = isActive ? null : (normalizeOptionalString(currentData.revokedAt) || nowIso);

      await docRef.update({
        code,
        codeNormalized: code,
        amount,
        creditAmount: amount,
        kind: 'gift-credit',
        isActive,
        maxRedemptions,
        expiresAt: expiresAt || null,
        revokedAt: nextRevokedAt,
        updatedAt: nowIso,
      });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/admin/gift-codes/:id", adminMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      await db.collection(COLLECTIONS.GIFT_CODES).doc(id).delete();
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/credits/redeem-gift-code', authMiddleware, async (req, res) => {
    try {
      const userContext = (req as any).userContext;
      const userId = normalizeRequiredString(userContext?.uid, 'userId');
      const code = normalizeGiftCodeValue(req.body?.code);
      const nowIso = new Date().toISOString();

      const codeSnapshot = await db
        .collection(COLLECTIONS.GIFT_CODES)
        .where('codeNormalized', '==', code)
        .limit(1)
        .get();

      const fallbackSnapshot = codeSnapshot.empty
        ? await db.collection(COLLECTIONS.GIFT_CODES).where('code', '==', code).limit(1).get()
        : codeSnapshot;

      if (fallbackSnapshot.empty) {
        return res.status(404).json({ success: false, error: 'gift-code-invalid' });
      }

      const codeDoc = fallbackSnapshot.docs[0];
      const codeRef = codeDoc.ref;
      const redemptionEventId = crypto.createHash('sha256').update(`gift:${codeDoc.id}:${userId}`).digest('hex');
      const redemptionRef = db.collection(COLLECTIONS.GIFT_CODE_REDEMPTIONS).doc(redemptionEventId);
      const userRef = db.collection(COLLECTIONS.USERS).doc(userId);

      const redemptionResult = await db.runTransaction(async (tx) => {
        const [freshCodeSnap, userSnap, redemptionSnap] = await Promise.all([
          tx.get(codeRef),
          tx.get(userRef),
          tx.get(redemptionRef),
        ]);

        if (!freshCodeSnap.exists) {
          throw new Error('gift-code-invalid');
        }
        if (!userSnap.exists) {
          throw new Error('user-not-found');
        }

        const codeData = freshCodeSnap.data() || {};
        const userData = userSnap.data() || {};

        if (redemptionSnap.exists && String(redemptionSnap.data()?.status || '').toLowerCase() === 'redeemed') {
          return {
            amount: normalizeUserCredits(redemptionSnap.data()?.amount),
            creditsAfter: normalizeUserCredits(redemptionSnap.data()?.creditsAfter),
            alreadyRedeemed: true,
            eventId: redemptionEventId,
          };
        }

        const kind = normalizeOptionalString(codeData.kind) || 'gift-credit';
        if (kind !== 'gift-credit') {
          throw new Error('gift-code-type-mismatch');
        }

        const isActive = codeData.isActive !== false && !normalizeOptionalString(codeData.revokedAt);
        if (!isActive) {
          throw new Error('gift-code-inactive');
        }

        const expiresAt = normalizeOptionalString(codeData.expiresAt);
        if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
          throw new Error('gift-code-expired');
        }

        const amount = normalizeUserCredits(codeData.creditAmount ?? codeData.amount);
        if (amount <= 0) {
          throw new Error('gift-code-invalid-amount');
        }

        const maxRedemptions = Math.max(1, normalizeUserCredits(codeData.maxRedemptions ?? 1));
        const redemptionCount = normalizeUserCredits(
          codeData.redemptionCount ?? (Array.isArray(codeData.redeemedBy) ? codeData.redeemedBy.length : 0)
        );

        if (Array.isArray(codeData.redeemedBy) && codeData.redeemedBy.includes(userId)) {
          throw new Error('gift-code-already-used-by-user');
        }

        if (redemptionCount >= maxRedemptions) {
          throw new Error('gift-code-fully-redeemed');
        }

        const currentCredits = normalizeUserCredits(userData.credits);
        const nextCredits = currentCredits + amount;
        const nextRedemptionCount = redemptionCount + 1;
        const shouldDeactivate = nextRedemptionCount >= maxRedemptions;

        /**
         * ARCHITECTURE SAFETY NOTE (Gift Credits)
         * ------------------------------------------------------------------
         * Gift-code credit grants are isolated from entitlement code flows.
         * We atomically update the user balance, code redemption counters,
         * and redemption event to keep grants idempotent and auditable.
         */
        tx.set(userRef, {
          credits: nextCredits,
          creditsUpdatedAt: nowIso,
          updatedAt: nowIso,
        }, { merge: true });

        tx.set(codeRef, {
          redeemedBy: admin.firestore.FieldValue.arrayUnion(userId),
          redemptionCount: nextRedemptionCount,
          isActive: shouldDeactivate ? false : codeData.isActive !== false,
          lastRedeemedAt: nowIso,
          updatedAt: nowIso,
        }, { merge: true });

        tx.set(redemptionRef, {
          userId,
          codeId: codeDoc.id,
          code,
          status: 'redeemed',
          amount,
          creditsBefore: currentCredits,
          creditsAfter: nextCredits,
          createdAt: nowIso,
          updatedAt: nowIso,
          source: 'gift-code',
        }, { merge: true });

        return {
          amount,
          creditsAfter: nextCredits,
          alreadyRedeemed: false,
          eventId: redemptionEventId,
        };
      });

      if (!redemptionResult.alreadyRedeemed && redemptionResult.amount > 0) {
        try {
          await communicationService.dispatchInternalMessage({
            userId,
            type: 'notification',
            purpose: 'gift-code',
            title: 'Credits Added',
            message: `Gift code redeemed. ${redemptionResult.amount} credits were added to your balance.`,
            notes: `source:gift-code;event:${redemptionResult.eventId}`,
          });
        } catch (notificationError) {
          logDiagnostic('warn', 'credits.gift_notification_failed', {
            area: 'credits',
            stage: 'api/credits/redeem-gift-code',
            userId,
            details: normalizeError(notificationError),
          });
        }
      }

      return res.json({
        success: true,
        amount: redemptionResult.amount,
        creditsAfter: redemptionResult.creditsAfter,
        alreadyRedeemed: redemptionResult.alreadyRedeemed,
        eventId: redemptionResult.eventId,
      });
    } catch (error: any) {
      const code = normalizeOptionalString(error?.message) || 'gift-code-redeem-failed';
      const status =
        code === 'user-not-found' ? 404 :
        code === 'gift-code-invalid' ? 404 :
        code === 'gift-code-expired' ? 410 :
        code === 'gift-code-already-used-by-user' ? 409 :
        code === 'gift-code-fully-redeemed' ? 409 :
        code === 'gift-code-inactive' ? 409 :
        code === 'gift-code-type-mismatch' ? 400 :
        code === 'gift-code-invalid-amount' ? 400 :
        500;

      return res.status(status).json({ success: false, error: code });
    }
  });

  app.post('/api/credits/consume-success', authMiddleware, async (req, res) => {
    try {
      const userContext = (req as any).userContext;
      const userId = normalizeRequiredString(userContext?.uid, 'userId');
      const operationId = normalizeFastAccessOperationId(req.body?.operationId, `client-${Date.now()}`);
      const toolId = normalizeRequiredString(req.body?.toolId, 'toolId');
      const modelId = normalizeRequiredString(req.body?.modelId, 'modelId');
      const traceId = normalizeOptionalString(req.body?.traceId) || createTraceId('client-credit');
      const resultTextLength = Math.max(0, Math.floor(Number(req.body?.resultTextLength) || 0));
      const promptHash = normalizeOptionalString(req.body?.promptHash) || 'client-reported-success';

      const userDoc = await db.collection(COLLECTIONS.USERS).doc(userId).get();
      if (!userDoc.exists) {
        return res.status(404).json({ success: false, error: 'user-not-found' });
      }

      const userData = userDoc.data() as Record<string, any>;
      const isAdmin = String(userData?.role || '').toLowerCase() === 'admin';
      if (isAdmin) {
        return res.json({
          success: true,
          operationId,
          standardCreditDebited: false,
          standardCreditsRemaining: null,
          fastAccessCreditDebited: false,
          fastAccessCreditsRemaining: null,
          idempotentReplay: true,
        });
      }

      const isTemporaryFastAccessUser = isFacultyFastAccessScopedUser(userData);
      if (isTemporaryFastAccessUser) {
        if (!FACULTY_FAST_ACCESS_ALLOWED_TOOL_IDS.includes(toolId as any)) {
          return res.status(403).json({ success: false, error: 'FAST_ACCESS_TOOL_LOCKED' });
        }

        const deduction = await applyFastAccessCreditDeduction({
          userId,
          operationId,
          traceId,
          toolId,
          modelId,
          promptHash,
          fallbackHappened: false,
          usage: undefined,
          resultTextLength,
        });

        if (!deduction.applied && !deduction.alreadyApplied && deduction.reason === 'insufficient') {
          return res.status(402).json({ success: false, error: 'FAST_ACCESS_CREDITS_EXHAUSTED' });
        }

        return res.json({
          success: true,
          operationId,
          fastAccessCreditDebited: deduction.applied,
          fastAccessCreditsRemaining: deduction.remainingCredits,
          standardCreditDebited: false,
          standardCreditsRemaining: null,
          idempotentReplay: deduction.alreadyApplied,
        });
      }

      const deduction = await applyStandardCreditDeduction({
        userId,
        operationId,
        traceId,
        toolId,
        modelId,
        promptHash,
        fallbackHappened: false,
        usage: undefined,
        resultTextLength,
      });

      if (!deduction.applied && !deduction.alreadyApplied && deduction.reason === 'insufficient') {
        return res.status(402).json({ success: false, error: 'STANDARD_CREDITS_EXHAUSTED' });
      }

      return res.json({
        success: true,
        operationId,
        standardCreditDebited: deduction.applied,
        standardCreditsRemaining: deduction.remainingCredits,
        fastAccessCreditDebited: false,
        fastAccessCreditsRemaining: null,
        idempotentReplay: deduction.alreadyApplied,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: normalizeOptionalString(error?.message) || 'credit-finalization-failed' });
    }
  });

  // Communication Dispatch Endpoints
  app.post("/api/admin/communications/internal", adminMiddleware, async (req, res) => {
    try {
      const { userId, type, purpose, title, message, code, notes } = req.body;
      const id = await communicationService.dispatchInternalMessage({
        userId, type, purpose, title, message, code, notes
      });
      res.json({ success: true, id });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * SECURITY BOUNDARY (Admin API Isolation)
   * ------------------------------------------------------------------
   * Normal user registration flow must call user-scoped endpoints.
   * Admin-prefixed routes are reserved for admin middleware only.
   */
  app.post("/api/users/notify-admin-of-new-user", authMiddleware, async (req, res) => {
    try {
      const { userId } = req.body;
      const actor = (req as any).userContext;

      const normalizedUserId = normalizeRequiredString(userId, 'userId');

      // Only the same authenticated user (or admin) can trigger this registration notification.
      const actorIsAdmin = String(actor?.role || '').toLowerCase() === 'admin' || !!actor?.isAdmin;
      if (actor?.uid !== normalizedUserId && !actorIsAdmin) {
        return res.status(403).json({ success: false, error: 'Forbidden: identity mismatch' });
      }

      const targetUserDoc = await db.collection(COLLECTIONS.USERS).doc(normalizedUserId).get();
      if (!targetUserDoc.exists) {
        return res.status(404).json({ success: false, error: 'User profile not found' });
      }

      const targetUser = targetUserDoc.data() || {};
      const normalizedEmail = normalizeRequiredString(targetUser.email, 'user.email').toLowerCase();
      const normalizedName = normalizeRequiredString(targetUser.name, 'user.name');
      const normalizedUsername = normalizeOptionalString(targetUser.username) || '';

      if (String(targetUser.status || '').toLowerCase() !== 'pendingadminapproval') {
        return res.status(400).json({ success: false, error: 'User is not pending admin approval' });
      }
      
      const adminRecipients = await resolveAdminRecipients(db);
      const internalDispatches = adminRecipients.userIds.map((adminId) =>
        communicationService.dispatchInternalMessage({
          userId: adminId,
          inboxType: 'admin',
          type: 'notification',
          purpose: 'new-user-approval',
          title: 'New User Registration Awaiting Approval',
          message: `A new user has registered and verified their email.\n\nName: ${normalizedName}\nEmail: ${normalizedEmail}\nUsername: ${normalizedUsername}\n\nPlease review their account in the Admin Panel.`,
        })
      );

      const internalResults = await Promise.allSettled(internalDispatches);
      const internalFailures = internalResults.filter((result) => result.status === 'rejected').length;

      if (process.env.EMAIL_USER && process.env.EMAIL_PASS && adminRecipients.emails.length > 0) {
        try {
          await transporter.sendMail({
            from: process.env.EMAIL_FROM || `"Zootopia Club" <${process.env.EMAIL_USER}>`,
            to: adminRecipients.emails,
            subject: 'New User Registration Awaiting Approval - Zootopia Club',
            html: `
              <h2>New User Registration</h2>
              <p>A new user has registered and verified their email. They are currently awaiting your approval to access the platform.</p>
              <ul>
                <li><strong>Name:</strong> ${normalizedName}</li>
                <li><strong>Email:</strong> ${normalizedEmail}</li>
                <li><strong>Username:</strong> ${normalizedUsername}</li>
                <li><strong>Date:</strong> ${new Date().toLocaleString()}</li>
              </ul>
              <p>Please log in to the Admin Panel to review and approve or reject this user.</p>
            `,
          });
        } catch (emailError) {
          logDiagnostic('warn', 'admin.new_user_notification_email_failed', {
            area: 'auth',
            stage: 'notify-new-user',
            details: normalizeError(emailError),
          });
        }
      }

      if (internalFailures === internalResults.length && internalResults.length > 0) {
        return res.status(500).json({ success: false, error: 'Failed to notify admin inbox recipients' });
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error notifying admin of new user:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Admin-only operational variant kept for compatibility with admin tooling.
  app.post("/api/admin/notify-new-user", adminMiddleware, async (req, res) => {
    try {
      const { userId } = req.body;
      const normalizedUserId = normalizeRequiredString(userId, 'userId');

      const targetUserDoc = await db.collection(COLLECTIONS.USERS).doc(normalizedUserId).get();
      if (!targetUserDoc.exists) {
        return res.status(404).json({ success: false, error: 'User profile not found' });
      }

      const targetUser = targetUserDoc.data() || {};
      const normalizedEmail = normalizeRequiredString(targetUser.email, 'user.email').toLowerCase();
      const normalizedName = normalizeRequiredString(targetUser.name, 'user.name');
      const normalizedUsername = normalizeOptionalString(targetUser.username) || '';

      if (String(targetUser.status || '').toLowerCase() !== 'pendingadminapproval') {
        return res.status(400).json({ success: false, error: 'User is not pending admin approval' });
      }

      const adminRecipients = await resolveAdminRecipients(db);
      const internalDispatches = adminRecipients.userIds.map((adminId) =>
        communicationService.dispatchInternalMessage({
          userId: adminId,
          inboxType: 'admin',
          type: 'notification',
          purpose: 'new-user-approval',
          title: 'New User Registration Awaiting Approval',
          message: `A new user has registered and verified their email.\n\nName: ${normalizedName}\nEmail: ${normalizedEmail}\nUsername: ${normalizedUsername}\n\nPlease review their account in the Admin Panel.`,
        })
      );

      const internalResults = await Promise.allSettled(internalDispatches);
      const internalFailures = internalResults.filter((result) => result.status === 'rejected').length;

      if (process.env.EMAIL_USER && process.env.EMAIL_PASS && adminRecipients.emails.length > 0) {
        try {
          await transporter.sendMail({
            from: process.env.EMAIL_FROM || `"Zootopia Club" <${process.env.EMAIL_USER}>`,
            to: adminRecipients.emails,
            subject: 'New User Registration Awaiting Approval - Zootopia Club',
            html: `
              <h2>New User Registration</h2>
              <p>A new user has registered and verified their email. They are currently awaiting your approval to access the platform.</p>
              <ul>
                <li><strong>Name:</strong> ${normalizedName}</li>
                <li><strong>Email:</strong> ${normalizedEmail}</li>
                <li><strong>Username:</strong> ${normalizedUsername}</li>
                <li><strong>Date:</strong> ${new Date().toLocaleString()}</li>
              </ul>
              <p>Please log in to the Admin Panel to review and approve or reject this user.</p>
            `,
          });
        } catch (emailError) {
          logDiagnostic('warn', 'admin.new_user_notification_email_failed', {
            area: 'auth',
            stage: 'notify-new-user',
            details: normalizeError(emailError),
          });
        }
      }

      if (internalFailures === internalResults.length && internalResults.length > 0) {
        return res.status(500).json({ success: false, error: 'Failed to notify admin inbox recipients' });
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error notifying admin of new user:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/admin/notify-user-status", adminMiddleware, async (req, res) => {
    try {
      const { userId, email, name, status, reason } = req.body;
      await notifyUserStatusChange(
        normalizeRequiredString(userId, 'userId'),
        normalizeRequiredString(email, 'email'),
        normalizeRequiredString(name, 'name'),
        normalizeRequiredString(status, 'status'),
        normalizeOptionalString(reason),
        communicationService,
        transporter
      );

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error notifying user of status change:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Secrets Endpoints
  app.get("/api/admin/secret-codes", adminMiddleware, async (req, res) => {
    try {
      const snapshot = await db.collection(COLLECTIONS.SECRET_CODES).orderBy('createdAt', 'desc').get();
      const codes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(codes);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/secrets/send", adminMiddleware, async (req, res) => {
    try {
      const { deliveryChannel, recipient, code, notes } = req.body;
      const normalizedDeliveryChannel = normalizeRequiredString(deliveryChannel, 'deliveryChannel');
      const normalizedRecipient = normalizeRequiredString(recipient, 'recipient');
      const normalizedCode = normalizeRequiredString(code, 'code');
      const normalizedNotes = normalizeOptionalString(notes);
      
      // Log the issuance
      const secretRef = await db.collection(COLLECTIONS.SECRET_CODES).add({
        code: normalizedCode,
        recipient: normalizedRecipient,
        deliveryChannel: normalizedDeliveryChannel,
        notes: normalizedNotes,
        issuedBy: (req as any).userContext.uid,
        createdAt: new Date().toISOString()
      });

      // Send the code
      if (normalizedDeliveryChannel === 'email') {
        await communicationService.dispatchEmail({
          recipientEmails: [normalizedRecipient],
          subject: 'Your Zootopia Club Secret Code',
          body: `<p>Your secret code is: <strong>${normalizedCode}</strong></p><p>Notes: ${normalizedNotes || ''}</p>`,
          purpose: 'secret_code'
        });
      } else if (normalizedDeliveryChannel === 'internal') {
        await communicationService.dispatchInternalMessage({
          userId: normalizedRecipient,
          type: 'message',
          purpose: 'secret_code',
          title: 'Your Secret Code',
          message: `Your secret code is: ${normalizedCode}. Notes: ${normalizedNotes || ''}`,
          code: normalizedCode
        });
      } else {
        return res.status(400).json({ success: false, error: 'deliveryChannel must be email or internal' });
      }

      res.json({ success: true, id: secretRef.id });
    } catch (error: any) {
      console.error("Error sending secret code:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/secrets/issue-code", adminMiddleware, async (req, res) => {
    try {
      const { code, userId, purpose, expiresAt, maxUsage } = req.body;
      const normalizedCode = normalizeRequiredString(code, 'code');
      const normalizedUserId = normalizeRequiredString(userId, 'userId');
      const normalizedPurpose = normalizeOptionalString(purpose) || 'unlock_secrets';
      const normalizedExpiresAt = normalizeOptionalIsoDate(expiresAt, 'expiresAt') || null;
      const normalizedMaxUsage = parseOptionalPositiveInt(maxUsage, 'maxUsage') || 1;

      await db.collection(COLLECTIONS.SECRET_CODES).add({
        code: normalizedCode,
        userId: normalizedUserId,
        purpose: normalizedPurpose,
        status: 'active',
        expiresAt: normalizedExpiresAt,
        maxUsage: normalizedMaxUsage,
        usageCount: 0,
        issuedBy: (req as any).userContext.uid,
        createdAt: new Date().toISOString()
      });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/secrets/verify-code", async (req, res) => {
    try {
      const { code, userId } = req.body;
      const normalizedCode = normalizeRequiredString(code, 'code');
      const normalizedUserId = normalizeRequiredString(userId, 'userId');
      const idToken = req.headers.authorization?.split('Bearer ')[1];
      if (!idToken) return res.status(401).json({ error: "Unauthorized" });
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      if (decodedToken.uid !== normalizedUserId) return res.status(403).json({ error: "Forbidden" });

      const snapshot = await db.collection(COLLECTIONS.SECRET_CODES)
        .where('code', '==', normalizedCode)
        .where('userId', '==', normalizedUserId)
        .where('status', '==', 'active')
        .get();

      if (snapshot.empty) {
        return res.status(400).json({ success: false, error: "Invalid or expired code" });
      }

      const codeDoc = snapshot.docs[0];
      const codeData = codeDoc.data();

      if (codeData.expiresAt && new Date(codeData.expiresAt) < new Date()) {
        await codeDoc.ref.update({ status: 'expired' });
        return res.status(400).json({ success: false, error: "Code expired" });
      }

      if (codeData.usageCount >= codeData.maxUsage) {
        await codeDoc.ref.update({ status: 'used' });
        return res.status(400).json({ success: false, error: "Code already used" });
      }

      // Grant credits
      await userService.grantCredits(normalizedUserId, 33);

      // Update code status
      await codeDoc.ref.update({
        usageCount: codeData.usageCount + 1,
        status: (codeData.usageCount + 1) >= codeData.maxUsage ? 'used' : 'active'
      });

      // Log access
      await db.collection(COLLECTIONS.SECRET_ACCESS_LOGS).add({
        userId: normalizedUserId,
        codeId: codeDoc.id,
        timestamp: new Date().toISOString()
      });

      res.json({ success: true, message: 'Code verified and credits granted' });
    } catch (error: any) {
      res.status(500).json({ success: false, error: "Verification failed" });
    }
  });

  app.get('/api/admin/refunds', adminMiddleware, async (req, res) => {
    try {
      const [refundSnapshot, paidTxSnapshot] = await Promise.all([
        db.collection(COLLECTIONS.REFUNDS).orderBy('createdAt', 'desc').limit(200).get(),
        db.collection('transactions').where('status', '==', 'paid').orderBy('updatedAt', 'desc').limit(100).get(),
      ]);

      const refunds = refundSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const refundableTransactions = paidTxSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      res.json({ success: true, refunds, refundableTransactions });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch refunds' });
    }
  });

  app.post('/api/admin/refunds', adminMiddleware, async (req, res) => {
    try {
      const transactionId = normalizeRequiredString(req.body?.transactionId, 'transactionId');
      const amountCents = Number(req.body?.amountCents);
      const reasonCode = normalizeRequiredString(req.body?.reasonCode, 'reasonCode').toLowerCase();
      const reasonDetails = normalizeOptionalString(req.body?.reasonDetails);

      if (!ALLOWED_REFUND_REASON_CODES.has(reasonCode)) {
        return res.status(400).json({
          success: false,
          error: `Unsupported reasonCode. Allowed: ${Array.from(ALLOWED_REFUND_REASON_CODES).join(', ')}`,
        });
      }

      if (reasonCode === 'other_custom' && !reasonDetails) {
        return res.status(400).json({ success: false, error: 'reasonDetails is required when reasonCode=other_custom' });
      }

      const reason = reasonDetails ? `${reasonCode}: ${reasonDetails}` : reasonCode;

      if (!Number.isFinite(amountCents) || amountCents <= 0) {
        return res.status(400).json({ success: false, error: 'amountCents must be a positive number' });
      }
      
      // Call billingService to initiate refund
      const result = await billingService.refund(transactionId, amountCents, reason);

      if (!result.success) {
        return res.status(400).json(result);
      }
      
      res.json(result);
    } catch (error: any) {
      console.error("Error initiating refund:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Monitoring Endpoints
  const activeOperations = new Map<string, any>();

  app.get("/api/admin/monitoring/active-operations", adminMiddleware, (req, res) => {
    res.json(Array.from(activeOperations.values()));
  });

  app.get("/api/admin/monitoring/provider-usage", adminMiddleware, async (req, res) => {
    try {
      // Placeholder: Fetch usage from Firestore
      const snapshot = await db.collection(COLLECTIONS.PROVIDER_USAGE).get();
      const usage = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(usage);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/monitoring/stored-results", adminMiddleware, async (req, res) => {
    try {
      // Placeholder: Fetch stored results from Firestore
      const snapshot = await db.collection(COLLECTIONS.RESULTS).get();
      const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/admin/monitoring/stored-results/:id", adminMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      await db.collection(COLLECTIONS.RESULTS).doc(id).delete();
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/email/templates", adminMiddleware, async (req, res) => {
    try {
      const snapshot = await db.collection(COLLECTIONS.EMAIL_TEMPLATES).get();
      const templates = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(templates);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/email/templates", adminMiddleware, async (req, res) => {
    try {
      const { name, type, subject, htmlContent, dynamicFields } = req.body;
      const ref = await db.collection(COLLECTIONS.EMAIL_TEMPLATES).add({
        name, type, subject, htmlContent, dynamicFields, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
      res.json({ id: ref.id });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/admin/email/templates/:id", adminMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const { name, type, subject, htmlContent, dynamicFields } = req.body;
      await db.collection(COLLECTIONS.EMAIL_TEMPLATES).doc(id).update({
        name, type, subject, htmlContent, dynamicFields, updatedAt: new Date().toISOString()
      });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/admin/email/templates/:id", adminMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      await db.collection(COLLECTIONS.EMAIL_TEMPLATES).doc(id).delete();
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/email/send", adminMiddleware, async (req, res) => {
    try {
      const { templateId, recipientEmails, dynamicData } = req.body;
      const templateDoc = await db.collection(COLLECTIONS.EMAIL_TEMPLATES).doc(templateId).get();
      if (!templateDoc.exists) return res.status(404).json({ error: "Template not found" });
      
      const templateData = templateDoc.data()!;
      const template = Handlebars.compile(templateData.htmlContent);
      const html = template(dynamicData);

      await communicationService.dispatchEmail({
        recipientEmails,
        subject: templateData.subject,
        body: html,
        purpose: 'template_dispatch',
        templateId
      });

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/email/send-unified", adminMiddleware, async (req, res) => {
    try {
      const { templateId, recipientEmails, subject, body, dynamicData, purpose } = req.body;
      
      let finalSubject = subject;
      let finalHtml = body;

      if (templateId) {
        const templateDoc = await db.collection(COLLECTIONS.EMAIL_TEMPLATES).doc(templateId).get();
        if (!templateDoc.exists) return res.status(404).json({ error: "Template not found" });
        
        const templateData = templateDoc.data()!;
        finalSubject = templateData.subject || templateData.title || subject;
        const template = Handlebars.compile(templateData.body);
        finalHtml = template(dynamicData || {});
      } else if (!body) {
        return res.status(400).json({ error: "Either templateId or body is required" });
      }

      await communicationService.dispatchEmail({
        recipientEmails,
        subject: finalSubject,
        body: finalHtml,
        purpose: purpose || 'unified_dispatch',
        templateId
      });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/email/logs", adminMiddleware, async (req, res) => {
    try {
      const snapshot = await db.collection(COLLECTIONS.EMAIL_DELIVERY_LOGS).orderBy('sentAt', 'desc').get();
      const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/admin/accounts', adminMiddleware, adminAccountsRateLimiter, async (req, res) => {
    try {
      const requester = (req as any).userContext;
      const includeDeleted = String(req.query.includeDeleted || '').toLowerCase() === 'true';
      const search = normalizeOptionalString(req.query.search)?.toLowerCase();
      const scope = normalizeOptionalString(req.query.scope)?.toLowerCase();
      const linkage = normalizeOptionalString(req.query.linkage)?.toLowerCase();
      const provider = normalizeOptionalString(req.query.provider)?.toLowerCase();
      const status = normalizeOptionalString(req.query.status)?.toLowerCase();

      const directory = await listAdminAccountDirectory({
        db,
        auth: admin.auth(),
        usersCollection: COLLECTIONS.USERS,
        fastAccessAccountsCollection: COLLECTIONS.FACULTY_FAST_ACCESS_ACCOUNTS,
        fastAccessDeletionAuditsCollection: COLLECTIONS.FACULTY_FAST_ACCESS_DELETION_AUDITS,
        includeDeleted,
      });

      let accounts = directory.accounts;

      if (search) {
        accounts = accounts.filter((account) => {
          const searchable = [
            account.name,
            account.email,
            account.username,
            account.phoneNumber,
            account.id,
            account.role,
            account.accountScope,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

          return searchable.includes(search);
        });
      }

      if (scope && scope !== 'all') {
        accounts = accounts.filter((account) => {
          if (scope === 'temporary-fast-access') {
            return account.isTemporaryAccess === true || account.accountScope === FACULTY_FAST_ACCESS_SCOPE;
          }

          if (scope === 'full-account') {
            return !(account.isTemporaryAccess === true || account.accountScope === FACULTY_FAST_ACCESS_SCOPE);
          }

          if (scope === 'admin') {
            return account.role === 'Admin';
          }

          return true;
        });
      }

      if (linkage && linkage !== 'all') {
        accounts = accounts.filter((account) => {
          if (linkage === 'issues') {
            return account.accountLinkage.issues.length > 0;
          }

          return account.accountLinkage.linkageStatus === linkage;
        });
      }

      if (provider && provider !== 'all') {
        accounts = accounts.filter((account) =>
          account.accountLinkage.providerIds.some((providerId) => providerId.toLowerCase() === provider)
        );
      }

      if (status && status !== 'all') {
        accounts = accounts.filter((account) => account.status.toLowerCase() === status);
      }

      logDiagnostic('info', 'admin.account_directory.list_success', {
        area: 'admin',
        route: '/api/admin/accounts',
        userId: requester?.uid,
        stage: 'listAccounts',
        status: 'success',
        details: {
          accountCount: accounts.length,
          summary: directory.summary,
          includeDeleted,
          searchApplied: Boolean(search),
          scope: scope || 'all',
          linkage: linkage || 'all',
          provider: provider || 'all',
          statusFilter: status || 'all',
        },
      });

      res.json({
        success: true,
        accounts,
        summary: {
          ...directory.summary,
          filteredAccounts: accounts.length,
        },
      });
    } catch (error: any) {
      logDiagnostic('error', 'admin.account_directory.list_failed', {
        area: 'admin',
        route: '/api/admin/accounts',
        stage: 'listAccounts',
        details: normalizeError(error),
      });
      res.status(500).json({
        success: false,
        error: normalizeOptionalString(error?.message) || 'Failed to fetch account directory',
      });
    }
  });

  app.get("/api/admin/users", adminMiddleware, async (req, res) => {
    try {
      const includeDeleted = String(req.query.includeDeleted || '').toLowerCase() === 'true';
      const directory = await listAdminAccountDirectory({
        db,
        auth: admin.auth(),
        usersCollection: COLLECTIONS.USERS,
        fastAccessAccountsCollection: COLLECTIONS.FACULTY_FAST_ACCESS_ACCOUNTS,
        fastAccessDeletionAuditsCollection: COLLECTIONS.FACULTY_FAST_ACCESS_DELETION_AUDITS,
        includeDeleted,
      });
      const users = directory.accounts;
      res.json(users);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/admin/users', adminMiddleware, async (req, res) => {
    try {
      const requester = (req as any).userContext;
      const {
        email,
        password,
        name,
        username,
        role,
        status,
        adminLevel,
        plan,
        permissions,
        limits,
        credits,
        adminNotes,
      } = req.body || {};

      const normalizedEmail = normalizeRequiredString(email, 'email').toLowerCase();
      if (!isValidEmail(normalizedEmail)) {
        return res.status(400).json({ success: false, error: 'Invalid email format' });
      }

      if (password && String(password).length < 6) {
        return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
      }

      const normalizedRole = ALLOWED_USER_ROLES.has(String(role)) ? String(role) : 'User';
      if (normalizedRole === 'Admin' && !isPrimaryAdmin(requester)) {
        return res.status(403).json({ success: false, error: 'Only primary admin can create admin accounts' });
      }

      const normalizedStatus = ALLOWED_USER_STATUSES.has(String(status)) ? String(status) : 'PendingEmailVerification';
      const normalizedUsername = normalizeOptionalString(username);
      const normalizedName = normalizeOptionalString(name) || 'User';

      let authUser: admin.auth.UserRecord;
      try {
        authUser = await admin.auth().createUser({
          email: normalizedEmail,
          password: password ? String(password) : undefined,
          displayName: normalizedName,
          emailVerified: false,
          disabled: normalizedStatus === 'Blocked' || normalizedStatus === 'Suspended',
        });
      } catch (error: any) {
        return res.status(400).json({ success: false, error: error.message || 'Failed to create auth user' });
      }

      const now = new Date().toISOString();
      const userPayload = {
        id: authUser.uid,
        name: normalizedName,
        email: normalizedEmail,
        username: normalizedUsername || normalizedEmail.split('@')[0],
        usernameLower: (normalizedUsername || normalizedEmail.split('@')[0]).toLowerCase(),
        role: normalizedRole,
        adminLevel: normalizedRole === 'Admin' ? (normalizeOptionalString(adminLevel) || 'secondary') : null,
        plan: normalizeOptionalString(plan) || (normalizedRole === 'Admin' ? 'enterprise' : 'free'),
        status: normalizedStatus,
        firstLoginDate: now,
        lastLogin: now,
        createdAt: now,
        updatedAt: now,
        permissions: permissions || DEFAULT_USER_PERMISSIONS,
        limits: limits || DEFAULT_USER_LIMITS,
        usage: {
          aiRequestsToday: 0,
          quizGenerationsToday: 0,
          uploadsToday: 0,
          lastResetDate: new Date().toISOString().split('T')[0],
        },
        credits: Number.isFinite(Number(credits)) ? Number(credits) : (normalizedRole === 'Admin' ? 9999 : 5),
        totalUploads: 0,
        totalAIRequests: 0,
        totalQuizzes: 0,
        authProviders: password ? ['password'] : [],
        isVerified: false,
        adminNotes: normalizeOptionalString(adminNotes) || '',
      };

      await db.collection(COLLECTIONS.USERS).doc(authUser.uid).set(userPayload, { merge: true });

      if (normalizedRole === 'Admin') {
        await admin.auth().setCustomUserClaims(authUser.uid, {
          role: 'Admin',
          adminLevel: userPayload.adminLevel,
        });
      }

      await logAdminUserAction(db, requester.uid, 'Admin created user account', {
        targetUserId: authUser.uid,
        targetEmail: normalizedEmail,
        role: normalizedRole,
        status: normalizedStatus,
      });

      res.status(201).json({ success: true, user: userPayload });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Failed to create user' });
    }
  });

  app.patch('/api/admin/users/:userId', adminMiddleware, async (req, res) => {
    try {
      const requester = (req as any).userContext;
      const userId = normalizeRequiredString(req.params.userId, 'userId');
      const updates = req.body || {};
      const allowedKeys = [
        'name',
        'username',
        'email',
        'department',
        'academicYear',
        'phoneNumber',
        'dateOfBirth',
        'gender',
        'institution',
        'country',
        'nationality',
        'studyInterests',
        'picture',
        'plan',
        'credits',
        'permissions',
        'limits',
        'adminNotes',
        'status',
        'role',
        'adminLevel',
        'isVerified',
      ];

      const sanitizedUpdates: Record<string, unknown> = Object.fromEntries(
        Object.entries(updates).filter(([key, value]) => allowedKeys.includes(key) && value !== undefined)
      );

      if (Object.keys(sanitizedUpdates).length === 0) {
        return res.status(400).json({ success: false, error: 'No valid fields provided for update' });
      }

      const targetRef = db.collection(COLLECTIONS.USERS).doc(userId);
      const targetSnap = await targetRef.get();
      if (!targetSnap.exists) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      const targetUser = { id: targetSnap.id, ...targetSnap.data() };
      const manageCheck = canManageTargetUser(requester, targetUser);
      if (!manageCheck.allowed) {
        return res.status(manageCheck.code || 403).json({ success: false, error: manageCheck.message });
      }

      const fastAccessRouteMessage = rejectFastAccessTargetFromGenericAdminRoute(targetUser as Record<string, unknown>);
      if (fastAccessRouteMessage) {
        return res.status(409).json({ success: false, error: fastAccessRouteMessage });
      }

      if (sanitizedUpdates.email) {
        const normalizedEmail = String(sanitizedUpdates.email).trim().toLowerCase();
        if (!isValidEmail(normalizedEmail)) {
          return res.status(400).json({ success: false, error: 'Invalid email format' });
        }
        sanitizedUpdates.email = normalizedEmail;
        await admin.auth().updateUser(userId, { email: normalizedEmail });
      }

      if (sanitizedUpdates.username) {
        const normalizedUsername = String(sanitizedUpdates.username).trim();
        sanitizedUpdates.username = normalizedUsername;
        sanitizedUpdates.usernameLower = normalizedUsername.toLowerCase();
      }

      if (sanitizedUpdates.role) {
        const normalizedRole = String(sanitizedUpdates.role);
        if (!ALLOWED_USER_ROLES.has(normalizedRole)) {
          return res.status(400).json({ success: false, error: 'Invalid role value' });
        }
        if (normalizedRole === 'Admin' && !isPrimaryAdmin(requester)) {
          return res.status(403).json({ success: false, error: 'Only primary admin can assign admin role' });
        }
      }

      if (sanitizedUpdates.status) {
        const normalizedStatus = String(sanitizedUpdates.status);
        if (!ALLOWED_USER_STATUSES.has(normalizedStatus)) {
          return res.status(400).json({ success: false, error: 'Invalid status value' });
        }
        await admin.auth().updateUser(userId, {
          disabled: normalizedStatus === 'Blocked' || normalizedStatus === 'Suspended',
        });
      }

      if (sanitizedUpdates.credits !== undefined) {
        const numericCredits = Number(sanitizedUpdates.credits);
        if (!Number.isFinite(numericCredits) || numericCredits < 0) {
          return res.status(400).json({ success: false, error: 'Credits must be a non-negative number' });
        }
        sanitizedUpdates.credits = numericCredits;
      }

      if (sanitizedUpdates.role) {
        const nextRole = String(sanitizedUpdates.role);
        if (nextRole === 'Admin') {
          await admin.auth().setCustomUserClaims(userId, {
            role: 'Admin',
            adminLevel: normalizeOptionalString(sanitizedUpdates.adminLevel) || 'secondary',
          });
        } else {
          await admin.auth().setCustomUserClaims(userId, { role: 'User' });
          sanitizedUpdates.adminLevel = null;
        }
      }

      sanitizedUpdates.updatedAt = new Date().toISOString();

      await targetRef.set(sanitizedUpdates, { merge: true });

      await logAdminUserAction(db, requester.uid, 'Admin updated user account', {
        targetUserId: userId,
        updatedFields: Object.keys(sanitizedUpdates),
      });

      const updatedSnap = await targetRef.get();
      res.json({ success: true, user: { id: updatedSnap.id, ...updatedSnap.data() } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Failed to update user' });
    }
  });

  app.post('/api/admin/users/:userId/status', adminMiddleware, async (req, res) => {
    try {
      const requester = (req as any).userContext;
      const userId = normalizeRequiredString(req.params.userId, 'userId');
      const status = normalizeRequiredString(req.body?.status, 'status');
      const reason = normalizeOptionalString(req.body?.reason);
      const notifyUser = Boolean(req.body?.notifyUser ?? true);

      if (!ALLOWED_USER_STATUSES.has(status)) {
        return res.status(400).json({ success: false, error: 'Invalid status value' });
      }

      const targetRef = db.collection(COLLECTIONS.USERS).doc(userId);
      const targetSnap = await targetRef.get();
      if (!targetSnap.exists) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      const targetUser = { id: targetSnap.id, ...targetSnap.data() } as any;
      const manageCheck = canManageTargetUser(requester, targetUser);
      if (!manageCheck.allowed) {
        return res.status(manageCheck.code || 403).json({ success: false, error: manageCheck.message });
      }

      const fastAccessRouteMessage = rejectFastAccessTargetFromGenericAdminRoute(targetUser as Record<string, unknown>);
      if (fastAccessRouteMessage) {
        return res.status(409).json({ success: false, error: fastAccessRouteMessage });
      }

      const adminNotes = reason
        ? `${status} reason: ${reason}`
        : normalizeOptionalString(targetUser.adminNotes) || '';

      await targetRef.set(
        {
          status,
          isVerified: status === 'Active' ? true : targetUser.isVerified,
          adminNotes,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      await admin.auth().updateUser(userId, {
        disabled: status === 'Blocked' || status === 'Suspended',
      });

      if (notifyUser && targetUser.email) {
        await notifyUserStatusChange(
          userId,
          String(targetUser.email),
          String(targetUser.name || 'User'),
          status,
          reason,
          communicationService,
          transporter
        );
      }

      await logAdminUserAction(db, requester.uid, 'Admin changed user status', {
        targetUserId: userId,
        status,
        reason: reason || null,
      });

      const updatedSnap = await targetRef.get();
      res.json({ success: true, user: { id: updatedSnap.id, ...updatedSnap.data() } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Failed to update user status' });
    }
  });

  app.delete('/api/admin/users/:userId', adminMiddleware, async (req, res) => {
    try {
      const requester = (req as any).userContext;
      const userId = normalizeRequiredString(req.params.userId, 'userId');
      const mode = normalizeOptionalString(req.query.mode);

      const targetRef = db.collection(COLLECTIONS.USERS).doc(userId);
      const targetSnap = await targetRef.get();
      if (!targetSnap.exists) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      const targetUser = { id: targetSnap.id, ...targetSnap.data() } as any;
      const manageCheck = canManageTargetUser(requester, targetUser);
      if (!manageCheck.allowed) {
        return res.status(manageCheck.code || 403).json({ success: false, error: manageCheck.message });
      }

      const fastAccessRouteMessage = rejectFastAccessTargetFromGenericAdminRoute(targetUser as Record<string, unknown>);
      if (fastAccessRouteMessage) {
        return res.status(409).json({ success: false, error: fastAccessRouteMessage });
      }

      if (mode === 'hard' && isPrimaryAdmin(requester)) {
        await targetRef.delete();
        await admin.auth().deleteUser(userId);
      } else {
        await targetRef.set(
          {
            status: 'Blocked',
            isDeleted: true,
            deletedAt: new Date().toISOString(),
            deletedBy: requester.uid,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
        await admin.auth().updateUser(userId, { disabled: true });
      }

      await logAdminUserAction(db, requester.uid, 'Admin deleted user account', {
        targetUserId: userId,
        mode: mode === 'hard' && isPrimaryAdmin(requester) ? 'hard' : 'soft',
      });

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Failed to delete user' });
    }
  });

  // Notification endpoints
  app.post("/api/notifications/admin", authMiddleware, async (req, res) => {
    const { subject, message, userId, amount } = req.body;
    const actor = (req as any).userContext;
    const normalizedMessage = normalizeRequiredString(message, 'message');

    const normalizedUserId = normalizeOptionalString(userId);
    const actorIsAdmin = String(actor?.role || '').toLowerCase() === 'admin' || !!actor?.isAdmin;
    if (normalizedUserId && actor?.uid !== normalizedUserId && !actorIsAdmin) {
      return res.status(403).json({ success: false, error: 'Forbidden: identity mismatch' });
    }

    const adminRecipients = await resolveAdminRecipients(db);
    
    console.log(`[Admin Notification] User ${normalizedUserId || actor?.uid} requested ${amount} credits.`);

    try {
      const inboxDispatches = adminRecipients.userIds.map((adminId) =>
        communicationService.dispatchInternalMessage({
          userId: adminId,
          inboxType: 'admin',
          type: 'notification',
          purpose: 'user-request',
          title: subject || `New Credit Request: ${amount || 'N/A'} Credits`,
          message: normalizedMessage,
          notes: `requestedBy:${normalizedUserId || actor?.uid || 'unknown'}`,
        })
      );
      await Promise.allSettled(inboxDispatches);

      if (process.env.EMAIL_USER && process.env.EMAIL_PASS && adminRecipients.emails.length > 0) {
        await transporter.sendMail({
          from: process.env.EMAIL_FROM || `"Zootopia Club" <${process.env.EMAIL_USER}>`,
          to: adminRecipients.emails,
          subject: subject || `New Credit Request: ${amount} Credits`,
          text: normalizedMessage,
          html: `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
              <h2 style="color: #10b981;">New Credit Request</h2>
              <p>${normalizedMessage.replace(/\n/g, '<br>')}</p>
              <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
              <p style="font-size: 12px; color: #666;">© Zootopia Club Admin System</p>
            </div>
          `,
        });
      }
      res.json({ success: true, message: "Admin notified" });
    } catch (error) {
      console.error("Failed to send admin email:", error);
      res.status(500).json({ success: false, error: "Failed to send notification" });
    }
  });

  app.post("/api/notifications/user", adminMiddleware, async (req, res) => {
    const { userId, subject, message, userEmail } = req.body;
    
    console.log(`[User Notification] Notifying user ${userId}: ${subject}`);

    try {
      if (userId) {
        await communicationService.dispatchInternalMessage({
          userId: normalizeRequiredString(userId, 'userId'),
          type: 'notification',
          purpose: 'request-status',
          title: normalizeRequiredString(subject, 'subject'),
          message: normalizeRequiredString(message, 'message'),
        });
      }

      if (process.env.EMAIL_USER && process.env.EMAIL_PASS && userEmail) {
        await transporter.sendMail({
          from: process.env.EMAIL_FROM || `"Zootopia Club" <${process.env.EMAIL_USER}>`,
          to: userEmail,
          subject: `Zootopia Club: ${subject}`,
          text: message,
          html: `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
              <h2 style="color: #10b981;">Zootopia Club Update</h2>
              <p>${message.replace(/\n/g, '<br>')}</p>
              <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
              <p style="font-size: 12px; color: #666;">© Zootopia Club – AI Science Education Platform</p>
            </div>
          `,
        });
      }
      res.json({ success: true, message: "User notified" });
    } catch (error) {
      console.error("Failed to send user email:", error);
      res.status(500).json({ success: false, error: "Failed to send notification" });
    }
  });

  app.post('/api/ai/authorize-model', authMiddleware, async (req, res) => {
    try {
      const toolId = normalizeModelToolId(normalizeRequiredString(req.body?.toolId, 'toolId'));
      const requestedModelId = toCanonicalModelId(normalizeRequiredString(req.body?.modelId, 'modelId'));
      const requester = (req as any).userContext;
      const userId = normalizeRequiredString(requester?.uid, 'userContext.uid');
      const userSnap = await db.collection(COLLECTIONS.USERS).doc(userId).get();
      const userData = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : null;

      if (!userData) {
        return res.status(404).json({ success: false, error: 'user-not-found' });
      }

      const access = evaluateModelAccessForUser({
        userData,
        toolId,
        modelId: requestedModelId,
      });

      if (!access.allowed) {
        const structuredError = buildModelAccessStructuredError({
          traceId: createTraceId('ai-authorize'),
          toolId,
          requestedModelId,
          access,
        });

        return res.status(structuredError.category === 'validation' ? 400 : 403).json({
          success: false,
          error: structuredError.userMessage,
          errorInfo: structuredError,
          fallbackModelId: access.fallbackModelId || null,
          defaultModelIds: getDefaultAccessibleModelIdsForTool(toolId),
          unlockPriceEgp: MODEL_UNLOCK_PRICE_EGP,
        });
      }

      res.json({
        success: true,
        modelId: access.canonicalModelId,
        executionMode: access.executionMode,
        source: access.reasonCode,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, error: normalizeOptionalString(error?.message) || 'model-authorization-failed' });
    }
  });

  // AI Execution Route
  app.post("/api/ai/execute", async (req, res) => {
    const { 
      toolId,
      userPrompt,
      modelId,
      userPreferences,
      toolSettings,
      requestConfig,
      providerSettings,
      settings,
      fileContext,
      fileName,
      routingPath,
      promptTemplateGroup,
      providerFamily,
      additionalContext,
      selectedAssetSource,
      documentContextRef,
      directFileDispatch,
      operationId: incomingOperationId,
    } = req.body;

    const incomingTraceHeader = req.headers['x-trace-id'];
    const traceId = typeof incomingTraceHeader === 'string' && incomingTraceHeader.trim()
      ? incomingTraceHeader.trim()
      : createTraceId('ai-exec');

    const operationStartedAt = Date.now();
    // Backend trace timeline is authoritative for server/provider work.
    // Keep it sanitized and stage-based; never expose secrets or raw provider payloads
    // to the client trace UI.
    type BackendTraceStage = {
      id: string;
      label: string;
      status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
      startedAt?: string;
      endedAt?: string;
      durationMs?: number;
      message?: string;
      details?: Record<string, unknown>;
    };

    const backendTraceStages: BackendTraceStage[] = [
      { id: 'request_validation', label: 'Validating request', status: 'pending' },
      { id: 'prompt_orchestration', label: 'Orchestrating prompt', status: 'pending' },
      { id: 'model_resolution', label: 'Resolving model and provider', status: 'pending' },
      { id: 'provider_dispatch', label: 'Dispatching provider request', status: 'pending' },
      { id: 'provider_execution', label: 'Waiting for provider response', status: 'pending' },
      { id: 'usage_logging', label: 'Persisting usage metrics', status: 'pending' },
      { id: 'response_finalize', label: 'Finalizing response', status: 'pending' },
    ];

    const startBackendStage = (stageId: string, message?: string, details?: Record<string, unknown>) => {
      const stage = backendTraceStages.find(s => s.id === stageId);
      if (!stage) return;
      stage.status = 'running';
      stage.startedAt = new Date().toISOString();
      stage.message = message;
      if (details) stage.details = details;
    };

    const finishBackendStage = (
      stageId: string,
      status: BackendTraceStage['status'],
      message?: string,
      details?: Record<string, unknown>
    ) => {
      const stage = backendTraceStages.find(s => s.id === stageId);
      if (!stage) return;
      stage.status = status;
      stage.endedAt = new Date().toISOString();
      stage.message = message || stage.message;
      stage.details = { ...(stage.details || {}), ...(details || {}) };
      if (stage.startedAt && stage.endedAt) {
        stage.durationMs = new Date(stage.endedAt).getTime() - new Date(stage.startedAt).getTime();
      }
    };

    const classifyApiError = (rawError: unknown, failedStageId: string) => {
      const details = normalizeError(rawError);
      const message = String(details.message || 'Unexpected internal error');
      const lower = message.toLowerCase();

      let category: 'validation' | 'input' | 'auth' | 'permission' | 'network' | 'timeout' | 'provider' | 'routing' | 'cache' | 'parsing' | 'storage' | 'communication' | 'internal' = 'internal';
      let code = 'INTERNAL_ERROR';
      let userMessage = 'The request could not be completed. Please try again.';
      let retryable = false;

      if (lower.includes('required') || lower.includes('invalid') || lower.includes('validation')) {
        category = 'validation';
        code = 'VALIDATION_FAILED';
        userMessage = 'Some request values are invalid. Please review your input.';
      } else if (lower.includes('document_access_denied')) {
        category = 'permission';
        code = 'DOCUMENT_ACCESS_DENIED';
        userMessage = 'You do not have access to this document context.';
      } else if (lower.includes('direct_file_mode_disabled')) {
        category = 'validation';
        code = 'DIRECT_FILE_MODE_DISABLED';
        userMessage = 'Direct file-to-model mode is not enabled for this environment.';
      } else if (lower.includes('permission') || lower.includes('forbidden')) {
        category = 'permission';
        code = 'PERMISSION_DENIED';
        userMessage = 'You do not have permission to perform this operation.';
      } else if (lower.includes('auth') || lower.includes('unauthorized') || lower.includes('api key')) {
        category = 'auth';
        code = 'AUTHENTICATION_FAILED';
        userMessage = 'Authentication with the provider failed. Verify credentials and try again.';
      } else if (lower.includes('timeout')) {
        category = 'timeout';
        code = 'REQUEST_TIMEOUT';
        userMessage = 'The operation timed out while waiting for a provider response.';
        retryable = true;
      } else if (lower.includes('network') || lower.includes('failed to fetch') || lower.includes('socket') || lower.includes('econn')) {
        category = 'network';
        code = 'NETWORK_FAILURE';
        userMessage = 'A network issue interrupted the request. Please retry.';
        retryable = true;
      } else if (lower.includes('unsupported provider') || lower.includes('routing') || lower.includes('route')) {
        category = 'routing';
        code = 'ROUTING_FAILURE';
        userMessage = 'The request could not be routed to a compatible provider.';
      } else if (lower.includes('qwen') || lower.includes('gemini') || lower.includes('provider')) {
        category = 'provider';
        code = 'PROVIDER_FAILURE';
        userMessage = 'The AI provider failed to process the request.';
        retryable = true;
      } else if (lower.includes('document') || lower.includes('artifact')) {
        category = 'storage';
        code = 'DOCUMENT_RUNTIME_FAILURE';
        userMessage = 'The document runtime could not resolve the requested artifact.';
      } else if (lower.includes('json') || lower.includes('parse') || lower.includes('schema')) {
        category = 'parsing';
        code = 'PARSING_FAILURE';
        userMessage = 'The model response format was invalid and could not be parsed.';
      }

      return {
        category,
        code,
        message,
        userMessage,
        stage: failedStageId,
        traceId,
        retryable,
        details,
      };
    };

    const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
      return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    };

    const EXECUTION_REQUEST_CONFIG_KEYS = new Set([
      'temperature',
      'maxOutputTokens',
      'responseMimeType',
      'responseSchema',
      'systemInstruction',
    ]);

    const EXECUTION_PROVIDER_SETTING_KEYS = new Set([
      'topP',
      'topK',
      'presencePenalty',
      'seed',
      'enableThinking',
      'thinkingBudget',
      'enableSearch',
      'thinkingConfig',
    ]);

    const pickRecordKeys = (
      source: Record<string, unknown> | undefined,
      allowedKeys: Set<string>
    ): Record<string, unknown> | undefined => {
      if (!source) {
        return undefined;
      }

      const picked = Object.fromEntries(
        Object.entries(source).filter(([key, value]) => allowedKeys.has(key) && value !== undefined)
      );

      return Object.keys(picked).length > 0 ? picked : undefined;
    };

    const omitRecordKeys = (
      source: Record<string, unknown> | undefined,
      deniedKeys: Set<string>
    ): Record<string, unknown> | undefined => {
      if (!source) {
        return undefined;
      }

      const omitted = Object.fromEntries(
        Object.entries(source).filter(([key, value]) => !deniedKeys.has(key) && value !== undefined)
      );

      return Object.keys(omitted).length > 0 ? omitted : undefined;
    };

    const LEGACY_RESERVED_SETTING_KEYS = new Set([
      ...EXECUTION_REQUEST_CONFIG_KEYS,
      ...EXECUTION_PROVIDER_SETTING_KEYS,
    ]);

    // Accept the new separated payload shape, but also recover safely from the
    // legacy combined `settings` object so old clients do not lose prompt inputs.
    const legacySettings = isPlainRecord(settings) ? settings : undefined;
    const normalizedToolSettings = isPlainRecord(toolSettings)
      ? toolSettings
      : omitRecordKeys(legacySettings, LEGACY_RESERVED_SETTING_KEYS);
    const normalizedRequestConfig: Record<string, unknown> = {
      ...(pickRecordKeys(legacySettings, EXECUTION_REQUEST_CONFIG_KEYS) || {}),
      ...(isPlainRecord(requestConfig) ? requestConfig : {}),
    };
    const normalizedProviderSettings: Record<string, unknown> = {
      ...(pickRecordKeys(legacySettings, EXECUTION_PROVIDER_SETTING_KEYS) || {}),
      ...(isPlainRecord(providerSettings) ? providerSettings : {}),
    };
    const normalizedToolId = normalizeModelToolId(toolId || '');
    let normalizedModelId = toCanonicalModelId((modelId || '').trim());
    const normalizedSelectedAssetSource =
      selectedAssetSource && typeof selectedAssetSource === 'object'
        ? {
            assetId: normalizeOptionalString((selectedAssetSource as Record<string, unknown>).assetId) || null,
            sourceProvider: normalizeOptionalString((selectedAssetSource as Record<string, unknown>).sourceProvider) || null,
            sourceModelId: normalizeOptionalString((selectedAssetSource as Record<string, unknown>).sourceModelId) || null,
            sourceToolId: normalizeOptionalString((selectedAssetSource as Record<string, unknown>).sourceToolId) || null,
          }
        : null;
    const normalizedDocumentContextRef =
      documentContextRef && typeof documentContextRef === 'object'
        ? {
            documentId: normalizeOptionalString((documentContextRef as Record<string, unknown>).documentId) || null,
            artifactId: normalizeOptionalString((documentContextRef as Record<string, unknown>).artifactId) || null,
            pathway: normalizeDocumentProcessingPathway((documentContextRef as Record<string, unknown>).pathway),
            documentRevision: Number.isFinite(Number((documentContextRef as Record<string, unknown>).documentRevision))
              ? Number((documentContextRef as Record<string, unknown>).documentRevision)
              : null,
            fileName: normalizeOptionalString((documentContextRef as Record<string, unknown>).fileName) || null,
          }
        : null;
    const normalizedDirectFileDispatch =
      directFileDispatch && typeof directFileDispatch === 'object'
        ? {
            mode: normalizeOptionalString((directFileDispatch as Record<string, unknown>).mode) || null,
            pathway: normalizeDocumentProcessingPathway((directFileDispatch as Record<string, unknown>).pathway),
            userPreferences:
              normalizeOptionalString((directFileDispatch as Record<string, unknown>).userPreferences) || null,
          }
        : null;

    // Phase 1A scaffolding: report non-canonical unlock contract values without
    // altering runtime behavior. Full enforcement is introduced in later phases.
    const contractWarnings = collectContractWarnings({
      toolId: normalizedToolId,
      amountEgp: req.body?.amountEgp,
      currency: req.body?.currency,
    });
    if (contractWarnings.length > 0) {
      logDiagnostic('warn', 'contracts.ai_execute_noncanonical_input', {
        area: 'contracts',
        stage: 'api/ai/execute',
        toolId: normalizedToolId,
        details: {
          warnings: contractWarnings,
          canonicalUnlockEligibleToolIds: CANONICAL_UNLOCK_ELIGIBLE_TOOL_IDS,
          canonicalUnlockPriceEgp: CANONICAL_UNLOCK_PRICE_EGP,
        },
      });
    }

    let callerUid: string | null = null;
    const authorizationHeader = req.headers.authorization;
    if (authorizationHeader?.startsWith('Bearer ')) {
      const token = authorizationHeader.slice('Bearer '.length).trim();
      if (token) {
        try {
          const decoded = await admin.auth().verifyIdToken(token);
          callerUid = decoded.uid;
        } catch {
          const structuredError = {
            category: 'auth',
            code: 'INVALID_AUTH_TOKEN',
            message: 'Invalid bearer token',
            userMessage: 'Session is invalid. Please sign in again.',
            stage: 'request_validation',
            traceId,
            retryable: false,
          };
          return res.status(401).json({
            success: false,
            error: structuredError.userMessage,
            errorInfo: structuredError,
            traceId,
          });
        }
      }
    }

    const bodyUserId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
    if (bodyUserId && !callerUid) {
      const structuredError = {
        category: 'auth',
        code: 'AUTH_REQUIRED_FOR_USER_CONTEXT',
        message: 'A bearer token is required when userId is provided',
        userMessage: 'Session is required to run this operation.',
        stage: 'request_validation',
        traceId,
        retryable: false,
      };

      return res.status(401).json({
        success: false,
        error: structuredError.userMessage,
        errorInfo: structuredError,
        traceId,
      });
    }

    if (callerUid && bodyUserId && callerUid !== bodyUserId) {
      const structuredError = {
        category: 'permission',
        code: 'USER_CONTEXT_MISMATCH',
        message: 'Token user ID does not match request body user ID',
        userMessage: 'Access denied for this request context.',
        stage: 'request_validation',
        traceId,
        retryable: false,
      };
      return res.status(403).json({
        success: false,
        error: structuredError.userMessage,
        errorInfo: structuredError,
        traceId,
      });
    }

    const effectiveUserId = callerUid || bodyUserId;
    const normalizedOperationId = normalizeFastAccessOperationId(incomingOperationId, traceId);
    const promptHash = crypto.createHash('sha256').update(String(userPrompt || '')).digest('hex');

    /**
     * SECURITY CRITICAL (Execution Ownership)
     * ------------------------------------------------------------------
     * Model routing and entitlement enforcement require a real account context.
     * Do not allow anonymous execution here, otherwise callers can bypass the
     * selector/entitlement pipeline by hitting the backend directly.
     */
    if (!effectiveUserId) {
      const structuredError = {
        category: 'auth',
        code: 'AUTH_REQUIRED_FOR_AI_EXECUTION',
        message: 'Authenticated user context is required for model execution',
        userMessage: 'Please sign in again before using AI tools.',
        stage: 'request_validation',
        traceId,
        retryable: false,
      };

      return res.status(401).json({
        success: false,
        error: structuredError.userMessage,
        errorInfo: structuredError,
        traceId,
      });
    }

    if (!normalizedModelId) {
      const structuredError = {
        category: 'validation',
        code: 'MODEL_ID_REQUIRED',
        message: 'Model ID is required',
        userMessage: 'Please select a model before running this tool.',
        stage: 'request_validation',
        traceId,
        retryable: false,
      };
      return res.status(400).json({ success: false, error: structuredError.userMessage, errorInfo: structuredError, traceId });
    }
    if (!normalizedToolId) {
      const structuredError = {
        category: 'validation',
        code: 'TOOL_ID_REQUIRED',
        message: 'Tool ID is required',
        userMessage: 'The selected operation is invalid. Please retry from the tool page.',
        stage: 'request_validation',
        traceId,
        retryable: false,
      };
      return res.status(400).json({ success: false, error: structuredError.userMessage, errorInfo: structuredError, traceId });
    }

    let shouldApplyFastAccessCredit = false;
    let fastAccessCreditAlreadyApplied = false;
    let shouldApplyStandardCredit = false;
    let standardCreditAlreadyApplied = false;
    let effectiveUserData: Record<string, any> | null = null;

    /**
     * ARCHITECTURE SAFETY NOTE (Temporary Account Enforcement)
     * ------------------------------------------------------------------
     * Temporary Faculty fast-access users are restricted to a strict subset of
     * tool IDs. Keep this backend-enforced to prevent direct API bypasses.
     * Frontend locks are UX only and must stay aligned with this guard.
     */
    if (effectiveUserId) {
      const userDoc = await db.collection(COLLECTIONS.USERS).doc(effectiveUserId).get();
      effectiveUserData = userDoc.exists ? (userDoc.data() as Record<string, any>) : null;
      if (!effectiveUserData) {
        const structuredError = {
          category: 'auth',
          code: 'USER_RECORD_NOT_FOUND',
          message: 'User record not found for authenticated principal',
          userMessage: 'Your account could not be loaded. Please sign in again.',
          stage: 'request_validation',
          traceId,
          retryable: false,
        };

        return res.status(404).json({
          success: false,
          error: structuredError.userMessage,
          errorInfo: structuredError,
          traceId,
        });
      }

      const isTemporaryFastAccessUser = (
        effectiveUserData.isTemporaryAccess === true ||
        effectiveUserData.accountScope === FACULTY_FAST_ACCESS_SCOPE ||
        effectiveUserData.temporaryAccessType === FACULTY_FAST_ACCESS_TYPE
      );

      if (isTemporaryFastAccessUser) {
        const fastAccessProfileCompletionStage = resolveFastAccessProfileCompletionStage(
          effectiveUserData,
          null
        );
        if (fastAccessProfileCompletionStage === 'pending_profile_completion') {
          const structuredError = {
            category: 'permission',
            code: 'FAST_ACCESS_PROFILE_INCOMPLETE',
            message: 'Temporary fast-access profile completion is still required',
            userMessage: 'Complete your Fast Access profile to activate your 3 credits.',
            stage: 'request_validation',
            traceId,
            retryable: false,
            details: {
              operationId: normalizedOperationId,
              profileCompletionStage: fastAccessProfileCompletionStage,
            },
          };

          return res.status(403).json({
            success: false,
            error: structuredError.userMessage,
            errorInfo: structuredError,
            traceId,
          });
        }

        const isAllowedTool = FACULTY_FAST_ACCESS_ALLOWED_TOOL_IDS.includes(normalizedToolId as any);
        if (!isAllowedTool) {
          const structuredError = {
            category: 'permission',
            code: 'FAST_ACCESS_TOOL_LOCKED',
            message: `Tool ${normalizedToolId} is locked for temporary fast-access users`,
            userMessage: 'This feature is locked. Upgrade to full access.',
            stage: 'request_validation',
            traceId,
            retryable: false,
            details: {
              accountScope: effectiveUserData.accountScope,
              allowedTools: FACULTY_FAST_ACCESS_ALLOWED_TOOL_IDS,
            },
          };
          return res.status(403).json({
            success: false,
            error: structuredError.userMessage,
            errorInfo: structuredError,
            traceId,
          });
        }

        const creditEventId = buildFastAccessCreditEventDocId(effectiveUserId, normalizedOperationId);
        const creditEventSnap = await db
          .collection(COLLECTIONS.FACULTY_FAST_ACCESS_CREDIT_EVENTS)
          .doc(creditEventId)
          .get();

        const existingEventStatus = String(creditEventSnap.data()?.status || '').toLowerCase();
        fastAccessCreditAlreadyApplied = creditEventSnap.exists && existingEventStatus === 'deducted';

        const remainingFastAccessCredits = normalizeFastAccessCredits(effectiveUserData.fastAccessCredits);
        if (!fastAccessCreditAlreadyApplied && remainingFastAccessCredits < FACULTY_FAST_ACCESS_CREDIT_COST_PER_SUCCESS) {
          const structuredError = {
            category: 'permission',
            code: 'FAST_ACCESS_CREDITS_EXHAUSTED',
            message: 'Temporary fast-access credits are exhausted',
            userMessage: 'Your Faculty fast-access credits are exhausted. Convert to full registration to continue.',
            stage: 'request_validation',
            traceId,
            retryable: false,
            details: {
              operationId: normalizedOperationId,
              remainingFastAccessCredits,
            },
          };

          return res.status(402).json({
            success: false,
            error: structuredError.userMessage,
            errorInfo: structuredError,
            traceId,
          });
        }

        shouldApplyFastAccessCredit = !fastAccessCreditAlreadyApplied;
      } else if (String(effectiveUserData?.role || '').toLowerCase() !== 'admin') {
        const creditEventId = buildStandardCreditEventDocId(effectiveUserId, normalizedOperationId);
        const creditEventSnap = await db
          .collection(COLLECTIONS.USER_CREDIT_EVENTS)
          .doc(creditEventId)
          .get();

        const existingEventStatus = String(creditEventSnap.data()?.status || '').toLowerCase();
        standardCreditAlreadyApplied = creditEventSnap.exists && existingEventStatus === 'deducted';

        const remainingCredits = normalizeUserCredits(effectiveUserData?.credits);
        if (!standardCreditAlreadyApplied && remainingCredits < 1) {
          const structuredError = {
            category: 'permission',
            code: 'STANDARD_CREDITS_EXHAUSTED',
            message: 'Standard account credits are exhausted',
            userMessage: 'Insufficient credits. Please request more from an administrator or redeem a gift code.',
            stage: 'request_validation',
            traceId,
            retryable: false,
            details: {
              operationId: normalizedOperationId,
              remainingCredits,
            },
          };

          return res.status(402).json({
            success: false,
            error: structuredError.userMessage,
            errorInfo: structuredError,
            traceId,
          });
        }

        shouldApplyStandardCredit = !standardCreditAlreadyApplied;
      }
    }

    const effectiveActorContext =
      effectiveUserId && effectiveUserData
        ? createActorContext({
            uid: effectiveUserId,
            role:
              normalizeOptionalString(effectiveUserData.role) ||
              (isReservedAdminEmail(effectiveUserData.email) ? 'Admin' : 'User'),
            email: normalizeOptionalString(effectiveUserData.email) || null,
            adminLevel: normalizeOptionalString(effectiveUserData.adminLevel) || null,
            isAdmin:
              String(effectiveUserData.role || '').toLowerCase() === 'admin' ||
              isReservedAdminEmail(effectiveUserData.email),
          })
        : null;

    const requestedModelAccess = evaluateModelAccessForUser({
      userData: effectiveUserData,
      toolId: normalizedToolId,
      modelId: normalizedModelId,
    });

    if (!requestedModelAccess.allowed) {
      const structuredError = buildModelAccessStructuredError({
        traceId,
        toolId: normalizedToolId,
        requestedModelId: normalizedModelId,
        access: requestedModelAccess,
      });

      return res.status(structuredError.category === 'validation' ? 400 : 403).json({
        success: false,
        error: structuredError.userMessage,
        errorInfo: structuredError,
        fallbackModelId: requestedModelAccess.fallbackModelId || null,
        defaultModelIds: getDefaultAccessibleModelIdsForTool(normalizedToolId),
        unlockPriceEgp: MODEL_UNLOCK_PRICE_EGP,
        traceId,
      });
    }

    normalizedModelId = requestedModelAccess.canonicalModelId;

    logDiagnostic('info', 'api.ai_execute.request_received', {
      traceId,
      area: 'server',
      route: '/api/ai/execute',
      toolId: normalizedToolId,
      modelId: normalizedModelId,
      provider: requestedModelAccess.canonicalModelId ? getModelByAnyId(requestedModelAccess.canonicalModelId)?.provider : undefined,
      userId: effectiveUserId || req.body?.userId,
      stage: 'request',
      details: {
        hasPrompt: !!userPrompt,
        hasFileContext: !!fileContext,
        requestedProviderFamily: providerFamily || null,
        selectedAssetSource: normalizedSelectedAssetSource,
        toolSettings: normalizedToolSettings || null,
        requestConfig: Object.keys(normalizedRequestConfig).length > 0
          ? {
              temperature: normalizedRequestConfig.temperature ?? null,
              maxOutputTokens: normalizedRequestConfig.maxOutputTokens ?? null,
              responseMimeType: normalizedRequestConfig.responseMimeType ?? null,
              hasSystemInstruction: Boolean(normalizedRequestConfig.systemInstruction),
              hasResponseSchema: Boolean(normalizedRequestConfig.responseSchema),
            }
          : null,
        providerSettings: Object.keys(normalizedProviderSettings).length > 0 ? normalizedProviderSettings : null,
        userPreferencesProvided: Boolean(normalizeOptionalString(userPreferences)),
        userPreferencesLength: typeof userPreferences === 'string' ? userPreferences.trim().length : 0,
        documentContextRef: normalizedDocumentContextRef,
        directFileDispatch: normalizedDirectFileDispatch,
      },
    });

    startBackendStage('request_validation', 'Validating incoming request payload');

    finishBackendStage('request_validation', 'completed', 'Request payload validated');

    const { PromptOrchestrator } = await import("./server/promptOrchestrator.js");
    const { executeWithProviderAdapter } = await import("./server/aiProviders.js");
    
    try {
      let finalUserPrompt = userPrompt || "";
      let finalFileContext = fileContext;
      const initialAdditionalContext = isPlainRecord(additionalContext) ? additionalContext : {};
      let finalAdditionalContext: Record<string, unknown> = {
        ...initialAdditionalContext,
      };
      let isChatHistory = false;
      let parsedHistory: any[] = [];
      let lastMessageText = "";
      let resolvedDocumentPromptContext: Awaited<ReturnType<typeof promptContextResolver.resolve>> | null = null;
      const requestedModelMetadata = getModelByAnyId(normalizedModelId);
      const resolvedPromptTemplateGroup = requestedModelMetadata?.promptTemplateGroup || promptTemplateGroup;

      if (normalizedDocumentContextRef?.documentId) {
        if (!effectiveActorContext) {
          throw new Error('AUTH_REQUIRED_FOR_DOCUMENT_CONTEXT');
        }

        resolvedDocumentPromptContext = await promptContextResolver.resolve({
          actor: effectiveActorContext,
          toolId: normalizedToolId,
          documentId: normalizedDocumentContextRef.documentId,
          artifactId: normalizedDocumentContextRef.artifactId,
          mode: normalizedDirectFileDispatch?.mode || null,
          toolSettings: normalizedToolSettings,
        });

        const existingMetadata = isPlainRecord(initialAdditionalContext.metadata)
          ? (initialAdditionalContext.metadata as Record<string, unknown>)
          : {};

        finalFileContext = resolvedDocumentPromptContext.fileContext;
        finalAdditionalContext = {
          ...initialAdditionalContext,
          ...resolvedDocumentPromptContext.additionalContext,
          metadata: {
            ...existingMetadata,
            ...(resolvedDocumentPromptContext.additionalContext.metadata || {}),
          },
        };
      }

      if (
        (normalizedDirectFileDispatch?.pathway === 'direct_file_to_model' ||
          normalizedDocumentContextRef?.pathway === 'direct_file_to_model') &&
        normalizedDocumentContextRef?.documentId
      ) {
        if (!effectiveActorContext) {
          throw new Error('AUTH_REQUIRED_FOR_DIRECT_FILE_MODE');
        }

        await directModelFileDispatchService.prepare({
          actor: effectiveActorContext,
          documentId: normalizedDocumentContextRef.documentId,
          toolId: normalizedToolId,
          modelId: normalizedModelId,
          providerSettings: normalizedProviderSettings,
          toolSettings: normalizedToolSettings,
          userPreferences: normalizeOptionalString(userPreferences),
          mode: normalizedDirectFileDispatch?.mode || null,
        });

        throw new Error('DIRECT_FILE_MODE_DISABLED');
      }

      // Check if userPrompt is a JSON array (chat history)
      if (finalUserPrompt && finalUserPrompt.startsWith('[')) {
        try {
          const parsed = JSON.parse(finalUserPrompt);
          if (Array.isArray(parsed)) {
            isChatHistory = true;
            parsedHistory = parsed;
            // Extract the text from the last message for orchestration
            const lastMessage = parsedHistory[parsedHistory.length - 1];
            lastMessageText = lastMessage.parts?.[0]?.text || lastMessage.content || "";
            finalUserPrompt = lastMessageText;
          }
        } catch (e) {
          // Not valid JSON, treat as string
        }
      }

      // Extract image data from fileContext if present
      if (finalFileContext) {
        const fileImageMatch = finalFileContext.match(/\[IMAGE_DATA:(.*?);base64,(.*?)\]/);
        if (fileImageMatch) {
          // Move the image data to the user prompt so it gets processed as a message
          finalUserPrompt = `[IMAGE_DATA:${fileImageMatch[1]};base64,${fileImageMatch[2]}]\n${finalUserPrompt}`;
          finalFileContext = finalFileContext.replace(/\[IMAGE_DATA:.*?;base64,.*?\]/, '[Attached Image]');
        }
      }

      startBackendStage('prompt_orchestration', 'Composing prompt and response schema');

      // Orchestrate prompt and route model
      const { prompt, systemInstruction, finalModelId, fallbackHappened, responseSchema } = PromptOrchestrator.orchestrate(
        normalizedToolId,
        finalUserPrompt,
        normalizedModelId,
        {
          userPreferences,
          settings: normalizedToolSettings,
          fileContext: finalFileContext,
          fileName: normalizedDocumentContextRef?.fileName || fileName,
          toolId: normalizedToolId,
          promptTemplateGroup: resolvedPromptTemplateGroup,
          additionalContext: finalAdditionalContext,
        }
      );

      finishBackendStage('prompt_orchestration', 'completed', 'Prompt orchestration complete', {
        fallbackHappened,
        documentContextResolved: Boolean(resolvedDocumentPromptContext),
      });

      startBackendStage('model_resolution', 'Resolving model metadata and provider');

      // Resolve from model registry source of truth.
      const resolvedModelAccess = evaluateModelAccessForUser({
        userData: effectiveUserData,
        toolId: normalizedToolId,
        modelId: finalModelId,
      });
      if (!resolvedModelAccess.allowed) {
        const structuredError = buildModelAccessStructuredError({
          traceId,
          toolId: normalizedToolId,
          requestedModelId: finalModelId,
          access: resolvedModelAccess,
        });

        finishBackendStage('model_resolution', 'failed', structuredError.message, {
          code: structuredError.code,
        });

        return res.status(structuredError.category === 'validation' ? 400 : 403).json({
          success: false,
          error: structuredError.userMessage,
          errorInfo: structuredError,
          fallbackModelId: resolvedModelAccess.fallbackModelId || null,
          defaultModelIds: getDefaultAccessibleModelIdsForTool(normalizedToolId),
          unlockPriceEgp: MODEL_UNLOCK_PRICE_EGP,
          traceId,
        });
      }

      const authorizedFinalModelId = resolvedModelAccess.canonicalModelId;
      const modelMetadata = getModelByAnyId(authorizedFinalModelId);
      if (!modelMetadata) throw new Error(`Model metadata not found for ${authorizedFinalModelId}`);

      if (providerFamily && providerFamily !== modelMetadata.provider) {
        throw new Error('REQUEST_PROVIDER_MODEL_MISMATCH');
      }

      const provider = modelMetadata.provider;
      const providerRuntime = resolveProviderRuntimeByModel({
        modelId: authorizedFinalModelId,
      });
      if (!providerRuntime.credentialResolved) {
        throw new Error(`${providerRuntime.envKeyName} not configured on the server.`);
      }
      const config = {
        ...normalizedRequestConfig,
        ...normalizedProviderSettings,
        systemInstruction,
        responseSchema,
        traceId,
      };

      finishBackendStage('model_resolution', 'completed', 'Model and provider resolved', {
        provider,
        providerId: providerRuntime.providerId,
        family: providerRuntime.family,
        transport: providerRuntime.transport,
        finalModelId: authorizedFinalModelId,
        region: providerRuntime.region,
        endpoint: providerRuntime.endpoint,
      });

      logDiagnostic('info', 'api.ai_execute.model_resolved', {
        traceId,
        area: 'server',
        route: '/api/ai/execute',
        toolId: normalizedToolId,
        modelId: authorizedFinalModelId,
        provider,
        stage: 'resolve',
        details: {
          requestedModelId: normalizedModelId,
          authorizedRequestedModelId: requestedModelAccess.canonicalModelId,
          fallbackHappened,
          routingPath: modelMetadata.routingPath,
          promptTemplateGroup: modelMetadata.promptTemplateGroup,
          providerId: providerRuntime.providerId,
          family: providerRuntime.family,
          transport: providerRuntime.transport,
          resolvedEndpoint: providerRuntime.endpoint,
          resolvedRegion: providerRuntime.region,
          envCredentialResolved: providerRuntime.credentialResolved,
          selectedAssetSource: normalizedSelectedAssetSource,
        },
      });

      // Reconstruct contents array for Qwen if userPrompt was JSON stringified array
      let finalContents: any = prompt;
      let imagePart = null;
      let textPrompt = prompt;

      // Extract image data from the orchestrated prompt if it was added
      const imageMatch = prompt.match(/\[IMAGE_DATA:(.*?);base64,(.*?)\]/);
      if (imageMatch) {
        imagePart = {
          inlineData: {
            mimeType: imageMatch[1],
            data: imageMatch[2]
          }
        };
        textPrompt = prompt.replace(/\[IMAGE_DATA:.*?;base64,.*?\]/, '[Attached Image]');
      }

      if (isChatHistory) {
        finalContents = [...parsedHistory];
        const lastIndex = finalContents.length - 1;
        
        // Re-format for QwenProvider which expects Gemini-like structure or plain text
        const parts = [{ text: textPrompt }];
        if (imagePart) {
          // Add image data back in a way QwenProvider can parse it
          parts.unshift({ text: `[IMAGE_DATA:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}]` });
        }
        
        finalContents[lastIndex] = {
          ...finalContents[lastIndex],
          role: 'user',
          parts: parts
        };
      } else if (imagePart) {
         // It's a string, but has an image. Format it so QwenProvider can parse it.
         finalContents = `[IMAGE_DATA:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}]\n${textPrompt}`;
      } else {
         finalContents = textPrompt;
      }

      let result;
      startBackendStage('provider_dispatch', 'Dispatching request to provider adapter', {
        provider,
        providerId: providerRuntime.providerId,
        family: providerRuntime.family,
        transport: providerRuntime.transport,
      });
      /**
       * MODEL-ROUTING GUARD
       * ------------------------------------------------------------------
       * Keep generation credentials server-resolved from environment config.
       * The selected canonical model still comes from the client, but the
       * backend owns provider identity, endpoint choice, and secret lookup.
       */
      logDiagnostic('debug', 'api.ai_execute.provider_dispatch', {
        traceId,
        area: 'server',
        route: '/api/ai/execute',
        toolId: normalizedToolId,
        modelId: authorizedFinalModelId,
        provider,
        stage: 'dispatch',
        details: {
          providerId: providerRuntime.providerId,
          family: providerRuntime.family,
          transport: providerRuntime.transport,
          resolvedEndpoint: providerRuntime.endpoint,
          resolvedRegion: providerRuntime.region,
          envKeyName: providerRuntime.envKeyName,
          usesEnvCredentials: providerRuntime.usesEnvCredentials,
          selectedAssetSource: normalizedSelectedAssetSource,
        },
      });

      finishBackendStage('provider_dispatch', 'completed', 'Provider adapter selected', {
        provider,
        adapterId: providerRuntime.adapterId,
      });

      startBackendStage('provider_execution', 'Calling provider API', {
        provider,
        providerId: providerRuntime.providerId,
        family: providerRuntime.family,
        transport: providerRuntime.transport,
        modelId: authorizedFinalModelId,
        region: providerRuntime.region,
      });

      result = await executeWithProviderAdapter(authorizedFinalModelId, finalContents, config, providerRuntime);
      finishBackendStage('provider_execution', result.success ? 'completed' : 'failed', result.success ? 'Provider returned a response' : result.error, {
        provider,
        adapterId: providerRuntime.adapterId,
      });

      if (result.success) {
        startBackendStage('usage_logging', 'Persisting provider usage metrics');
        // Log usage to Firestore
        try {
          await db.collection(COLLECTIONS.PROVIDER_USAGE).add({
            provider,
            model: authorizedFinalModelId,
            usage: result.usage || {},
            timestamp: new Date().toISOString(),
            userId: req.body.userId || 'unknown'
          });
          finishBackendStage('usage_logging', 'completed', 'Usage metrics persisted');
        } catch (e) {
          console.error("Failed to log usage:", e);
          finishBackendStage('usage_logging', 'failed', 'Usage metric persistence failed', {
            details: normalizeError(e),
          });
        }

        let fastAccessCreditsRemaining: number | undefined;
        let fastAccessCreditDebited = false;
        let standardCreditsRemaining: number | undefined;
        let standardCreditDebited = false;
        if (effectiveUserId && (shouldApplyFastAccessCredit || fastAccessCreditAlreadyApplied)) {
          const deduction = await applyFastAccessCreditDeduction({
            userId: effectiveUserId,
            operationId: normalizedOperationId,
            traceId,
            toolId: normalizedToolId,
            modelId: authorizedFinalModelId,
            promptHash,
            fallbackHappened: Boolean(fallbackHappened),
            usage: result.usage || undefined,
            resultTextLength: typeof result.text === 'string' ? result.text.length : 0,
          });

          fastAccessCreditsRemaining = deduction.remainingCredits;
          fastAccessCreditDebited = deduction.applied;

          if (!deduction.applied && !deduction.alreadyApplied && deduction.reason === 'insufficient') {
            const structuredError = {
              category: 'permission' as const,
              code: 'FAST_ACCESS_CREDITS_EXHAUSTED',
              message: 'Temporary fast-access credits are exhausted at finalization',
              userMessage: 'Your Faculty fast-access credits are exhausted. Convert to full registration to continue.',
              stage: 'response_finalize',
              traceId,
              retryable: false,
              details: {
                operationId: normalizedOperationId,
                remainingFastAccessCredits: deduction.remainingCredits,
              },
            };

            return res.status(402).json({
              success: false,
              error: structuredError.userMessage,
              errorInfo: structuredError,
              traceId,
            });
          }
        }

        if (effectiveUserId && (shouldApplyStandardCredit || standardCreditAlreadyApplied)) {
          const deduction = await applyStandardCreditDeduction({
            userId: effectiveUserId,
            operationId: normalizedOperationId,
            traceId,
            toolId: normalizedToolId,
            modelId: authorizedFinalModelId,
            promptHash,
            fallbackHappened: Boolean(fallbackHappened),
            usage: result.usage || undefined,
            resultTextLength: typeof result.text === 'string' ? result.text.length : 0,
          });

          standardCreditsRemaining = deduction.remainingCredits;
          standardCreditDebited = deduction.applied;

          if (!deduction.applied && !deduction.alreadyApplied && deduction.reason === 'insufficient') {
            const structuredError = {
              category: 'permission' as const,
              code: 'STANDARD_CREDITS_EXHAUSTED',
              message: 'Standard account credits are exhausted at finalization',
              userMessage: 'Insufficient credits. Please request more from an administrator or redeem a gift code.',
              stage: 'response_finalize',
              traceId,
              retryable: false,
              details: {
                operationId: normalizedOperationId,
                remainingCredits: deduction.remainingCredits,
              },
            };

            return res.status(402).json({
              success: false,
              error: structuredError.userMessage,
              errorInfo: structuredError,
              traceId,
            });
          }
        }

        startBackendStage('response_finalize', 'Building response payload');

        const completedAt = Date.now();
        const completedStages = backendTraceStages.filter((stage) => stage.status === 'completed').length;
        const totalStages = backendTraceStages.length;
        const finalStageId = [...backendTraceStages]
          .reverse()
          .find((stage) => stage.status === 'completed' || stage.status === 'failed')?.id;
        const backendTrace = {
          traceId,
          operationMeta: {
            operationId: normalizedOperationId,
            operationType: normalizedToolId,
            toolName: normalizedToolId,
            startedAt: new Date(operationStartedAt).toISOString(),
            endedAt: new Date(completedAt).toISOString(),
            durationMs: completedAt - operationStartedAt,
            status: 'success' as const,
            currentStageId: undefined,
            finalStageId,
            stagesCompleted: completedStages,
            stageCount: totalStages,
          },
          resultMeta: {
            ready: true,
            textLength: typeof result.text === 'string' ? result.text.length : 0,
            usage: result.usage || undefined,
            fallbackHappened: Boolean(fallbackHappened),
            providerFamily: provider,
            modelUsed: authorizedFinalModelId,
          },
          toolId: normalizedToolId,
          actionName: normalizedToolId,
          status: 'success',
          startedAt: new Date(operationStartedAt).toISOString(),
          endedAt: new Date(completedAt).toISOString(),
          elapsedMs: completedAt - operationStartedAt,
          stages: backendTraceStages,
          provider,
          modelUsed: authorizedFinalModelId,
          fallbackHappened,
          fastAccessCreditsRemaining: fastAccessCreditsRemaining ?? null,
          fastAccessCreditDebited,
          standardCreditsRemaining: standardCreditsRemaining ?? null,
          standardCreditDebited,
        };

        finishBackendStage('response_finalize', 'completed', 'Response payload finalized', {
          elapsedMs: backendTrace.elapsedMs,
        });

        return res.json({ 
          success: true, 
          text: result.text, 
          usage: result.usage,
          modelUsed: authorizedFinalModelId,
          fallbackHappened,
          fastAccessCreditsRemaining,
          fastAccessCreditDebited,
          standardCreditsRemaining,
          standardCreditDebited,
          traceId,
          trace: backendTrace,
        });
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      const failedStageId = backendTraceStages.find(stage => stage.status === 'running')?.id || 'provider_execution';
      const structuredError = classifyApiError(error, failedStageId);
      finishBackendStage(failedStageId, 'failed', structuredError.message, {
        category: structuredError.category,
        code: structuredError.code,
      });
      startBackendStage('response_finalize', 'Building error response payload');
      finishBackendStage('response_finalize', 'failed', structuredError.userMessage, {
        failedStageId,
      });

      const completedAt = Date.now();
      const completedStages = backendTraceStages.filter((stage) => stage.status === 'completed').length;
      const totalStages = backendTraceStages.length;
      const finalStageId = [...backendTraceStages]
        .reverse()
        .find((stage) => stage.status === 'completed' || stage.status === 'failed')?.id;
      const backendTrace = {
        traceId,
        operationMeta: {
          operationId: normalizedOperationId,
          operationType: normalizedToolId,
          toolName: normalizedToolId,
          startedAt: new Date(operationStartedAt).toISOString(),
          endedAt: new Date(completedAt).toISOString(),
          durationMs: completedAt - operationStartedAt,
          status: 'failed' as const,
          currentStageId: undefined,
          finalStageId,
          stagesCompleted: completedStages,
          stageCount: totalStages,
        },
        resultMeta: {
          ready: false,
          fallbackHappened: false,
          providerFamily: getModelByAnyId(normalizedModelId)?.provider,
          modelUsed: normalizedModelId,
        },
        toolId: normalizedToolId,
        actionName: normalizedToolId,
        status: 'failed',
        startedAt: new Date(operationStartedAt).toISOString(),
        endedAt: new Date(completedAt).toISOString(),
        elapsedMs: completedAt - operationStartedAt,
        stages: backendTraceStages,
        failure: {
          stageId: structuredError.stage,
          code: structuredError.code,
          category: structuredError.category,
          message: structuredError.userMessage,
        },
      };

      logDiagnostic('error', 'api.ai_execute.failed', {
        traceId,
        area: 'server',
        route: '/api/ai/execute',
        toolId: normalizedToolId,
        modelId: normalizedModelId,
        provider: getModelByAnyId(normalizedModelId)?.provider,
        stage: 'execute',
        details: normalizeError(error),
      });
      res.status(500).json({ 
        success: false, 
        error: structuredError.userMessage,
        errorInfo: structuredError,
        details: {
          requestedModel: normalizedModelId,
          toolId: normalizedToolId,
          traceId
        },
        trace: backendTrace,
      });
    }
  });

  // Test Connection Route
  app.post("/api/ai/test-connection", async (req, res) => {
    const { provider, apiKey, baseUrl, modelId, region } = req.body;

    try {
      if (provider === 'google') {
        const runtime = resolveProviderRuntimeByModel({
          modelId: modelId || 'gemini-3-flash-preview',
          allowOverride: Boolean(apiKey),
          overrideApiKey: apiKey,
        });
        if (!runtime.credentialResolved) throw new Error(`${runtime.envKeyName} is required`);
        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey: runtime.apiKey });
        const response = await ai.models.generateContent({
          model: runtime.canonicalModelId,
          contents: "Hello",
          config: { maxOutputTokens: 5 }
        });
        if (response.text) {
          return res.json({
            success: true,
            provider: runtime.provider,
            providerId: runtime.providerId,
            family: runtime.family,
            transport: runtime.transport,
            modelId: runtime.canonicalModelId,
            endpoint: runtime.endpoint,
            region: runtime.region,
            envKeyName: runtime.envKeyName,
            credentialResolved: runtime.credentialResolved,
          });
        }
        throw new Error("No response from Gemini");
      }

      if (provider === 'qwen') {
        const runtime = resolveQwenRuntime({
          allowOverride: Boolean(apiKey || baseUrl || region),
          overrideApiKey: apiKey,
          overrideBaseUrl: baseUrl,
          overrideRegion: region,
        });
        if (!runtime.credentialResolved) throw new Error(`${runtime.envKeyName} is required`);

        const response = await fetch(runtime.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${runtime.apiKey}`
          },
          body: JSON.stringify({
            model: toCanonicalModelId(modelId || "qwen3.5-plus"),
            messages: [{ role: "user", content: "Hello" }],
            max_tokens: 5
          })
        });

        if (!response.ok) {
          const error = await response.json();
          return res.status(response.status).json({ 
            success: false, 
            error: error.error?.message || error.message || response.statusText 
          });
        }

        return res.json({
          success: true,
          provider: runtime.provider,
          providerId: runtime.providerId,
          family: runtime.family,
          transport: runtime.transport,
          modelId: toCanonicalModelId(modelId || 'qwen3.5-plus'),
          endpoint: runtime.endpoint,
          region: runtime.region,
          envKeyName: runtime.envKeyName,
          credentialResolved: runtime.credentialResolved,
        });
      }

      throw new Error(`Unsupported provider for test: ${provider}`);
    } catch (error: any) {
      console.error("Test Connection Error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, {
      index: false,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-store');
          return;
        }

        if (/\.(js|css|woff2?|ttf|eot)$/i.test(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          return;
        }

        res.setHeader('Cache-Control', 'public, max-age=3600');
      },
    }));
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
  // Keep server request ceilings slightly above the provider/client budgets so
  // the backend can return a structured timeout response instead of being cut
  // off by infrastructure while the AI pipeline is still finalizing.
  server.requestTimeout = AI_SERVER_REQUEST_TIMEOUT_MS;
  server.headersTimeout = AI_SERVER_HEADERS_TIMEOUT_MS;
}

startServer();
