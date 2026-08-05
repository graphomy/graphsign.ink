'use client';

import { useEffect, useState, type ReactNode } from 'react';

interface GuestGuardProps {
  children: ReactNode;
  /** Redirect target for authenticated users. Defaults to '/dashboard'. */
  redirectTo?: string;
}

/**
 * GuestGuard ensures authenticated users are automatically redirected
 * away from public guest routes (e.g. /login, /register) to the dashboard.
 *
 * It handles:
 * 1. Initial page load (if token is already stored in localStorage)
 * 2. Cross-tab authentication updates (via window storage event)
 */
export function GuestGuard({ children, redirectTo = '/dashboard' }: GuestGuardProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return !!localStorage.getItem('graphsign_session_token');
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkAndRedirect = () => {
      const token = localStorage.getItem('graphsign_session_token');
      if (token) {
        setIsAuthenticated(true);
        window.location.href = redirectTo;
      }
    };

    checkAndRedirect();

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'graphsign_session_token' && e.newValue) {
        setIsAuthenticated(true);
        window.location.href = redirectTo;
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [redirectTo]);

  if (isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
