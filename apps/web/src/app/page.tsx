import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans selection:bg-[#ba0000] selection:text-white">
      {/* Header / Navbar */}
      <header className="border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold tracking-tight text-white">
            graph<span className="text-[#ba0000]">sign</span>.ink
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm font-medium text-neutral-300 hover:text-white transition-colors px-3 py-2"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="text-sm font-semibold bg-[#ba0000] hover:bg-[#a00000] text-white px-4 py-2 rounded-lg transition-colors shadow-sm"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="py-24 px-6 text-center max-w-4xl mx-auto space-y-8">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-neutral-800 bg-neutral-900/60 text-xs text-neutral-400">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Open-Source Electronic Signature Platform
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight">
            Secure, Tamper-Evident <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-white via-neutral-200 to-[#ba0000] bg-clip-text text-transparent">
              Digital Signatures
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-neutral-400 max-w-2xl mx-auto leading-relaxed">
            Execute agreements with cryptographic integrity, audit hash-chain verification, and
            seamless multi-tenant organization support.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link
              href="/register"
              className="w-full sm:w-auto px-8 py-3.5 rounded-lg bg-[#ba0000] hover:bg-[#a00000] text-white font-semibold text-base transition-all shadow-lg shadow-red-950/30"
            >
              Start Free Trial
            </Link>
            <Link
              href="/login"
              className="w-full sm:w-auto px-8 py-3.5 rounded-lg border border-neutral-800 hover:border-neutral-700 bg-neutral-900/40 text-neutral-200 font-semibold text-base transition-all"
            >
              Sign In to Account
            </Link>
          </div>
        </section>

        {/* Feature Grid */}
        <section className="py-20 border-t border-neutral-900 bg-neutral-900/30">
          <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-6 rounded-xl border border-neutral-800 bg-neutral-900/50 space-y-3">
              <div className="w-10 h-10 rounded-lg bg-[#ba0000]/10 flex items-center justify-center text-[#ba0000]">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white">Cryptographic Security</h3>
              <p className="text-sm text-neutral-400 leading-relaxed">
                PAdES digitally sealed PDF documents with SHA-256 hash chains ensuring complete
                tamper-evidence.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-neutral-800 bg-neutral-900/50 space-y-3">
              <div className="w-10 h-10 rounded-lg bg-[#ba0000]/10 flex items-center justify-center text-[#ba0000]">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white">Immutable Audit Trail</h3>
              <p className="text-sm text-neutral-400 leading-relaxed">
                Every business event, signature, and verification is logged in an append-only,
                cryptographic audit log.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-neutral-800 bg-neutral-900/50 space-y-3">
              <div className="w-10 h-10 rounded-lg bg-[#ba0000]/10 flex items-center justify-center text-[#ba0000]">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white">Serverless Edge Global</h3>
              <p className="text-sm text-neutral-400 leading-relaxed">
                Deployed on Cloudflare Pages & Workers for sub-millisecond response times around the
                globe.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-900 py-8 px-6 text-center text-xs text-neutral-500">
        <p>&copy; {new Date().getFullYear()} graphsign.ink. AGPL-3.0 License.</p>
      </footer>
    </div>
  );
}
