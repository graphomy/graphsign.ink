import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TermsPage from '@/app/(public)/terms/page';
import PrivacyPage from '@/app/(public)/privacy/page';
import SupportPage from '@/app/(public)/support/page';
import CookiesPage from '@/app/(public)/cookies/page';

describe('Public legal notices', () => {
  it.each([
    [TermsPage, 'Terms of Service'],
    [PrivacyPage, 'Privacy Notice'],
    [SupportPage, 'Support and contact'],
    [CookiesPage, 'Cookie Notice and preferences'],
  ] as const)('renders the notice and public navigation for %s', (Page, title) => {
    render(<Page />);
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeDefined();
    expect(screen.getByRole('navigation', { name: 'Legal and support' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Cookie Notice' }).getAttribute('href')).toBe(
      '/cookies',
    );
  });
});
