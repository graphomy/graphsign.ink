/**
 * Resolves the base URL for backend API requests across development and production deployments.
 */
export function getApiUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl && envUrl.trim() !== '') {
    return envUrl.trim().replace(/\/+$/, '');
  }

  if (typeof window !== 'undefined') {
    const hostname = window?.location?.hostname || '';
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.') ||
      hostname.endsWith('.local')
    ) {
      return `http://${hostname}:8787`;
    }
    // Intelligent domain fallbacks for Cloudflare Pages preview & production environments
    if (
      hostname &&
      (hostname === 'dev.graphsign.ink' ||
        hostname.includes('dev-graphsign-web') ||
        hostname.includes('dev.'))
    ) {
      return 'https://dev-graphsign-api.kunal-f9f.workers.dev';
    }
    if (
      hostname &&
      (hostname === 'graphsign.ink' ||
        hostname === 'www.graphsign.ink' ||
        hostname.includes('graphsign-web.pages.dev'))
    ) {
      return 'https://graphsign-api.kunal-f9f.workers.dev';
    }
    // Fallback to relative base URL (or current origin)
    return window.location?.origin || 'http://localhost:8787';
  }

  return 'http://localhost:8787';
}
