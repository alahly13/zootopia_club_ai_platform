/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * © Zootopia Club – Copyright Ebn Abdallah Yousef
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

type LogPayload = {
  traceId?: string;
  area?: string;
  event?: string;
  [key: string]: unknown;
};

class Logger {
  private isEnabled: boolean = import.meta.env.DEV;

  private readonly maxDepth = 4;
  private readonly maxArray = 25;

  private shouldLog(level: LogLevel): boolean {
    if (level === 'error' || level === 'warn') return true;
    return this.isEnabled;
  }

  private isSensitiveKey(key: string): boolean {
    const normalized = key.toLowerCase();
    return [
      'apikey',
      'api_key',
      'token',
      'accesstoken',
      'authorization',
      'password',
      'secret',
      'privatekey',
      'session',
      'cookie',
    ].some(fragment => normalized.includes(fragment));
  }

  private sanitize(value: unknown, depth = 0): unknown {
    if (value === null || value === undefined) return value;

    if (typeof value === 'string') {
      if (value.length > 4000) {
        return `${value.slice(0, 4000)}...[truncated]`;
      }
      return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: import.meta.env.DEV ? value.stack : undefined,
      };
    }

    if (depth >= this.maxDepth) {
      return '[max-depth]';
    }

    if (Array.isArray(value)) {
      return value.slice(0, this.maxArray).map(item => this.sanitize(item, depth + 1));
    }

    if (typeof value === 'object') {
      const output: Record<string, unknown> = {};
      for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
        if (this.isSensitiveKey(key)) {
          output[key] = '[redacted]';
        } else {
          output[key] = this.sanitize(nested, depth + 1);
        }
      }
      return output;
    }

    return String(value);
  }

  private log(level: LogLevel, message: string, data?: unknown) {
    if (!this.shouldLog(level)) return;

    const timestamp = new Date().toISOString();
    const prefix = `[Zootopia ${level.toUpperCase()}]`;
    const safeData = this.sanitize(data);
    const payload = {
      ts: timestamp,
      level,
      message,
      ...(typeof safeData === 'object' && safeData !== null ? (safeData as LogPayload) : { data: safeData }),
    };

    switch (level) {
      case 'info':
        console.log(prefix, payload);
        break;
      case 'warn':
        console.warn(prefix, payload);
        break;
      case 'error':
        console.error(prefix, payload);
        break;
      case 'debug':
        console.debug(prefix, payload);
        break;
    }
  }

  info(message: string, data?: unknown) { this.log('info', message, data); }
  warn(message: string, data?: unknown) { this.log('warn', message, data); }
  error(message: string, data?: unknown) { this.log('error', message, data); }
  debug(message: string, data?: unknown) { this.log('debug', message, data); }
}

export const logger = new Logger();
