/**
 * Resolves the base URL for backend API requests across development and production deployments.
 */
export function getApiUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl && envUrl.trim() !== '') {
    return envUrl.trim().replace(/\/+$/, '');
  }

  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:8787';
    }
    // In production published deployments where NEXT_PUBLIC_API_URL was not set at build time,
    // fallback to relative base URL (or current origin)
    return window.location.origin;
  }

  return 'http://localhost:8787';
}
