import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WorkspaceNav } from './WorkspaceNav';

vi.mock('next/navigation', () => ({
  usePathname: () => '/agreements',
}));

describe('WorkspaceNav Component Tests (INK-269)', () => {
  it('renders Dashboard, Agreements, and Templates navigation tabs', () => {
    render(<WorkspaceNav />);

    expect(screen.getByRole('link', { name: /Dashboard/i })).toBeDefined();
    expect(screen.getByRole('link', { name: /Agreements/i })).toBeDefined();
    expect(screen.getByRole('link', { name: /Templates/i })).toBeDefined();
  });

  it('marks Agreements tab as active when on /agreements pathname', () => {
    render(<WorkspaceNav />);

    const agreementsLink = screen.getByRole('link', { name: /Agreements/i });
    expect(agreementsLink.className).toContain('bg-[#ba0000]');
    expect(agreementsLink.className).toContain('text-white');
  });
});
