import { logDiagnostic } from '../diagnostics.js';

type MemoryRecord = {
  value: string;
  expiresAt: number | null;
};

class InMemoryStore {
  private readonly records = new Map<string, MemoryRecord>();

  private cleanup(key: string): void {
    const record = this.records.get(key);
    if (!record) {
      return;
    }

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

export type FirestoreStoreAdapter =
  | {
      type: 'firestore';
      db: FirebaseFirestore.Firestore;
      collection: FirebaseFirestore.CollectionReference;
      area: string;
    }
  | {
      type: 'memory';
      client: InMemoryStore;
      area: string;
    };

export type FirestoreStoreRegistryOptions = {
  area: string;
  collectionName?: string;
  allowMemoryFallback: boolean;
  fallbackReason: string;
};

const DEFAULT_COLLECTION_NAME = 'runtime_cache_entries';

function buildExpiryIso(ttlSec?: number): string | null {
  if (typeof ttlSec !== 'number') {
    return null;
  }

  return new Date(Date.now() + ttlSec * 1000).toISOString();
}

function resolveExpiryMs(value: unknown): number | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.getTime() : null;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const expiresAtMs = new Date(value).getTime();
    return Number.isFinite(expiresAtMs) ? expiresAtMs : null;
  }

  if (typeof (value as { toDate?: unknown }).toDate === 'function') {
    const date = (value as { toDate: () => Date }).toDate();
    const expiresAtMs = date.getTime();
    return Number.isFinite(expiresAtMs) ? expiresAtMs : null;
  }

  if (typeof (value as { seconds?: unknown }).seconds === 'number') {
    const seconds = Number((value as { seconds: number }).seconds);
    const nanoseconds =
      typeof (value as { nanoseconds?: unknown }).nanoseconds === 'number'
        ? Number((value as { nanoseconds: number }).nanoseconds)
        : 0;
    return seconds * 1000 + Math.floor(nanoseconds / 1_000_000);
  }

  return null;
}

function isExpired(value: unknown): boolean {
  const expiresAtMs = resolveExpiryMs(value);
  return expiresAtMs !== null && expiresAtMs <= Date.now();
}

function serializeStorePayload(value: unknown): string {
  return JSON.stringify(value);
}

function logMemoryFallback(
  area: string,
  fallbackReason: string,
  details?: Record<string, unknown>
): void {
  logDiagnostic('warn', 'cache.firestore.memory_fallback_enabled', {
    area,
    details: {
      reason: fallbackReason,
      ...details,
    },
  });
}

export function buildNamespacedStoreKey(
  prefix: string,
  ...segments: Array<string | number | null | undefined>
): string {
  const normalizedSegments = segments
    .filter((segment) => segment !== undefined && segment !== null && String(segment).trim().length > 0)
    .map((segment) =>
      String(segment)
        .trim()
        .replace(/\s+/g, '_')
        .replace(/[:]+/g, '_')
    );

  return [prefix.trim(), ...normalizedSegments].filter(Boolean).join(':');
}

export async function setStoreJson(
  adapter: FirestoreStoreAdapter,
  key: string,
  value: unknown,
  ttlSec?: number
): Promise<void> {
  const payload = serializeStorePayload(value);

  if (adapter.type === 'firestore') {
    const expiresAt = buildExpiryIso(ttlSec);
    await adapter.collection.doc(key).set({
      area: adapter.area,
      key,
      kind: 'value',
      payload,
      updatedAt: new Date().toISOString(),
      expiresAt,
      expiresAtTs: expiresAt ? new Date(expiresAt) : null,
    });
    return;
  }

  await adapter.client.set(key, payload, ttlSec);
}

export async function getStoreJson<T>(
  adapter: FirestoreStoreAdapter,
  key: string
): Promise<T | null> {
  if (adapter.type === 'firestore') {
    const ref = adapter.collection.doc(key);
    const snap = await ref.get();
    if (!snap.exists) {
      return null;
    }

    const data = snap.data() as Record<string, unknown> | undefined;
    const expiresAt = data?.expiresAtTs || data?.expiresAt;
    if (isExpired(expiresAt)) {
      await ref.delete().catch(() => undefined);
      return null;
    }

    if (typeof data?.payload !== 'string') {
      return null;
    }

    return JSON.parse(data.payload) as T;
  }

  const raw = await adapter.client.get(key);
  if (!raw) {
    return null;
  }

  return JSON.parse(raw) as T;
}

export async function deleteStoreKey(
  adapter: FirestoreStoreAdapter,
  key: string
): Promise<void> {
  if (adapter.type === 'firestore') {
    await adapter.collection.doc(key).delete();
    return;
  }

  await adapter.client.del(key);
}

export async function acquireStoreLock(
  adapter: FirestoreStoreAdapter,
  key: string,
  value: string,
  ttlMs: number
): Promise<boolean> {
  if (adapter.type === 'firestore') {
    const ref = adapter.collection.doc(key);
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();

    return adapter.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      const data = snap.data() as Record<string, unknown> | undefined;
      const active = snap.exists && !isExpired(data?.expiresAtTs || data?.expiresAt);
      if (active) {
        return false;
      }

      transaction.set(ref, {
        area: adapter.area,
        key,
        kind: 'lock',
        lockOwner: value,
        payload: serializeStorePayload({ lockOwner: value }),
        updatedAt: new Date().toISOString(),
        expiresAt,
        expiresAtTs: new Date(expiresAt),
      });

      return true;
    });
  }

  return adapter.client.setNx(key, value, ttlMs);
}

export class FirestoreBackedStoreRegistry {
  private adapterPromise: Promise<FirestoreStoreAdapter> | null = null;
  private firestore: FirebaseFirestore.Firestore | null = null;

  constructor(private readonly options: FirestoreStoreRegistryOptions) {}

  configureFirestore(db: FirebaseFirestore.Firestore): void {
    this.firestore = db;
    this.adapterPromise = null;
  }

  private createMemoryAdapter(details?: Record<string, unknown>): FirestoreStoreAdapter {
    logMemoryFallback(this.options.area, this.options.fallbackReason, details);
    return {
      type: 'memory',
      client: new InMemoryStore(),
      area: this.options.area,
    };
  }

  private async createAdapter(): Promise<FirestoreStoreAdapter> {
    if (!this.firestore) {
      if (!this.options.allowMemoryFallback) {
        throw new Error('FIRESTORE_CONFIGURATION_REQUIRED');
      }

      return this.createMemoryAdapter({
        firestoreConfigured: false,
      });
    }

    return {
      type: 'firestore',
      db: this.firestore,
      collection: this.firestore.collection(this.options.collectionName || DEFAULT_COLLECTION_NAME),
      area: this.options.area,
    };
  }

  async getAdapter(): Promise<FirestoreStoreAdapter> {
    if (!this.adapterPromise) {
      this.adapterPromise = this.createAdapter();
    }

    return this.adapterPromise;
  }
}
