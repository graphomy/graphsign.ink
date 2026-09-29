import { describe, it, expect } from 'vitest';
import app from './index.js';

describe('CORS Preflight Caching (INK-300)', () => {
  it('returns Access-Control-Max-Age header on valid preflight OPTIONS request', async () => {
    const res = await app.request(
      '/api/v1/health',
      {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://dev.graphsign.ink',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type, Authorization',
        },
      },
      {
        WEB_URL: 'https://dev.graphsign.ink,https://dev-graphsign-web.pages.dev',
        DATABASE_URL: 'postgres://dummy',
        JWT_SECRET: 'test-secret',
        JWT_ACCESS_TOKEN_EXPIRY: '15m',
        RESEND_API_KEY: 'test',
        EMAIL_FROM: 'test@example.com',
        API_URL: 'http://localhost:8787',
        NODE_ENV: 'test',
        SUPERADMIN_ID: 'admin-1',
      },
    );

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://dev.graphsign.ink');
    expect(res.headers.get('Access-Control-Max-Age')).toBe('86400');
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  it('allows local development origins with preflight cache', async () => {
    const res = await app.request('/api/v1/health', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3000',
        'Access-Control-Request-Method': 'GET',
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
    expect(res.headers.get('Access-Control-Max-Age')).toBe('86400');
  });

  it('rejects disallowed origins', async () => {
    const res = await app.request(
      '/api/v1/health',
      {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://malicious-site.com',
          'Access-Control-Request-Method': 'POST',
        },
      },
      {
        WEB_URL: 'https://dev.graphsign.ink',
        DATABASE_URL: 'postgres://dummy',
        JWT_SECRET: 'test-secret',
        JWT_ACCESS_TOKEN_EXPIRY: '15m',
        RESEND_API_KEY: 'test',
        EMAIL_FROM: 'test@example.com',
        API_URL: 'http://localhost:8787',
        NODE_ENV: 'test',
        SUPERADMIN_ID: 'admin-1',
      },
    );

    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
