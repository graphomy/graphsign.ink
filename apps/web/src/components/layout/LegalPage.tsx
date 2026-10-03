import Link from 'next/link';
import type { ReactNode } from 'react';

/** Shared readable layout and navigation for public legal notices. */
export function LegalPage({
  title,
  sections,
  children,
}: {
  title: string;
  sections: readonly (readonly [string, string])[];
  children?: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-ink-50 px-4 py-12 sm:px-6">
      <article className="mx-auto max-w-4xl rounded-2xl border border-ink-200 bg-white p-6 sm:p-12">
        <Link href="/" className="font-bold text-ink-900">
          graphsign.ink
        </Link>
        <h1 className="mt-6 text-3xl font-bold text-ink-900">{title}</h1>
        <p className="mt-2 text-sm text-ink-500">Effective date: 3 October 2026</p>
        <div className="mt-8 max-w-[68ch] space-y-8 text-[15px] leading-relaxed text-ink-700">
          {sections.map(([heading, body]) => (
            <section key={heading}>
              <h2 className="mb-2 text-lg font-bold text-ink-900">{heading}</h2>
              <p>{body}</p>
            </section>
          ))}
          {children}
        </div>
        <nav
          aria-label="Legal and support"
          className="mt-10 flex flex-wrap gap-5 border-t border-ink-200 pt-6 text-sm text-ink-700"
        >
          <Link href="/terms">Terms of Service</Link>
          <Link href="/privacy">Privacy Notice</Link>
          <Link href="/cookies">Cookie Notice</Link>
          <Link href="/support">Support</Link>
        </nav>
      </article>
    </main>
  );
}
