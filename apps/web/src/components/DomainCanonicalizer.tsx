'use client';

import { useEffect } from 'react';

/**
 * DomainCanonicalizer enforces that users accessing through internal Cloudflare
 * production pages domains (e.g. graphsign-web.pages.dev) are seamlessly redirected
 * to the official custom domain graphsign.ink.
 *
 * Local and development environments (localhost, dev-graphsign-web.pages.dev, dev.graphsign.ink)
 * are never redirected.
 */
export function DomainCanonicalizer() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const hostname = window.location.hostname.toLowerCase();

    // Do not redirect local development and preview/development environments
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.') ||
      hostname.endsWith('.local') ||
      hostname.includes('dev-graphsign-web') ||
      hostname === 'dev.graphsign.ink' ||
      hostname.startsWith('dev.')
    ) {
      return;
    }

    // Redirect production Cloudflare Pages hostnames to official custom domain graphsign.ink
    if (hostname === 'graphsign-web.pages.dev' || hostname.endsWith('.graphsign-web.pages.dev')) {
      const canonicalTarget = `https://graphsign.ink${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.replace(canonicalTarget);
    }
  }, []);

  return null;
}
