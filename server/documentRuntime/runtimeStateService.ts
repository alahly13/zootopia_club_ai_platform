import {
  DOCUMENT_RUNTIME_ACTIVE_DOC_TTL_SEC,
  DOCUMENT_RUNTIME_DOCUMENT_TTL_SEC,
  DOCUMENT_RUNTIME_LOCK_TTL_MS,
  DOCUMENT_RUNTIME_OPERATION_TTL_SEC,
  DOCUMENT_RUNTIME_REDIS_KEY_PREFIX,
  DOCUMENT_RUNTIME_REDIS_URL,
  shouldAllowDocumentRuntimeMemoryFallback,
} from './config.js';
import {
  RedisBackedStoreRegistry,
  acquireRedisLock,
  buildNamespacedRedisKey,
  deleteRedisKey,
  getRedisJson,
  setRedisJson,
} from '../cache/redisBackedStore.js';
import {
  DocumentActorContext,
  DocumentOperationState,
  RuntimeActiveDocumentRef,
} from './types.js';

const registry = new RedisBackedStoreRegistry({
  area: 'document-runtime',
  redisUrl: DOCUMENT_RUNTIME_REDIS_URL,
  allowMemoryFallback: shouldAllowDocumentRuntimeMemoryFallback(),
  fallbackReason:
    'Document runtime keeps an in-memory fallback for local development and CI when Redis is not provisioned.',
});

function buildActorKey(actor: DocumentActorContext, suffix: string): string {
  return buildNamespacedRedisKey(
    DOCUMENT_RUNTIME_REDIS_KEY_PREFIX,
    actor.scope,
    actor.authType,
    actor.actorId,
    suffix
  );
}

export function buildDocumentRuntimeKeySet(actor: DocumentActorContext, documentId: string) {
  return {
    activeDocument: buildActorKey(actor, 'active-doc'),
    document: buildActorKey(actor, `extract:${documentId}`),
    lock: buildActorKey(actor, `locks:extract:${documentId}`),
  };
}

export class RuntimeStateService {
  async setActiveDocument(actor: DocumentActorContext, payload: RuntimeActiveDocumentRef): Promise<void> {
    const adapter = await registry.getAdapter();
    await setRedisJson(
      adapter,
      buildActorKey(actor, 'active-doc'),
      payload,
      DOCUMENT_RUNTIME_ACTIVE_DOC_TTL_SEC
    );
  }

  async getActiveDocument(actor: DocumentActorContext): Promise<RuntimeActiveDocumentRef | null> {
    const adapter = await registry.getAdapter();
    return getRedisJson<RuntimeActiveDocumentRef>(adapter, buildActorKey(actor, 'active-doc'));
  }

  async clearActiveDocument(actor: DocumentActorContext): Promise<void> {
    const adapter = await registry.getAdapter();
    await deleteRedisKey(adapter, buildActorKey(actor, 'active-doc'));
  }

  async setDocumentState(
    actor: DocumentActorContext,
    documentId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const adapter = await registry.getAdapter();
    await setRedisJson(
      adapter,
      buildActorKey(actor, `extract:${documentId}`),
      payload,
      DOCUMENT_RUNTIME_DOCUMENT_TTL_SEC
    );
  }

  async getDocumentState<T = Record<string, unknown>>(
    actor: DocumentActorContext,
    documentId: string
  ): Promise<T | null> {
    const adapter = await registry.getAdapter();
    return getRedisJson<T>(adapter, buildActorKey(actor, `extract:${documentId}`));
  }

  async clearDocumentState(actor: DocumentActorContext, documentId: string): Promise<void> {
    const adapter = await registry.getAdapter();
    await deleteRedisKey(adapter, buildActorKey(actor, `extract:${documentId}`));
  }

  async setOperationState(
    actor: DocumentActorContext,
    operation: DocumentOperationState
  ): Promise<void> {
    const adapter = await registry.getAdapter();
    await setRedisJson(
      adapter,
      buildActorKey(actor, `ops:${operation.operationId}`),
      operation,
      DOCUMENT_RUNTIME_OPERATION_TTL_SEC
    );
  }

  async patchOperationState(
    actor: DocumentActorContext,
    operationId: string,
    patch: Partial<DocumentOperationState>
  ): Promise<DocumentOperationState | null> {
    const adapter = await registry.getAdapter();
    const key = buildActorKey(actor, `ops:${operationId}`);
    const current = await getRedisJson<DocumentOperationState>(adapter, key);
    if (!current) {
      return null;
    }

    const next: DocumentOperationState = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await setRedisJson(adapter, key, next, DOCUMENT_RUNTIME_OPERATION_TTL_SEC);
    return next;
  }

  async getOperationState(
    actor: DocumentActorContext,
    operationId: string
  ): Promise<DocumentOperationState | null> {
    const adapter = await registry.getAdapter();
    return getRedisJson<DocumentOperationState>(adapter, buildActorKey(actor, `ops:${operationId}`));
  }

  async requestCancellation(actor: DocumentActorContext, operationId: string): Promise<void> {
    const adapter = await registry.getAdapter();
    await setRedisJson(
      adapter,
      buildActorKey(actor, `cancel:${operationId}`),
      {
        cancelled: true,
        updatedAt: new Date().toISOString(),
      },
      DOCUMENT_RUNTIME_OPERATION_TTL_SEC
    );
  }

  async isCancellationRequested(actor: DocumentActorContext, operationId: string): Promise<boolean> {
    const adapter = await registry.getAdapter();
    const payload = await getRedisJson<{ cancelled?: boolean }>(
      adapter,
      buildActorKey(actor, `cancel:${operationId}`)
    );
    return payload?.cancelled === true;
  }

  async clearCancellationRequest(actor: DocumentActorContext, operationId: string): Promise<void> {
    const adapter = await registry.getAdapter();
    await deleteRedisKey(adapter, buildActorKey(actor, `cancel:${operationId}`));
  }

  async withDocumentLock<T>(
    actor: DocumentActorContext,
    documentId: string,
    callback: () => Promise<T>
  ): Promise<T> {
    const adapter = await registry.getAdapter();
    const lockKey = buildActorKey(actor, `locks:extract:${documentId}`);
    const token = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    const didAcquire = await acquireRedisLock(adapter, lockKey, token, DOCUMENT_RUNTIME_LOCK_TTL_MS);

    if (!didAcquire) {
      throw new Error('DOCUMENT_RUNTIME_LOCK_CONFLICT');
    }

    try {
      return await callback();
    } finally {
      await deleteRedisKey(adapter, lockKey);
    }
  }
}

export const runtimeStateService = new RuntimeStateService();
