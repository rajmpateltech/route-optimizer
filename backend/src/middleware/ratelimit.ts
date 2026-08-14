import type { NextFunction, Request, RequestHandler, Response } from 'express';
import Redis from 'ioredis';
import { config } from '../config';

/**
 * Fixed-window rate limiter. Uses Redis when configured (multi-instance),
 * otherwise a per-process in-memory window.
 */
class RateLimiter {
  private redis: Redis | null = null;
  private memory = new Map<string, { count: number; resetAt: number }>();

  constructor() {
    if (config.redisUrl) {
      this.redis = new Redis(config.redisUrl, { lazyConnect: true });
      this.redis.connect().catch(() => {
        // eslint-disable-next-line no-console
        console.warn('Redis unavailable; falling back to in-memory rate limiting');
        this.redis = null;
      });
    }
  }

  async allow(
    key: string,
    limit: number,
    windowSec: number,
  ): Promise<{ ok: boolean; remaining: number; retryAfterSec: number }> {
    if (this.redis) {
      try {
        const windowMs = windowSec * 1000;
        const now = Date.now();
        const bucket = Math.floor(now / windowMs);
        const redisKey = `rl:${key}:${bucket}`;
        const count = await this.redis.incr(redisKey);
        if (count === 1) await this.redis.expire(redisKey, windowSec + 1);
        const remaining = Math.max(0, limit - count);
        const resetMs = (bucket + 1) * windowMs;
        return { ok: count <= limit, remaining, retryAfterSec: Math.ceil((resetMs - now) / 1000) };
      } catch {
        // fall through to memory
      }
    }
    const now = Date.now();
    const bucket = Math.floor(now / (windowSec * 1000));
    const key2 = `${bucket}:${key}`;
    const entry = this.memory.get(key2);
    if (!entry) {
      this.memory.set(key2, { count: 1, resetAt: now + windowSec * 1000 });
      return { ok: true, remaining: limit - 1, retryAfterSec: 0 };
    }
    entry.count += 1;
    if (entry.resetAt < now) {
      this.memory.delete(key2);
      return this.allow(key, limit, windowSec);
    }
    return {
      ok: entry.count <= limit,
      remaining: Math.max(0, limit - entry.count),
      retryAfterSec: Math.ceil((entry.resetAt - now) / 1000),
    };
  }
}

export const rateLimiter = new RateLimiter();

export function rateLimit(opts: { limit: number; windowSec: number }): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = req.user?.id ?? req.ip ?? 'unknown';
    const result = await rateLimiter.allow(key, opts.limit, opts.windowSec);
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));
    if (!result.ok) {
      res.setHeader('Retry-After', String(result.retryAfterSec));
      res.status(429).json({ error: 'Too many requests, slow down' });
      return;
    }
    next();
  };
}
