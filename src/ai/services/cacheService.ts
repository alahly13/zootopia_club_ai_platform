import { AIRequestOptions, AIResponse } from '../types';
import { toCanonicalModelId } from '../models/modelRegistry';

class CacheService {
  private cache = new Map<string, { response: AIResponse, timestamp: number }>();
  private readonly TTL = 1000 * 60 * 60; // 1 hour

  private stableStringify(value: unknown): string {
    if (value === null || value === undefined) return String(value);
    if (typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(v => this.stableStringify(v)).join(',')}]`;

    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map(k => `${JSON.stringify(k)}:${this.stableStringify(obj[k])}`).join(',')}}`;
  }

  private getCacheKey(options: AIRequestOptions, contents: any): string {
    // Exclude sensitive or highly variable fields from the cache key
    const { apiKey, observability, ...cacheableOptions } = options;

    const normalizedCacheableOptions = {
      ...cacheableOptions,
      modelId: toCanonicalModelId(cacheableOptions.modelId),
      toolId: (cacheableOptions.toolId || '').trim()
    };
    
    // Ensure contents are stringified consistently
    const contentsStr = typeof contents === 'string' ? contents : this.stableStringify(contents);
    
    return this.stableStringify({ cacheableOptions: normalizedCacheableOptions, contents: contentsStr });
  }

  get(options: AIRequestOptions, contents: any): AIResponse | null {
    try {
      const key = this.getCacheKey(options, contents);
      const cached = this.cache.get(key);
      if (cached) {
        if (Date.now() - cached.timestamp < this.TTL) {
          console.log(`[Cache Hit] Returning cached response for tool: ${options.toolId}`);
          return cached.response;
        } else {
          this.cache.delete(key);
        }
      }
    } catch (e) {
      console.warn("Error reading from AI cache", e);
    }
    return null;
  }

  set(options: AIRequestOptions, contents: any, response: AIResponse): void {
    try {
      // Don't cache errors
      if (response.error) return;

      // Persist only deterministic data. Trace payloads are runtime diagnostics
      // and should never be replayed from cache into a new operation.
      const { trace, traceId, cacheHit, errorInfo, ...cacheableResponse } = response;
      
      const key = this.getCacheKey(options, contents);
      this.cache.set(key, { response: cacheableResponse, timestamp: Date.now() });
    } catch (e) {
      console.warn("Error writing to AI cache", e);
    }
  }
  
  clear(): void {
    this.cache.clear();
  }
}

export const aiCache = new CacheService();
