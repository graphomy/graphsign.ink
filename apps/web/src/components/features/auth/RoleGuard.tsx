'use client';

import { ReactNode } from 'react';

export interface RoleGuardProps {
  children: ReactNode;
  userRole?: string;
  allowedRoles?: string[];
  fallback?: ReactNode;
}

export function RoleGuard({ children, userRole = 'user', allowedRoles, fallback }: RoleGuardProps) {
  // Super Admin bypass
  if (userRole === 'super_admin') {
    return <>{children}</>;
  }

  let isAllowed = true;

  if (allowedRoles && allowedRoles.length > 0) {
    isAllowed = allowedRoles.includes(userRole);
  }

  if (!isAllowed) {
    if (fallback) return <>{fallback}</>;
    return (
      <div
        className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700"
        data-testid="role-guard-access-denied"
      >
        <h3 className="font-bold text-base mb-1">403 Access Denied</h3>
        <p>You do not have permission to view or manage this section.</p>
      </div>
    );
  }

  return <>{children}</>;
}
