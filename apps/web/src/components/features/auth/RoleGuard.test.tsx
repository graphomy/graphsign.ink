import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { RoleGuard } from './RoleGuard';

describe('RoleGuard Component (INK-63)', () => {
  it('should render children if userRole is allowed', () => {
    render(
      <RoleGuard userRole="org_admin" allowedRoles={['org_admin', 'super_admin']}>
        <div data-testid="protected-content">Protected Content</div>
      </RoleGuard>,
    );

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  it('should render access denied message if role is not allowed', () => {
    render(
      <RoleGuard userRole="signer" allowedRoles={['org_admin']}>
        <div data-testid="protected-content">Protected Content</div>
      </RoleGuard>,
    );

    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('role-guard-access-denied')).toBeInTheDocument();
  });

  it('should render custom fallback if provided when access denied', () => {
    render(
      <RoleGuard
        userRole="signer"
        allowedRoles={['org_admin']}
        fallback={<div data-testid="custom-fallback">Custom Access Denied</div>}
      >
        <div data-testid="protected-content">Protected Content</div>
      </RoleGuard>,
    );

    expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
  });

  it('should always render children for super_admin role', () => {
    render(
      <RoleGuard userRole="super_admin" allowedRoles={['org_admin']}>
        <div data-testid="protected-content">Protected Content</div>
      </RoleGuard>,
    );

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });
});
