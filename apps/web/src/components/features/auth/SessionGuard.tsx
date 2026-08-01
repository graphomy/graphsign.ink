'use client';

import { useEffect, useState, useCallback, type ReactNode } from 'react';

interface SessionGuardProps {
  children: ReactNode;
  /** Idle timeout duration in milliseconds. Defaults to 15 minutes (900,000 ms). */
  idleTimeoutMs?: number;
}

const DEFAULT_IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

export function SessionGuard({
  children,
  idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
}: SessionGuardProps) {
  const [isAuthenticated] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return !!localStorage.getItem('graphsign_session_token');
  });

  const handleSignOutDueToTimeout = useCallback(() => {
    localStorage.removeItem('graphsign_session_token');
    localStorage.removeItem('graphsign_user_email');
    localStorage.removeItem('graphsign_org_id');

    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';
    fetch(`${apiUrl}/api/v1/auth/logout`, { method: 'POST' }).catch(() => null);

    window.location.href = '/login?reason=timeout';
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      window.location.href = '/login';
      return;
    }

    // Setup Idle Session Timeout
    let timeoutId: NodeJS.Timeout;

    const resetIdleTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(handleSignOutDueToTimeout, idleTimeoutMs);
    };

    // Activity event listeners
    const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];

    activityEvents.forEach((event) => {
      window.addEventListener(event, resetIdleTimer);
    });

    // Initial timer kickoff
    resetIdleTimer();

    return () => {
      clearTimeout(timeoutId);
      activityEvents.forEach((event) => {
        window.removeEventListener(event, resetIdleTimer);
      });
    };
  }, [idleTimeoutMs, handleSignOutDueToTimeout, isAuthenticated]);

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
