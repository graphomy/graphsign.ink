'use client';

import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { getApiUrl } from '@/lib/api';

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

  const handleSignOutDueToTimeout = useCallback((reason: string = 'timeout') => {
    const currentPath = window.location.pathname + window.location.search;

    localStorage.removeItem('token');
    localStorage.removeItem('graphsign_session_token');
    localStorage.removeItem('graphsign_user_email');
    localStorage.removeItem('graphsign_org_id');
    localStorage.removeItem('graphsign_user_id');

    const apiUrl = getApiUrl();
    fetch(`${apiUrl}/api/v1/auth/logout`, { method: 'POST' }).catch(() => null);

    const redirectTarget = `/login?reason=${encodeURIComponent(reason)}&returnTo=${encodeURIComponent(currentPath)}`;
    window.location.href = redirectTarget;
  }, []);

  // Fetch session settings from backend if available
  useEffect(() => {
    if (!isAuthenticated) return;

    let isMounted = true;
    const apiUrl = getApiUrl();

    fetch(`${apiUrl}/api/v1/auth/session-settings`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('graphsign_session_token') ?? ''}`,
      },
    })
      .then((res) => {
        if (res.status === 401) {
          handleSignOutDueToTimeout('session_expired');
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((data) => {
        if (
          isMounted &&
          data?.sessionTimeoutMinutes &&
          typeof data.sessionTimeoutMinutes === 'number'
        ) {
          setEffectiveTimeoutMs(data.sessionTimeoutMinutes * 60 * 1000);
        }
      })
      .catch(() => null);

    return () => {
      isMounted = false;
    };
  }, [handleSignOutDueToTimeout, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      window.location.href = '/login';
      return;
    }

    // Setup Idle Session Timeout with adaptive throttling (up to 2s in production) to prevent main-thread lag on mousemove / scroll
    let timeoutId: NodeJS.Timeout;
    let lastActivityTime = Date.now();
    const throttleMs = Math.min(2000, Math.max(100, Math.floor(effectiveTimeoutMs / 4)));

    const scheduleTimeout = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(handleSignOutDueToTimeout, effectiveTimeoutMs);
    };

    const handleUserActivity = () => {
      const now = Date.now();
      if (now - lastActivityTime >= throttleMs) {
        lastActivityTime = now;
        scheduleTimeout();
      }
    };

    // Activity event listeners with passive option for optimal rendering performance
    const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];

    activityEvents.forEach((event) => {
      window.addEventListener(event, handleUserActivity, { passive: true });
    });

    // Initial timer kickoff
    scheduleTimeout();

    return () => {
      clearTimeout(timeoutId);
      activityEvents.forEach((event) => {
        window.removeEventListener(event, handleUserActivity);
      });
    };
  }, [effectiveTimeoutMs, handleSignOutDueToTimeout, isAuthenticated]);

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
