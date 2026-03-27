import { createClient } from 'redis';
import { logDiagnostic, normalizeError } from '../diagnostics.js';

type MemoryRecord = {
  value: string;
  expiresAt: number | null;
};

export class InMemoryRedisStore {
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

export type SharedRedisAdapter =
  | {
      type: 'redis';
      client: ReturnType<typeof createClient>;
    }
  | {
      type: 'memory';
      client: InMemoryRedisStore;
    };

const SHARED_REDIS_URL = process.env.REDIS_URL?.trim() || '';
const SHARED_REDIS_MEMORY_FALLBACK_ENABLED =
  process.env.ZOOTOPIA_REDIS_MEMORY_FALLBACK_ENABLED !== 'false';

let sharedRedisAdapterPromise: Promise<SharedRedisAdapter> | null = null;

async function createSharedRedisAdapter(): Promise<SharedRedisAdapter> {
  if (SHARED_REDIS_URL) {
    const client = createClient({
      url: SHARED_REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => Math.min(250 * Math.max(retries, 1), 3_000),
      },
    });

    client.on('ready', () => {
      logDiagnostic('info', 'cache.redis.connection_ready', {
        area: 'cache',
        status: 'success',
      });
    });

    client.on('reconnecting', () => {
      logDiagnostic('warn', 'cache.redis.reconnecting', {
        area: 'cache',
        status: 'retrying',
      });
    });

    client.on('end', () => {
      logDiagnostic('warn', 'cache.redis.connection_closed', {
        area: 'cache',
        status: 'closed',
      });
    });

    client.on('error', (error) => {
      logDiagnostic('error', 'cache.redis.connection_error', {
        area: 'cache',
        status: 'failed',
        details: normalizeError(error),
      });
    });

    await client.connect();

    return {
      type: 'redis',
      client,
    };
  }

  if (!SHARED_REDIS_MEMORY_FALLBACK_ENABLED) {
    throw new Error('ZOOTOPIA_REDIS_UNAVAILABLE');
  }

  logDiagnostic('warn', 'cache.redis.memory_fallback_enabled', {
    area: 'cache',
    status: 'degraded',
    details: {
      reason: 'REDIS_URL missing',
      fallback: 'in_memory_process_store',
    },
  });

  return {
    type: 'memory',
    client: new InMemoryRedisStore(),
  };
}

export async function getSharedRedisAdapter(): Promise<SharedRedisAdapter> {
  if (!sharedRedisAdapterPromise) {
    sharedRedisAdapterPromise = createSharedRedisAdapter();
  }

  return sharedRedisAdapterPromise;
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value);
}

export async function setJson(
  adapter: SharedRedisAdapter,
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

export async function getJson<T>(
  adapter: SharedRedisAdapter,
  key: string
): Promise<T | null> {
  const raw =
    adapter.type === 'redis'
      ? await adapter.client.get(key)
      : await adapter.client.get(key);

  if (!raw) {
    return null;
  }

  return JSON.parse(raw) as T;
}

export async function deleteKey(
  adapter: SharedRedisAdapter,
  key: string
): Promise<void> {
  if (adapter.type === 'redis') {
    await adapter.client.del(key);
    return;
  }

  await adapter.client.del(key);
}

export async function setKeyIfNotExists(
  adapter: SharedRedisAdapter,
  key: string,
  value: string,
  ttlMs: number
): Promise<boolean> {
  if (adapter.type === 'redis') {
    const result = await adapter.client.set(key, value, {
      NX: true,
      PX: ttlMs,
    });
    return result === 'OK';
  }

  return adapter.client.setNx(key, value, ttlMs);
}
