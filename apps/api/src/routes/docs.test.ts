import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { createDocsRoutes } from './docs.js';

describe('Docs Routes & Interactive Scalar Reference (INK-146)', () => {
  const app = new Hono();
  app.route('/api/v1/docs', createDocsRoutes());

  it('serves OpenAPI 3.1 schema json', async () => {
    const res = await app.request('/api/v1/docs/openapi.json');
    expect(res.status).toBe(200);
    const schema = (await res.json()) as any;
    expect(schema.openapi).toBe('3.1.0');
    expect(schema.paths).toHaveProperty('/api/v1/organisations/me/api-clients');
    expect(schema.paths).toHaveProperty('/api/v1/webhooks');
  });

  it('serves Scalar reference HTML with relaxed script CSP at /api/v1/docs', async () => {
    const res = await app.request('/api/v1/docs');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');

    // Verify CSP allows jsdelivr CDN
    const csp = res.headers.get('content-security-policy') || '';
    expect(csp).toContain('https://cdn.jsdelivr.net');

    // Verify embedded json spec prevents blank page
    const html = await res.text();
    expect(html).toContain('id="api-reference"');
    expect(html).toContain('type="application/json"');
    expect(html).toContain('GraphSign API Reference');
  });

  it('serves Scalar reference HTML with trailing slash at /api/v1/docs/', async () => {
    const res = await app.request('/api/v1/docs/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
  });
});
