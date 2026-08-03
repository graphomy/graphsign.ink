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
  const [effectiveTimeoutMs, setEffectiveTimeoutMs] = useState<number>(idleTimeoutMs);
  const [isAuthenticated] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return !!localStorage.getItem('graphsign_session_token');
  });

  // Fetch session settings from backend if available
  useEffect(() => {
    if (!isAuthenticated) return;

    let isMounted = true;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

    fetch(`${apiUrl}/api/v1/auth/session-settings`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('graphsign_session_token') ?? ''}`,
      },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data?.sessionTimeoutMinutes && typeof data.sessionTimeoutMinutes === 'number') {
          setEffectiveTimeoutMs(data.sessionTimeoutMinutes * 60 * 1000);
        }
      })
      .catch(() => null);

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated]);

  const handleSignOutDueToTimeout = useCallback(() => {
    const currentPath = window.location.pathname + window.location.search;

    localStorage.removeItem('graphsign_session_token');
    localStorage.removeItem('graphsign_user_email');
    localStorage.removeItem('graphsign_org_id');

    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';
    fetch(`${apiUrl}/api/v1/auth/logout`, { method: 'POST' }).catch(() => null);

    const redirectTarget = `/login?reason=timeout&returnTo=${encodeURIComponent(currentPath)}`;
    window.location.href = redirectTarget;
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
      timeoutId = setTimeout(handleSignOutDueToTimeout, effectiveTimeoutMs);
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
  }, [effectiveTimeoutMs, handleSignOutDueToTimeout, isAuthenticated]);

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}

