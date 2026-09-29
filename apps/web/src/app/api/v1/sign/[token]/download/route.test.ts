import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, runtime, dynamic } from './route';

vi.mock('@/lib/api', () => ({
  getApiUrl: vi.fn(() => 'https://api.graphsign.ink'),
}));

describe('/api/v1/sign/[token]/download route handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports edge runtime and force-dynamic segment config for Cloudflare Pages', () => {
    expect(runtime).toBe('edge');
    expect(dynamic).toBe('force-dynamic');
  });

  it('redirects to the backend download URL with status 307 when params is an object', async () => {
    const request = new Request('https://graphsign.ink/api/v1/sign/test-token-123/download');
    const response = await GET(request, { params: { token: 'test-token-123' } });

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://api.graphsign.ink/api/v1/sign/test-token-123/download',
    );
  });

  it('redirects correctly when params is a Promise (Next.js 15+ async params)', async () => {
    const request = new Request('https://graphsign.ink/api/v1/sign/async-token-456/download');
    const response = await GET(request, {
      params: Promise.resolve({ token: 'async-token-456' }),
    });

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://api.graphsign.ink/api/v1/sign/async-token-456/download',
    );
  });

  it('encodes URI components in the token parameter', async () => {
    const request = new Request('https://graphsign.ink/api/v1/sign/token%20with%20spaces/download');
    const response = await GET(request, {
      params: { token: 'token with spaces' },
    });

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://api.graphsign.ink/api/v1/sign/token%20with%20spaces/download',
    );
  });
});
