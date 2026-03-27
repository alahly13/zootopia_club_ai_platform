import { createClient } from 'redis';
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
  DocumentActorContext,
  DocumentOperationState,
  RuntimeActiveDocumentRef,
} from './types.js';

type MemoryRecord = {
  value: string;
  expiresAt: number | null;
};

class InMemoryRuntimeStore {
  private readonly records = new Map<string, MemoryRecord>();

  private cleanup(key: string): void {
    const record = this.records.get(key);
    if (!record) return;
    if (record.expiresAt !== null && record.expiresAt <= Date.now()) {
      this.records.delete(key);
    }
  }

  async get(key: string): Promise<string | null> {
    this.cleanup(key);
    return this.records.get(key)?.value || null;
  }

  async set(key: string, value: string, ttlSec?: number): Promise<void> {
    this.records.set(key, {
      value,
      expiresAt: typeof ttlSec === 'number' ? Date.now() + ttlSec * 1000 : null,
    });
  }

  async del(key: string): Promise<void> {
    this.records.delete(key);
  }

  async setNx(key: string, value: string, ttlMs: number): Promise<boolean> {
    this.cleanup(key);
    if (this.records.has(key)) {
      return false;
    }

    this.records.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
    return true;
  }
}

type RuntimeStoreAdapter =
  | {
      type: 'redis';
      client: ReturnType<typeof createClient>;
    }
  | {
      type: 'memory';
      client: InMemoryRuntimeStore;
    };

class RedisRuntimeRegistry {
  private adapterPromise: Promise<RuntimeStoreAdapter> | null = null;

  private async createAdapter(): Promise<RuntimeStoreAdapter> {
    if (DOCUMENT_RUNTIME_REDIS_URL) {
      const client = createClient({
        url: DOCUMENT_RUNTIME_REDIS_URL,
      });
      await client.connect();
      return {
        type: 'redis',
        client,
      };
    }

    if (!shouldAllowDocumentRuntimeMemoryFallback()) {
      throw new Error('DOCUMENT_RUNTIME_REDIS_UNAVAILABLE');
    }

    return {
      type: 'memory',
      client: new InMemoryRuntimeStore(),
    };
  }

  async getAdapter(): Promise<RuntimeStoreAdapter> {
    if (!this.adapterPromise) {
      this.adapterPromise = this.createAdapter();
    }

    return this.adapterPromise;
  }
}

const registry = new RedisRuntimeRegistry();

function buildActorKey(actor: DocumentActorContext, suffix: string): string {
  return `${DOCUMENT_RUNTIME_REDIS_KEY_PREFIX}:${actor.scope}:${actor.actorId}:${suffix}`;
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value);
}

async function setJson(
  adapter: RuntimeStoreAdapter,
  key: string,
  value: unknown,
  ttlSec?: number
): Promise<void> {
  if (adapter.type === 'redis') {
    if (typeof ttlSec === 'number') {
      await adapter.client.set(key, stringifyJson(value), {
        EX: ttlSec,
      });
      return;
    }

    await adapter.client.set(key, stringifyJson(value));
    return;
  }

  await adapter.client.set(key, stringifyJson(value), ttlSec);
}

async function getJson<T>(adapter: RuntimeStoreAdapter, key: string): Promise<T | null> {
  const raw =
    adapter.type === 'redis'
      ? await adapter.client.get(key)
      : await adapter.client.get(key);

  if (!raw) {
    return null;
  }

  return JSON.parse(raw) as T;
}

async function deleteKey(adapter: RuntimeStoreAdapter, key: string): Promise<void> {
  if (adapter.type === 'redis') {
    await adapter.client.del(key);
    return;
  }

  await adapter.client.del(key);
}

async function acquireLock(
  adapter: RuntimeStoreAdapter,
  key: string,
  token: string,
  ttlMs: number
): Promise<boolean> {
  if (adapter.type === 'redis') {
    const result = await adapter.client.set(key, token, {
      NX: true,
      PX: ttlMs,
    });
    return result === 'OK';
  }

  return adapter.client.setNx(key, token, ttlMs);
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
    await setJson(
      adapter,
      buildActorKey(actor, 'active-doc'),
      payload,
      DOCUMENT_RUNTIME_ACTIVE_DOC_TTL_SEC
    );
  }

  async getActiveDocument(actor: DocumentActorContext): Promise<RuntimeActiveDocumentRef | null> {
    const adapter = await registry.getAdapter();
    return getJson<RuntimeActiveDocumentRef>(adapter, buildActorKey(actor, 'active-doc'));
  }

  async clearActiveDocument(actor: DocumentActorContext): Promise<void> {
    const adapter = await registry.getAdapter();
    await deleteKey(adapter, buildActorKey(actor, 'active-doc'));
  }

  async setDocumentState(
    actor: DocumentActorContext,
    documentId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const adapter = await registry.getAdapter();
    await setJson(
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
    return getJson<T>(adapter, buildActorKey(actor, `extract:${documentId}`));
  }

  async clearDocumentState(actor: DocumentActorContext, documentId: string): Promise<void> {
    const adapter = await registry.getAdapter();
    await deleteKey(adapter, buildActorKey(actor, `extract:${documentId}`));
  }

  async setOperationState(
    actor: DocumentActorContext,
    operation: DocumentOperationState
  ): Promise<void> {
    const adapter = await registry.getAdapter();
    await setJson(
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
    const current = await getJson<DocumentOperationState>(adapter, key);
    if (!current) {
      return null;
    }

    const next: DocumentOperationState = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await setJson(adapter, key, next, DOCUMENT_RUNTIME_OPERATION_TTL_SEC);
    return next;
  }

  async getOperationState(
    actor: DocumentActorContext,
    operationId: string
  ): Promise<DocumentOperationState | null> {
    const adapter = await registry.getAdapter();
    return getJson<DocumentOperationState>(adapter, buildActorKey(actor, `ops:${operationId}`));
  }

  async requestCancellation(actor: DocumentActorContext, operationId: string): Promise<void> {
    const adapter = await registry.getAdapter();
    await setJson(
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
    const payload = await getJson<{ cancelled?: boolean }>(
      adapter,
      buildActorKey(actor, `cancel:${operationId}`)
    );
    return payload?.cancelled === true;
  }

  async clearCancellationRequest(actor: DocumentActorContext, operationId: string): Promise<void> {
    const adapter = await registry.getAdapter();
    await deleteKey(adapter, buildActorKey(actor, `cancel:${operationId}`));
  }

  async withDocumentLock<T>(
    actor: DocumentActorContext,
    documentId: string,
    callback: () => Promise<T>
  ): Promise<T> {
    const adapter = await registry.getAdapter();
    const lockKey = buildActorKey(actor, `locks:extract:${documentId}`);
    const token = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    const didAcquire = await acquireLock(adapter, lockKey, token, DOCUMENT_RUNTIME_LOCK_TTL_MS);

    if (!didAcquire) {
      throw new Error('DOCUMENT_RUNTIME_LOCK_CONFLICT');
    }

    try {
      return await callback();
    } finally {
      await deleteKey(adapter, lockKey);
    }
  }
}

export const runtimeStateService = new RuntimeStateService();
