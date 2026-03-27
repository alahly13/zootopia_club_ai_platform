import { createClient } from 'redis';
import { logDiagnostic, normalizeError } from '../diagnostics.js';

type MemoryRecord = {
  value: string;
  expiresAt: number | null;
};

class InMemoryRedisStore {
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

export type RedisStoreAdapter =
  | {
      type: 'redis';
      client: ReturnType<typeof createClient>;
    }
  | {
      type: 'memory';
      client: InMemoryRedisStore;
    };

export type RedisStoreRegistryOptions = {
  area: string;
  redisUrl?: string;
  allowMemoryFallback: boolean;
  fallbackReason: string;
};

export function buildNamespacedRedisKey(prefix: string, ...segments: Array<string | number | null | undefined>) {
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

export function stringifyRedisJson(value: unknown): string {
  return JSON.stringify(value);
}

export async function setRedisJson(
  adapter: RedisStoreAdapter,
  key: string,
  value: unknown,
  ttlSec?: number
): Promise<void> {
  const payload = stringifyRedisJson(value);

  if (adapter.type === 'redis') {
    if (typeof ttlSec === 'number') {
      await adapter.client.set(key, payload, {
        EX: ttlSec,
      });
      return;
    }

    await adapter.client.set(key, payload);
    return;
  }

  await adapter.client.set(key, payload, ttlSec);
}

export async function getRedisJson<T>(adapter: RedisStoreAdapter, key: string): Promise<T | null> {
  const raw =
    adapter.type === 'redis'
      ? await adapter.client.get(key)
      : await adapter.client.get(key);

  if (!raw) {
    return null;
  }

  return JSON.parse(raw) as T;
}

export async function deleteRedisKey(adapter: RedisStoreAdapter, key: string): Promise<void> {
  if (adapter.type === 'redis') {
    await adapter.client.del(key);
    return;
  }

  await adapter.client.del(key);
}

export async function acquireRedisLock(
  adapter: RedisStoreAdapter,
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

export class RedisBackedStoreRegistry {
  private adapterPromise: Promise<RedisStoreAdapter> | null = null;

  constructor(private readonly options: RedisStoreRegistryOptions) {}

  private attachRedisDiagnostics(client: ReturnType<typeof createClient>): void {
    const baseContext = {
      area: this.options.area,
      details: {
        redisConfigured: Boolean(this.options.redisUrl),
      },
    };

    client.on('ready', () => {
      logDiagnostic('info', 'cache.redis.ready', baseContext);
    });

    client.on('reconnecting', () => {
      logDiagnostic('warn', 'cache.redis.reconnecting', baseContext);
    });

    client.on('end', () => {
      logDiagnostic('warn', 'cache.redis.disconnected', baseContext);
    });

    client.on('error', (error) => {
      logDiagnostic('error', 'cache.redis.error', {
        ...baseContext,
        details: normalizeError(error),
      });
    });
  }

  private createMemoryAdapter(details?: Record<string, unknown>): RedisStoreAdapter {
    logDiagnostic('warn', 'cache.redis.memory_fallback_enabled', {
      area: this.options.area,
      details: {
        reason: this.options.fallbackReason,
        ...details,
      },
    });

    return {
      type: 'memory',
      client: new InMemoryRedisStore(),
    };
  }

  private async createAdapter(): Promise<RedisStoreAdapter> {
    const normalizedUrl = this.options.redisUrl?.trim();

    if (!normalizedUrl) {
      if (!this.options.allowMemoryFallback) {
        throw new Error('REDIS_CONFIGURATION_REQUIRED');
      }

      return this.createMemoryAdapter({
        redisConfigured: false,
      });
    }

    const client = createClient({
      url: normalizedUrl,
      socket: {
        connectTimeout: 5_000,
        keepAlive: 5_000,
        reconnectStrategy: (retries) => Math.min(300 * retries, 3_000),
      },
    });

    this.attachRedisDiagnostics(client);

    try {
      await client.connect();
      await client.ping();
      return {
        type: 'redis',
        client,
      };
    } catch (error) {
      if (!this.options.allowMemoryFallback) {
        throw error;
      }

      return this.createMemoryAdapter({
        redisConfigured: true,
        connectionError: normalizeError(error),
      });
    }
  }

  async getAdapter(): Promise<RedisStoreAdapter> {
    if (!this.adapterPromise) {
      this.adapterPromise = this.createAdapter();
    }

    return this.adapterPromise;
  }
}
