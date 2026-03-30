import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acquireStoreLock,
  deleteStoreKey,
  getStoreJson,
  setStoreJson,
} from '../server/cache/firestoreBackedStore.ts';

class FakeDocumentSnapshot {
  constructor(private readonly value: Record<string, unknown> | undefined) {}

  get exists(): boolean {
    return this.value !== undefined;
  }

  data(): Record<string, unknown> | undefined {
    return this.value ? { ...this.value } : undefined;
  }
}

class FakeDocumentReference {
  constructor(
    private readonly buckets: Map<string, Map<string, Record<string, unknown>>>,
    private readonly collectionName: string,
    private readonly documentId: string
  ) {}

  async get(): Promise<FakeDocumentSnapshot> {
    return new FakeDocumentSnapshot(this.buckets.get(this.collectionName)?.get(this.documentId));
  }

  async set(
    value: Record<string, unknown>,
    options?: {
      merge?: boolean;
    }
  ): Promise<void> {
    const bucket = this.ensureBucket();
    if (options?.merge) {
      bucket.set(this.documentId, {
        ...(bucket.get(this.documentId) || {}),
        ...value,
      });
      return;
    }

    bucket.set(this.documentId, { ...value });
  }

  async delete(): Promise<void> {
    this.ensureBucket().delete(this.documentId);
  }

  private ensureBucket(): Map<string, Record<string, unknown>> {
    const existing = this.buckets.get(this.collectionName);
    if (existing) {
      return existing;
    }

    const created = new Map<string, Record<string, unknown>>();
    this.buckets.set(this.collectionName, created);
    return created;
  }
}

class FakeCollectionReference {
  constructor(
    private readonly buckets: Map<string, Map<string, Record<string, unknown>>>,
    private readonly collectionName: string
  ) {}

  doc(documentId: string): FakeDocumentReference {
    return new FakeDocumentReference(this.buckets, this.collectionName, documentId);
  }
}

class FakeFirestore {
  private readonly buckets = new Map<string, Map<string, Record<string, unknown>>>();

  collection(collectionName: string): FakeCollectionReference {
    return new FakeCollectionReference(this.buckets, collectionName);
  }

  async runTransaction<T>(
    callback: (tx: {
      get: (ref: FakeDocumentReference) => Promise<FakeDocumentSnapshot>;
      set: (
        ref: FakeDocumentReference,
        value: Record<string, unknown>,
        options?: { merge?: boolean }
      ) => Promise<void>;
    }) => Promise<T>
  ): Promise<T> {
    return callback({
      get: (ref) => ref.get(),
      set: (ref, value, options) => ref.set(value, options),
    });
  }

  read(collectionName: string, documentId: string): Record<string, unknown> | undefined {
    return this.buckets.get(collectionName)?.get(documentId);
  }
}

function createAdapter(db: FakeFirestore) {
  return {
    type: 'firestore' as const,
    db: db as any,
    collection: db.collection('runtime_cache_entries') as any,
    area: 'test-cache',
  };
}

test('Firestore-backed cache entries round-trip through set/get/delete', async () => {
  const db = new FakeFirestore();
  const adapter = createAdapter(db);

  await setStoreJson(adapter, 'cache:key-1', { hello: 'world' }, 60);
  assert.deepEqual(await getStoreJson(adapter, 'cache:key-1'), { hello: 'world' });

  await deleteStoreKey(adapter, 'cache:key-1');
  assert.equal(await getStoreJson(adapter, 'cache:key-1'), null);
});

test('expired Firestore-backed cache entries are treated as missing and cleaned up on read', async () => {
  const db = new FakeFirestore();
  const adapter = createAdapter(db);
  const expiredAt = new Date(Date.now() - 1_000).toISOString();

  await adapter.collection.doc('cache:expired').set({
    payload: JSON.stringify({ stale: true }),
    expiresAt: expiredAt,
    expiresAtTs: new Date(expiredAt),
  });

  assert.equal(await getStoreJson(adapter, 'cache:expired'), null);
  assert.equal(db.read('runtime_cache_entries', 'cache:expired'), undefined);
});

test('Firestore-backed locks reject active contenders and allow reuse after expiry', async () => {
  const db = new FakeFirestore();
  const adapter = createAdapter(db);

  assert.equal(await acquireStoreLock(adapter, 'locks:doc-1', 'token-a', 60_000), true);
  assert.equal(await acquireStoreLock(adapter, 'locks:doc-1', 'token-b', 60_000), false);

  const expiredAt = new Date(Date.now() - 1_000).toISOString();
  await adapter.collection.doc('locks:doc-1').set({
    payload: JSON.stringify({ lockOwner: 'token-a' }),
    expiresAt: expiredAt,
    expiresAtTs: new Date(expiredAt),
  });

  assert.equal(await acquireStoreLock(adapter, 'locks:doc-1', 'token-c', 60_000), true);
});
