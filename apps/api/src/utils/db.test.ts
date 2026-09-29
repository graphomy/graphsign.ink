import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getDbClient } from './db.js';

describe('getDbClient', () => {
  const originalEnv = process.env.DATABASE_URL;

  beforeEach(() => {
    process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
  });

  afterEach(() => {
    process.env.DATABASE_URL = originalEnv;
  });

  it('returns overridePrisma if provided', () => {
    const mockPrisma = { agreement: {} } as any;
    const client = getDbClient(undefined, mockPrisma);
    expect(client).toBe(mockPrisma);
  });

  it('reuses prisma instance stored on context', () => {
    const mockPrisma = { agreement: {} } as any;
    const mockContext = {
      get: vi.fn().mockReturnValue(mockPrisma),
      set: vi.fn(),
    };
    const client = getDbClient(mockContext);
    expect(client).toBe(mockPrisma);
    expect(mockContext.get).toHaveBeenCalledWith('prisma');
  });

  it('falls back to getLegacyPrisma when DATABASE_URL on context is invalid', () => {
    const mockContext = {
      env: { DATABASE_URL: 'invalid-url' },
      get: vi.fn().mockReturnValue(undefined),
      set: vi.fn(),
    };
    const client = getDbClient(mockContext);
    expect(client).toBeDefined();
    expect(mockContext.set).toHaveBeenCalledWith('prisma', expect.anything());
  });
});
