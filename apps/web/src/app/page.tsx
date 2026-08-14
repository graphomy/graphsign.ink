import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 flex flex-col font-sans selection:bg-[#ba0000] selection:text-white">
      {/* Header / Navbar */}
      <header className="border-b border-neutral-200 bg-white/90 backdrop-blur-md sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold tracking-tight text-neutral-900">
            graph<span className="text-[#ba0000]">sign</span>.ink
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-xs font-semibold text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100 transition-colors px-3 py-2 rounded-lg"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="text-xs font-semibold bg-[#ba0000] hover:bg-[#a00000] text-white px-4 py-2 rounded-lg transition-colors shadow-sm"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="py-24 px-6 text-center max-w-4xl mx-auto space-y-8">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-neutral-200 bg-white text-xs font-semibold text-neutral-600 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Open-Source Electronic Signature Platform
          </div>

          <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-neutral-900 leading-tight">
            Secure, Tamper-Evident <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-neutral-900 via-neutral-800 to-[#ba0000] bg-clip-text text-transparent">
              Digital Signatures
            </span>
          </h1>

          <p className="text-base sm:text-lg text-neutral-600 max-w-2xl mx-auto leading-relaxed">
            Execute agreements with cryptographic integrity, audit hash-chain verification, and
            seamless multi-tenant organization support.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link
              href="/register"
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-[#ba0000] hover:bg-[#a00000] text-white font-bold text-sm transition-all shadow-md shadow-red-600/20"
            >
              Start Free Trial
            </Link>
            <Link
              href="/login"
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl border border-neutral-300 hover:bg-neutral-100 bg-white text-neutral-800 font-bold text-sm transition-all shadow-sm"
            >
              Sign In to Account
            </Link>
          </div>
        </section>

        {/* Feature Grid */}
        <section className="py-20 border-t border-neutral-200 bg-white">
          <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-6 rounded-2xl border border-neutral-200 bg-neutral-50/50 space-y-3 shadow-sm hover:border-neutral-300 transition-all">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-[#ba0000] font-bold">
                🔒
              </div>
              <h3 className="text-base font-bold text-neutral-900">Cryptographic Security</h3>
              <p className="text-xs text-neutral-600 leading-relaxed">
                PAdES digitally sealed PDF documents with SHA-256 hash chains ensuring complete
                tamper-evidence.
              </p>
            </div>

            <div className="p-6 rounded-2xl border border-neutral-200 bg-neutral-50/50 space-y-3 shadow-sm hover:border-neutral-300 transition-all">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-[#ba0000] font-bold">
                📜
              </div>
              <h3 className="text-base font-bold text-neutral-900">Immutable Audit Trail</h3>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Every business event, signature, and verification is logged in an append-only,
                cryptographic audit log.
              </p>
            </div>

            <div className="p-6 rounded-2xl border border-neutral-200 bg-neutral-50/50 space-y-3 shadow-sm hover:border-neutral-300 transition-all">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-[#ba0000] font-bold">
                ⚡
              </div>
              <h3 className="text-base font-bold text-neutral-900">Serverless Edge Global</h3>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Deployed on Cloudflare Pages & Workers for sub-millisecond response times around the
                globe.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-200 bg-white py-8 px-6 text-center text-xs font-semibold text-neutral-500">
        <p>&copy; {new Date().getFullYear()} graphsign.ink. AGPL-3.0 License.</p>
      </footer>
    </div>
  );
}
