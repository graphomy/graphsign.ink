import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: 'noindex',
};

/**
 * Layout for public (unauthenticated) routes.
 * Centered content with the brand mark.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        {/* Brand mark */}
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
            graph<span className="text-[#ba0000]">sign</span>.ink
          </h1>
        </div>
        {children}
      </div>
    </div>
  );
}
