import type express from 'express';

type RateLimitOptions = {
  windowMs: number;
  maxRequests: number;
  name: string;
  keyResolver?: (req: express.Request) => string;
};

type BucketState = {
  count: number;
  resetAt: number;
};

const routeBuckets = new Map<string, BucketState>();

function getDefaultKey(req: express.Request) {
  const userContext = (req as any).userContext;
  return userContext?.uid || req.ip || 'anonymous';
}

export function createRouteRateLimiter(options: RateLimitOptions) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const keyBase = options.keyResolver ? options.keyResolver(req) : getDefaultKey(req);
    const key = `${options.name}:${keyBase}`;
    const now = Date.now();
    const bucket = routeBuckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      routeBuckets.set(key, {
        count: 1,
        resetAt: now + options.windowMs,
      });
      return next();
    }

    if (bucket.count >= options.maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        success: false,
        error: 'Too many requests. Please retry shortly.',
        code: 'RATE_LIMITED',
      });
    }

    bucket.count += 1;
    routeBuckets.set(key, bucket);
    next();
  };
}
