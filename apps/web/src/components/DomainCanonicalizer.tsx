'use client';

import { useEffect } from 'react';

/**
 * DomainCanonicalizer enforces that users accessing through internal Cloudflare
 * *.pages.dev domains are seamlessly redirected to the official custom domain graphsign.ink.
 */
export function DomainCanonicalizer() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const hostname = window.location.hostname.toLowerCase();

    // Do not redirect local development environments
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.') ||
      hostname.endsWith('.local')
    ) {
      return;
    }

    // Redirect any cloudflare dev / pages.dev hostnames to graphsign.ink
    if (
      hostname.endsWith('.pages.dev') ||
      hostname.endsWith('.workers.dev') ||
      hostname.includes('dev-graphsign-web')
    ) {
      const canonicalTarget = `https://graphsign.ink${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.replace(canonicalTarget);
    }
  }, []);

  return null;
}
