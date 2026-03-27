import { db } from '../firebase';
import { collection, addDoc, query, where, getDocs, deleteDoc, Timestamp } from 'firebase/firestore';

type SupportedPlan = 'free' | 'basic' | 'starter' | 'plus' | 'pro' | 'enterprise';

export const FINAL_AI_RESULT_RETENTION_DAYS = 3;
export const FIRESTORE_RESULT_TTL_FIELD = 'expiresAt';
export const FIRESTORE_RESULT_RETENTION_POLICY_VERSION = '2026-03-firestore-ttl-3d';

// Product rule: final AI results are the only extraction-adjacent artifacts that
// belong in Firestore, and they should all share the same 3-day TTL window.
const PLAN_RETENTION_DAYS: Record<SupportedPlan, number | null> = {
  free: FINAL_AI_RESULT_RETENTION_DAYS,
  basic: FINAL_AI_RESULT_RETENTION_DAYS,
  starter: FINAL_AI_RESULT_RETENTION_DAYS,
  plus: FINAL_AI_RESULT_RETENTION_DAYS,
  pro: FINAL_AI_RESULT_RETENTION_DAYS,
  enterprise: FINAL_AI_RESULT_RETENTION_DAYS,
};

export interface Result {
  id?: string;
  userId: string;
  title: string;
  type: string;
  data: string;
  sourceTool: string;
  createdAt: Timestamp;
  expiresAt?: Timestamp | null;
  planAtCreation?: string;
  retentionDaysAtCreation?: number | null;
}

export interface ResultRetentionSummary {
  scanned: number;
  deleted: number;
  skippedInvalid: number;
  deleteErrors: number;
}

function normalizePlan(plan?: string | null): SupportedPlan {
  const normalized = String(plan || 'free').trim().toLowerCase();
  if (normalized === 'starter' || normalized === 'plus' || normalized === 'pro' || normalized === 'enterprise' || normalized === 'basic') {
    return normalized;
  }
  return 'free';
}

function resolveRetentionDays(plan?: string | null): number | null {
  return PLAN_RETENTION_DAYS[normalizePlan(plan)];
}

function safeTimestamp(value: unknown): Timestamp | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value;

  if (typeof value === 'object' && value !== null && typeof (value as any).toDate === 'function') {
    try {
      const date = (value as any).toDate();
      if (date instanceof Date && !Number.isNaN(date.getTime())) {
        return Timestamp.fromDate(date);
      }
    } catch {
      return null;
    }
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return Timestamp.fromDate(parsed);
    }
  }

  return null;
}

function computeLegacyExpiry(createdAt: Timestamp, retentionDays: number | null): Timestamp | null {
  if (retentionDays === null) return null;
  return Timestamp.fromDate(new Date(createdAt.toDate().getTime() + retentionDays * 24 * 60 * 60 * 1000));
}

function normalizeResultData(data: unknown): string {
  const asString = typeof data === 'string' ? data : JSON.stringify(data ?? '');

  // Firestore documents have practical size limits; clamp oversized payloads safely.
  const maxSafeLength = 800000;
  if (asString.length <= maxSafeLength) {
    return asString;
  }

  return `${asString.slice(0, maxSafeLength)}\n\n[TRUNCATED_BY_RETENTION_PIPELINE]`;
}

export const storeResult = async (
  userId: string,
  title: string,
  type: string,
  data: string,
  sourceTool: string,
  userPlan?: string
) => {
  const resultsRef = collection(db, 'results');
  const createdAt = Timestamp.now();
  const normalizedPlan = normalizePlan(userPlan);
  const retentionDays = resolveRetentionDays(normalizedPlan);
  const expiresAt = computeLegacyExpiry(createdAt, retentionDays);
  
  await addDoc(resultsRef, {
    userId,
    title,
    type,
    data: normalizeResultData(data),
    sourceTool,
    createdAt,
    expiresAt,
    planAtCreation: normalizedPlan,
    retentionDaysAtCreation: retentionDays,
    retentionPolicyVersion: FIRESTORE_RESULT_RETENTION_POLICY_VERSION,
    status: 'active',
  });
};

export const cleanupOldResults = async (userId: string, userPlan?: string) => {
  return cleanupExpiredResultsForUser(userId, userPlan);
};

export const cleanupExpiredResultsForUser = async (
  userId: string,
  userPlan?: string
): Promise<ResultRetentionSummary> => {
  const resultsRef = collection(db, 'results');
  const fallbackPlan = normalizePlan(userPlan);
  const now = Timestamp.now();
  const q = query(resultsRef, where('userId', '==', userId));
  const querySnapshot = await getDocs(q);
  const summary: ResultRetentionSummary = {
    scanned: querySnapshot.docs.length,
    deleted: 0,
    skippedInvalid: 0,
    deleteErrors: 0,
  };

  for (const resultDoc of querySnapshot.docs) {
    try {
      const raw = resultDoc.data() as Record<string, unknown>;
      const createdAt = safeTimestamp(raw.createdAt);

      if (!createdAt) {
        summary.skippedInvalid += 1;
        continue;
      }

      const retentionDaysAtCreation =
        typeof raw.retentionDaysAtCreation === 'number' ? raw.retentionDaysAtCreation : null;

      const recordPlan = normalizePlan(String(raw.planAtCreation || fallbackPlan));
      const effectiveRetentionDays =
        retentionDaysAtCreation !== null ? retentionDaysAtCreation : resolveRetentionDays(recordPlan);

      const expiresAt = safeTimestamp(raw.expiresAt) || computeLegacyExpiry(createdAt, effectiveRetentionDays);

      if (expiresAt && expiresAt.toMillis() <= now.toMillis()) {
        await deleteDoc(resultDoc.ref);
        summary.deleted += 1;
      }
    } catch {
      summary.deleteErrors += 1;
    }
  }

  return summary;
};

export const getResults = async (userId: string, userPlan?: string): Promise<Result[]> => {
  await cleanupExpiredResultsForUser(userId, userPlan);

  const resultsRef = collection(db, 'results');
  const q = query(resultsRef, where('userId', '==', userId));
  const querySnapshot = await getDocs(q);

  const now = Timestamp.now();

  return querySnapshot.docs
    .map((resultDoc) => {
      const raw = resultDoc.data() as Record<string, unknown>;
      const createdAt = safeTimestamp(raw.createdAt) || Timestamp.now();
      const recordPlan = normalizePlan(String(raw.planAtCreation || userPlan || 'free'));
      const retentionDaysAtCreation =
        typeof raw.retentionDaysAtCreation === 'number' ? raw.retentionDaysAtCreation : resolveRetentionDays(recordPlan);
      const expiresAt = safeTimestamp(raw.expiresAt) || computeLegacyExpiry(createdAt, retentionDaysAtCreation);

      return {
        id: resultDoc.id,
        ...(raw as object),
        data: normalizeResultData(raw.data),
        createdAt,
        expiresAt,
        planAtCreation: String(raw.planAtCreation || recordPlan),
        retentionDaysAtCreation,
      } as Result;
    })
    .filter((result) => !result.expiresAt || result.expiresAt.toMillis() > now.toMillis())
    .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
};

export const getRetentionPolicySummary = (plan?: string | null): string => {
  const retentionDays = resolveRetentionDays(plan);
  if (retentionDays === null) {
    return 'Retention follows your active plan policy.';
  }
  return `Final AI results are retained in Firestore for ${retentionDays} days using the \`${FIRESTORE_RESULT_TTL_FIELD}\` TTL field. Firestore TTL cleanup typically completes within about 24 hours after expiration.`;
};
