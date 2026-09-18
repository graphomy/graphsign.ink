/** Allows only an internal agreement-list return location. */
export function agreementReturnUrl(value?: string | null): string {
  if (!value) return '/agreements?tab=active';
  try {
    const url = new URL(value, 'https://graphsign.ink');
    if (url.origin !== 'https://graphsign.ink' || url.pathname !== '/agreements')
      return '/agreements?tab=active';
    url.searchParams.delete('action');
    return url.pathname + url.search;
  } catch {
    return '/agreements?tab=active';
  }
}
