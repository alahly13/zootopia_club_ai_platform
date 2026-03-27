import { Firestore } from 'firebase-admin/firestore';
import { CANONICAL_UNLOCK_ELIGIBLE_TOOL_IDS } from './entitlementContracts';

export type ToolEntitlementSource = 'payment' | 'code' | 'admin';

const ELIGIBLE_TOOL_SET = new Set<string>(CANONICAL_UNLOCK_ELIGIBLE_TOOL_IDS);

export const TOOL_ENTITLEMENT_COLLECTION = 'user_tool_entitlements';
export const TOOL_ENTITLEMENT_EVENT_COLLECTION = 'user_tool_entitlement_events';

export type GrantTransitionInput = {
  toolId: string;
  source: ToolEntitlementSource;
  referenceId?: string;
  unlockedTools: string[];
  unlockedPages: string[];
  previousEntitlement?: {
    active?: boolean;
    lastSource?: ToolEntitlementSource;
    lastReferenceId?: string;
  } | null;
};

export type GrantTransitionOutput = {
  unlockedTools: string[];
  unlockedPages: string[];
  alreadyApplied: boolean;
  idempotentReplay: boolean;
};

export const isToolUnlockEligible = (toolId: string): boolean => ELIGIBLE_TOOL_SET.has(toolId);

export const resolvePageIdsForTool = (toolId: string): string[] => {
  if (toolId === 'quiz' || toolId === 'analyze') return ['generate'];
  if (toolId === 'infographic') return ['infographic'];
  return [];
};

export const applyGrantTransition = (input: GrantTransitionInput): GrantTransitionOutput => {
  if (!isToolUnlockEligible(input.toolId)) {
    throw new Error('invalid-tool-id');
  }

  const currentTools = Array.isArray(input.unlockedTools) ? input.unlockedTools : [];
  const currentPages = Array.isArray(input.unlockedPages) ? input.unlockedPages : [];
  const pageIds = resolvePageIdsForTool(input.toolId);

  const entitlement = input.previousEntitlement || null;
  const isAlreadyActive = entitlement?.active === true;
  const isReplay =
    isAlreadyActive &&
    entitlement?.lastSource === input.source &&
    !!input.referenceId &&
    entitlement?.lastReferenceId === input.referenceId;

  const nextTools = Array.from(new Set([...currentTools, input.toolId]));
  const nextPages = Array.from(new Set([...currentPages, ...pageIds]));

  return {
    unlockedTools: nextTools,
    unlockedPages: nextPages,
    alreadyApplied: isAlreadyActive,
    idempotentReplay: isReplay,
  };
};

export const applyRevokeTransition = (toolId: string, unlockedTools: string[], unlockedPages: string[]) => {
  if (!isToolUnlockEligible(toolId)) {
    throw new Error('invalid-tool-id');
  }

  const pageIds = new Set(resolvePageIdsForTool(toolId));
  return {
    unlockedTools: (Array.isArray(unlockedTools) ? unlockedTools : []).filter((value) => value !== toolId),
    unlockedPages: (Array.isArray(unlockedPages) ? unlockedPages : []).filter((value) => !pageIds.has(value)),
  };
};

export const grantToolEntitlement = async (db: Firestore, payload: {
  userId: string;
  toolId: string;
  source: ToolEntitlementSource;
  referenceId?: string;
  actorUserId?: string;
  reason?: string;
}) => {
  if (!isToolUnlockEligible(payload.toolId)) {
    throw new Error('invalid-tool-id');
  }

  const entitlementRef = db.collection(TOOL_ENTITLEMENT_COLLECTION).doc(`${payload.userId}_${payload.toolId}`);
  const userRef = db.collection('users').doc(payload.userId);
  const eventRef = db.collection(TOOL_ENTITLEMENT_EVENT_COLLECTION).doc();
  const nowIso = new Date().toISOString();

  return db.runTransaction(async (tx) => {
    const [userSnap, entitlementSnap] = await Promise.all([tx.get(userRef), tx.get(entitlementRef)]);
    const userData = userSnap.exists ? (userSnap.data() || {}) : {};
    const entitlementData = entitlementSnap.exists ? entitlementSnap.data() : null;

    const grantTransition = applyGrantTransition({
      toolId: payload.toolId,
      source: payload.source,
      referenceId: payload.referenceId,
      unlockedTools: Array.isArray(userData.unlockedTools) ? userData.unlockedTools : [],
      unlockedPages: Array.isArray(userData.unlockedPages) ? userData.unlockedPages : [],
      previousEntitlement: entitlementData
        ? {
            active: entitlementData.active === true,
            lastSource: entitlementData.lastSource,
            lastReferenceId: entitlementData.lastReferenceId,
          }
        : null,
    });

    tx.set(userRef, {
      unlockedTools: grantTransition.unlockedTools,
      unlockedPages: grantTransition.unlockedPages,
      updatedAt: nowIso,
    }, { merge: true });

    tx.set(entitlementRef, {
      userId: payload.userId,
      toolId: payload.toolId,
      active: true,
      grantedAt: nowIso,
      lastSource: payload.source,
      lastReferenceId: payload.referenceId || null,
      grantedBy: payload.actorUserId || null,
      lastAdminReason: payload.reason || null,
      updatedAt: nowIso,
    }, { merge: true });

    if (!grantTransition.idempotentReplay) {
      tx.set(eventRef, {
        userId: payload.userId,
        toolId: payload.toolId,
        action: 'grant',
        source: payload.source,
        sourceReferenceId: payload.referenceId || null,
        actorUserId: payload.actorUserId || null,
        reason: payload.reason || null,
        createdAt: nowIso,
      });
    }

    return {
      eventId: grantTransition.idempotentReplay ? null : eventRef.id,
      idempotentReplay: grantTransition.idempotentReplay,
      alreadyApplied: grantTransition.alreadyApplied,
      unlockedTools: grantTransition.unlockedTools,
      unlockedPages: grantTransition.unlockedPages,
    };
  });
};

export const revokeToolEntitlement = async (db: Firestore, payload: {
  userId: string;
  toolId: string;
  actorUserId?: string;
  reason?: string;
}) => {
  if (!isToolUnlockEligible(payload.toolId)) {
    throw new Error('invalid-tool-id');
  }

  const entitlementRef = db.collection(TOOL_ENTITLEMENT_COLLECTION).doc(`${payload.userId}_${payload.toolId}`);
  const userRef = db.collection('users').doc(payload.userId);
  const eventRef = db.collection(TOOL_ENTITLEMENT_EVENT_COLLECTION).doc();
  const nowIso = new Date().toISOString();

  return db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const userData = userSnap.exists ? (userSnap.data() || {}) : {};

    const revoked = applyRevokeTransition(
      payload.toolId,
      Array.isArray(userData.unlockedTools) ? userData.unlockedTools : [],
      Array.isArray(userData.unlockedPages) ? userData.unlockedPages : []
    );

    tx.set(userRef, {
      unlockedTools: revoked.unlockedTools,
      unlockedPages: revoked.unlockedPages,
      updatedAt: nowIso,
    }, { merge: true });

    tx.set(entitlementRef, {
      userId: payload.userId,
      toolId: payload.toolId,
      active: false,
      revokedAt: nowIso,
      revokedBy: payload.actorUserId || null,
      lastAdminReason: payload.reason || null,
      updatedAt: nowIso,
    }, { merge: true });

    tx.set(eventRef, {
      userId: payload.userId,
      toolId: payload.toolId,
      action: 'revoke',
      source: 'admin',
      actorUserId: payload.actorUserId || null,
      reason: payload.reason || null,
      createdAt: nowIso,
    });

    return {
      eventId: eventRef.id,
      unlockedTools: revoked.unlockedTools,
      unlockedPages: revoked.unlockedPages,
    };
  });
};
