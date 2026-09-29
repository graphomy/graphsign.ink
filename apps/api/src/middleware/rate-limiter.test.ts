import { Hono } from 'hono';
import type { PrismaClient } from '@graphsign/db';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from './error-handler.js';
import { createRateLimiter, MemoryRateLimitStore, PrismaRateLimitStore } from './rate-limiter.js';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('rate limiter window compatibility', () => {
  it.each([undefined, 60_000])(
    'resets the route quota after one minute (window %s)',
    async (windowMs) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-17T12:00:00Z'));
      vi.stubEnv('DATABASE_URL', '');
      const app = new Hono();
      app.onError(errorHandler);
      app.use('*', createRateLimiter(1, windowMs, { store: new MemoryRateLimitStore() }));
      app.get('/records', (c) => c.json({ items: [] }));
      const first = await app.request('/records');
      expect(first.status).toBe(200);
      expect(first.headers.get('X-RateLimit-Reset')).toBe('60');
      vi.advanceTimersByTime(30_000);
      const blocked = await app.request('/records');
      expect(blocked.status).toBe(429);
      expect(blocked.headers.get('Retry-After')).toBe('30');
      vi.advanceTimersByTime(30_000);
      const recovered = await app.request('/records');
      expect(recovered.status).toBe(200);
      expect(recovered.headers.get('X-RateLimit-Reset')).toBe('60');
    },
  );

  it('converts milliseconds before calling the durable store', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const consume = vi
      .fn()
      .mockResolvedValue({ allowed: true, limit: 10, remaining: 9, resetSeconds: 60 });
    const app = new Hono();
    app.use('*', createRateLimiter(10, 60_000, { store: { consume } }));
    app.get('/records', (c) => c.text('ok'));
    await app.request('/records');
    expect(consume).toHaveBeenCalledWith(expect.any(String), 10, 60);
  });
});

describe('repair persisted oversized windows', () => {
  it.each([30, 120])('repairs a window started %s seconds ago', async (ageSeconds) => {
    vi.useFakeTimers();
    const now = new Date('2026-09-17T12:00:00Z');
    vi.setSystemTime(now);
    const startedAt = new Date(now.getTime() - ageSeconds * 1000);
    const rateLimitState = {
      findUnique: vi.fn().mockResolvedValue({
        key: 'test',
        tokens: 100,
        lastRefillAt: startedAt,
        expiresAt: new Date(startedAt.getTime() + 60_000_000),
      }),
      upsert: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    };
    const store = new PrismaRateLimitStore({ rateLimitState } as unknown as PrismaClient);
    const result = await store.consume('test', 100, 60);
    if (ageSeconds === 30) {
      expect(result).toMatchObject({ allowed: false, resetSeconds: 30 });
      expect(rateLimitState.update).toHaveBeenCalledWith({
        where: { key: 'test' },
        data: { tokens: 101, expiresAt: new Date(startedAt.getTime() + 60_000) },
      });
    } else {
      expect(result).toMatchObject({ allowed: true, remaining: 99, resetSeconds: 60 });
      expect(rateLimitState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { tokens: 1, lastRefillAt: now, expiresAt: new Date(now.getTime() + 60_000) },
        }),
      );
    }
  });
});
