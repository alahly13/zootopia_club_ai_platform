import { Firestore } from 'firebase-admin/firestore';
import { getModelByAnyId, toCanonicalModelId } from '../src/ai/models/modelRegistry';

export type ModelEntitlementSource = 'payment' | 'code' | 'admin';

export const MODEL_ENTITLEMENT_COLLECTION = 'user_model_entitlements';
export const MODEL_ENTITLEMENT_EVENT_COLLECTION = 'user_model_entitlement_events';

const ensureKnownModelId = (modelId: string): string => {
  const canonicalModelId = toCanonicalModelId(modelId);
  if (!getModelByAnyId(canonicalModelId)) {
    throw new Error('invalid-model-id');
  }
  return canonicalModelId;
};

type GrantTransitionInput = {
  modelId: string;
  source: ModelEntitlementSource;
  referenceId?: string;
  unlockedModels: string[];
  previousEntitlement?: {
    active?: boolean;
    lastSource?: ModelEntitlementSource;
    lastReferenceId?: string;
  } | null;
};

type GrantTransitionOutput = {
  unlockedModels: string[];
  alreadyApplied: boolean;
  idempotentReplay: boolean;
};

const applyGrantTransition = (input: GrantTransitionInput): GrantTransitionOutput => {
  const canonicalModelId = ensureKnownModelId(input.modelId);
  const currentModels = Array.isArray(input.unlockedModels) ? input.unlockedModels.map((value) => toCanonicalModelId(value)) : [];
  const entitlement = input.previousEntitlement || null;
  const isAlreadyActive = entitlement?.active === true;
  const isReplay =
    isAlreadyActive &&
    entitlement?.lastSource === input.source &&
    !!input.referenceId &&
    entitlement?.lastReferenceId === input.referenceId;

  return {
    unlockedModels: Array.from(new Set([...currentModels, canonicalModelId])),
    alreadyApplied: isAlreadyActive,
    idempotentReplay: isReplay,
  };
};

const applyRevokeTransition = (modelId: string, unlockedModels: string[]) => {
  const canonicalModelId = ensureKnownModelId(modelId);
  return (Array.isArray(unlockedModels) ? unlockedModels : [])
    .map((value) => toCanonicalModelId(value))
    .filter((value) => value !== canonicalModelId);
};

export const grantModelEntitlement = async (db: Firestore, payload: {
  userId: string;
  modelId: string;
  source: ModelEntitlementSource;
  referenceId?: string;
  actorUserId?: string;
  reason?: string;
}) => {
  const canonicalModelId = ensureKnownModelId(payload.modelId);
  const entitlementRef = db.collection(MODEL_ENTITLEMENT_COLLECTION).doc(`${payload.userId}_${canonicalModelId}`);
  const userRef = db.collection('users').doc(payload.userId);
  const eventRef = db.collection(MODEL_ENTITLEMENT_EVENT_COLLECTION).doc();
  const nowIso = new Date().toISOString();

  return db.runTransaction(async (tx) => {
    const [userSnap, entitlementSnap] = await Promise.all([tx.get(userRef), tx.get(entitlementRef)]);
    const userData = userSnap.exists ? (userSnap.data() || {}) : {};
    const entitlementData = entitlementSnap.exists ? entitlementSnap.data() : null;

    const grantTransition = applyGrantTransition({
      modelId: canonicalModelId,
      source: payload.source,
      referenceId: payload.referenceId,
      unlockedModels: Array.isArray(userData.unlockedModels) ? userData.unlockedModels : [],
      previousEntitlement: entitlementData
        ? {
            active: entitlementData.active === true,
            lastSource: entitlementData.lastSource,
            lastReferenceId: entitlementData.lastReferenceId,
          }
        : null,
    });

    tx.set(userRef, {
      unlockedModels: grantTransition.unlockedModels,
      updatedAt: nowIso,
    }, { merge: true });

    tx.set(entitlementRef, {
      userId: payload.userId,
      modelId: canonicalModelId,
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
        modelId: canonicalModelId,
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
      unlockedModels: grantTransition.unlockedModels,
      modelId: canonicalModelId,
    };
  });
};

export const revokeModelEntitlement = async (db: Firestore, payload: {
  userId: string;
  modelId: string;
  actorUserId?: string;
  reason?: string;
}) => {
  const canonicalModelId = ensureKnownModelId(payload.modelId);
  const entitlementRef = db.collection(MODEL_ENTITLEMENT_COLLECTION).doc(`${payload.userId}_${canonicalModelId}`);
  const userRef = db.collection('users').doc(payload.userId);
  const eventRef = db.collection(MODEL_ENTITLEMENT_EVENT_COLLECTION).doc();
  const nowIso = new Date().toISOString();

  return db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const userData = userSnap.exists ? (userSnap.data() || {}) : {};
    const unlockedModels = applyRevokeTransition(canonicalModelId, Array.isArray(userData.unlockedModels) ? userData.unlockedModels : []);

    tx.set(userRef, {
      unlockedModels,
      updatedAt: nowIso,
    }, { merge: true });

    tx.set(entitlementRef, {
      userId: payload.userId,
      modelId: canonicalModelId,
      active: false,
      revokedAt: nowIso,
      revokedBy: payload.actorUserId || null,
      lastAdminReason: payload.reason || null,
      updatedAt: nowIso,
    }, { merge: true });

    tx.set(eventRef, {
      userId: payload.userId,
      modelId: canonicalModelId,
      action: 'revoke',
      source: 'admin',
      actorUserId: payload.actorUserId || null,
      reason: payload.reason || null,
      createdAt: nowIso,
    });

    return {
      eventId: eventRef.id,
      unlockedModels,
      modelId: canonicalModelId,
    };
  });
};
