import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: 'noindex',
};

/**
 * Layout for public routes.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[100dvh] bg-ink-50 text-ink-900">{children}</div>;
}
