'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

/* ─── Intersection Observer hook for scroll-triggered animations ─── */
function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setInView(true);
          obs.unobserve(el);
        }
      },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

/* ─── Animated counter ─── */
function Counter({
  end,
  suffix = '',
  duration = 2000,
}: {
  end: number;
  suffix?: string;
  duration?: number;
}) {
  const [count, setCount] = useState(0);
  const { ref, inView } = useInView();
  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const step = end / (duration / 16);
    const id = setInterval(() => {
      start += step;
      if (start >= end) {
        setCount(end);
        clearInterval(id);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(id);
  }, [inView, end, duration]);
  return (
    <span ref={ref}>
      {count}
      {suffix}
    </span>
  );
}

/* ─── Floating particle field (canvas) ─── */
function ParticleField() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    let raf: number;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      c.width = c.offsetWidth * dpr;
      c.height = c.offsetHeight * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    const particles: {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      o: number;
    }[] = [];
    const count = 60;
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * c.offsetWidth,
        y: Math.random() * c.offsetHeight,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 1.5 + 0.5,
        o: Math.random() * 0.3 + 0.05,
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, c.offsetWidth, c.offsetHeight);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = c.offsetWidth;
        if (p.x > c.offsetWidth) p.x = 0;
        if (p.y < 0) p.y = c.offsetHeight;
        if (p.y > c.offsetHeight) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(186,0,0,${p.o})`;
        ctx.fill();
      }
      /* draw connections */
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(186,0,0,${0.04 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvas}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: 0.7 }}
    />
  );
}

/* ─── GitHub icon ─── */
function GitHubIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

/* ─── Feature card data ─── */
const features = [
  {
    icon: '🔒',
    title: 'Cryptographic Security',
    desc: 'SHA-256 hash-chained audit logs and tamper-evident PDF sealing ensure document integrity is mathematically verifiable.',
  },
  {
    icon: '📜',
    title: 'Immutable Audit Trail',
    desc: 'Every signature, review, and view event is logged in an append-only, cryptographically chained audit record.',
  },
  {
    icon: '⚡',
    title: 'Edge-First Architecture',
    desc: 'Deployed on Cloudflare Workers for sub-millisecond cold starts and global low-latency document delivery.',
  },
  {
    icon: '🔄',
    title: 'Governed Workflow Engine',
    desc: 'Route agreements through Draft → Review → Approval → Signing with sequential and parallel recipient routing.',
  },
  {
    icon: '✍️',
    title: 'Electronic Signatures',
    desc: 'Draw or type legally binding signatures on any device with ESIGN & eIDAS electronic consent capture.',
  },
  {
    icon: '🏢',
    title: 'Multi-Tenant Isolation',
    desc: 'Strict organization-scoped data boundaries with role-based access control and team hierarchies.',
  },
];

/* ─── Workflow steps ─── */
const steps = [
  {
    num: '01',
    title: 'Create',
    desc: 'Upload PDF/DOCX or draft agreements from scratch with a live Markdown editor.',
  },
  {
    num: '02',
    title: 'Design',
    desc: 'Place signature, text, date, and checkbox fields on a visual multi-page canvas.',
  },
  {
    num: '03',
    title: 'Route',
    desc: 'Submit for internal review and approval. Configure sequential or parallel signing order.',
  },
  {
    num: '04',
    title: 'Sign',
    desc: 'Signers receive secure tokenized links and sign on any device with electronic consent.',
  },
  {
    num: '05',
    title: 'Verify',
    desc: 'Every action is hash-chained. The completed document is independently verifiable forever.',
  },
];

/* ─── Main page ─── */
export default function Home() {
  const [heroVisible, setHeroVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setHeroVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  const feat1 = useInView();
  const feat2 = useInView();
  const stepSection = useInView();
  const statsSection = useInView();
  const ctaSection = useInView();

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col font-sans selection:bg-[#ba0000] selection:text-white overflow-x-hidden">
      {/* ── Sticky Header ── */}
      <header className="border-b border-white/5 bg-neutral-950/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold tracking-tight text-white">
            graph<span className="text-[#ba0000]">sign</span>.ink
          </Link>

          <div className="flex items-center gap-3">
            <a
              href="https://github.com/graphomy/graphsign.ink"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs font-semibold text-neutral-400 hover:text-white border border-white/10 hover:border-white/25 px-3 py-2 rounded-lg transition-all duration-300"
            >
              <GitHubIcon className="w-4 h-4" />
              <span className="hidden sm:inline">GitHub</span>
            </a>
            <Link
              href="/login"
              className="text-xs font-semibold text-neutral-400 hover:text-white transition-colors px-3 py-2 rounded-lg"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="text-xs font-semibold bg-[#ba0000] hover:bg-[#d41111] text-white px-4 py-2 rounded-lg transition-all duration-300 shadow-lg shadow-red-900/30 hover:shadow-red-800/50"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ── Hero ── */}
        <section className="relative min-h-[85vh] flex items-center justify-center px-6 overflow-hidden">
          {/* Radial gradient background glow */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(186,0,0,0.08) 0%, transparent 70%)',
            }}
          />
          {/* Particle canvas */}
          <ParticleField />

          {/* Grid lines decoration */}
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.03]"
            style={{
              backgroundImage: `linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px),
                               linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)`,
              backgroundSize: '60px 60px',
            }}
          />

          <div
            className="relative z-10 text-center max-w-5xl mx-auto space-y-8"
            style={{
              opacity: heroVisible ? 1 : 0,
              transform: heroVisible ? 'translateY(0)' : 'translateY(40px)',
              transition: 'all 1s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {/* Pill badge */}
            <div
              className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm text-xs font-semibold text-neutral-300"
              style={{
                opacity: heroVisible ? 1 : 0,
                transform: heroVisible ? 'translateY(0)' : 'translateY(20px)',
                transition: 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.2s',
              }}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Open-Source &middot; AGPL-3.0 Licensed
            </div>

            {/* Heading */}
            <h1
              className="text-5xl sm:text-7xl lg:text-8xl font-black tracking-tight leading-[0.95]"
              style={{
                opacity: heroVisible ? 1 : 0,
                transform: heroVisible ? 'translateY(0)' : 'translateY(30px)',
                transition: 'all 1s cubic-bezier(0.16, 1, 0.3, 1) 0.3s',
              }}
            >
              <span className="text-white">Agreements,</span>
              <br />
              <span className="bg-gradient-to-r from-white via-neutral-300 to-[#ba0000] bg-clip-text text-transparent">
                Signed &amp; Verified.
              </span>
            </h1>

            {/* Subheading */}
            <p
              className="text-base sm:text-lg lg:text-xl text-neutral-400 max-w-2xl mx-auto leading-relaxed"
              style={{
                opacity: heroVisible ? 1 : 0,
                transform: heroVisible ? 'translateY(0)' : 'translateY(20px)',
                transition: 'all 1s cubic-bezier(0.16, 1, 0.3, 1) 0.5s',
              }}
            >
              Create, route, and execute legally binding electronic signatures with cryptographic
              integrity&mdash;self-hosted or cloud, with no vendor lock-in.
            </p>

            {/* CTA buttons */}
            <div
              className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4"
              style={{
                opacity: heroVisible ? 1 : 0,
                transform: heroVisible ? 'translateY(0)' : 'translateY(20px)',
                transition: 'all 1s cubic-bezier(0.16, 1, 0.3, 1) 0.7s',
              }}
            >
              <Link
                href="/register"
                className="group relative w-full sm:w-auto px-8 py-4 rounded-xl bg-[#ba0000] text-white font-bold text-sm transition-all duration-300 shadow-xl shadow-red-900/30 hover:shadow-2xl hover:shadow-red-800/40 hover:bg-[#d41111] overflow-hidden"
              >
                <span className="relative z-10">Start Building Free →</span>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-700" />
              </Link>
              <a
                href="https://github.com/graphomy/graphsign.ink"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded-xl border border-white/10 hover:border-white/25 bg-white/5 hover:bg-white/10 text-white font-bold text-sm transition-all duration-300 backdrop-blur-sm"
              >
                <GitHubIcon className="w-4 h-4" />
                View on GitHub
              </a>
            </div>
          </div>

          {/* Bottom fade */}
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-neutral-950 to-transparent pointer-events-none" />
        </section>

        {/* ── Features Grid (row 1: 3 cards) ── */}
        <section className="py-24 px-6 relative">
          <div className="max-w-7xl mx-auto">
            <div
              ref={feat1.ref}
              className="text-center mb-16"
              style={{
                opacity: feat1.inView ? 1 : 0,
                transform: feat1.inView ? 'translateY(0)' : 'translateY(30px)',
                transition: 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              <p className="text-xs font-bold tracking-[0.2em] uppercase text-[#ba0000] mb-3">
                Built for Trust
              </p>
              <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-white">
                Enterprise-Grade Features
              </h2>
            </div>

            <div ref={feat2.ref} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((f, i) => (
                <div
                  key={f.title}
                  className="group relative p-8 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/10 transition-all duration-500 overflow-hidden"
                  style={{
                    opacity: feat2.inView ? 1 : 0,
                    transform: feat2.inView ? 'translateY(0)' : 'translateY(40px)',
                    transition: `all 0.7s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.1}s`,
                  }}
                >
                  {/* Hover glow */}
                  <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-[#ba0000]/5 via-transparent to-transparent pointer-events-none" />

                  <div className="relative z-10 space-y-4">
                    <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform duration-300">
                      {f.icon}
                    </div>
                    <h3 className="text-lg font-bold text-white">{f.title}</h3>
                    <p className="text-sm text-neutral-400 leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── How It Works ── */}
        <section className="py-24 px-6 border-t border-white/5 relative">
          <div className="max-w-5xl mx-auto">
            <div
              ref={stepSection.ref}
              className="text-center mb-20"
              style={{
                opacity: stepSection.inView ? 1 : 0,
                transform: stepSection.inView ? 'translateY(0)' : 'translateY(30px)',
                transition: 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              <p className="text-xs font-bold tracking-[0.2em] uppercase text-[#ba0000] mb-3">
                Five Steps
              </p>
              <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-white">
                How It Works
              </h2>
            </div>

            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-6 md:left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent hidden sm:block" />

              {steps.map((s, i) => {
                const isLeft = i % 2 === 0;
                return (
                  <div
                    key={s.num}
                    className={`relative flex items-start gap-8 mb-16 last:mb-0 ${
                      isLeft ? 'md:flex-row' : 'md:flex-row-reverse'
                    }`}
                    style={{
                      opacity: stepSection.inView ? 1 : 0,
                      transform: stepSection.inView ? 'translateY(0)' : 'translateY(30px)',
                      transition: `all 0.7s cubic-bezier(0.16, 1, 0.3, 1) ${0.15 * i}s`,
                    }}
                  >
                    <div className={`flex-1 ${isLeft ? 'md:text-right' : 'md:text-left'}`}>
                      <div className="inline-block">
                        <span className="text-xs font-bold text-[#ba0000] tracking-widest">
                          STEP {s.num}
                        </span>
                        <h3 className="text-2xl font-black text-white mt-1">{s.title}</h3>
                        <p className="text-sm text-neutral-400 mt-2 max-w-sm leading-relaxed">
                          {s.desc}
                        </p>
                      </div>
                    </div>

                    {/* Center dot */}
                    <div className="hidden md:flex items-center justify-center relative z-10">
                      <div className="w-4 h-4 rounded-full bg-neutral-950 border-2 border-[#ba0000] shadow-lg shadow-red-900/30" />
                    </div>

                    <div className="flex-1 hidden md:block" />
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Stats ── */}
        <section className="py-20 px-6 border-t border-white/5">
          <div
            ref={statsSection.ref}
            className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8"
          >
            {[
              { n: 292, s: '+', label: 'Automated Tests' },
              { n: 33, s: '', label: 'Test Suites' },
              { n: 0, s: '', label: 'TypeScript Errors', zero: true },
              { n: 100, s: '%', label: 'Open Source' },
            ].map((stat, i) => (
              <div
                key={stat.label}
                className="text-center"
                style={{
                  opacity: statsSection.inView ? 1 : 0,
                  transform: statsSection.inView ? 'translateY(0)' : 'translateY(20px)',
                  transition: `all 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.1}s`,
                }}
              >
                <div className="text-4xl sm:text-5xl font-black text-white">
                  {stat.zero ? '0' : <Counter end={stat.n} suffix={stat.s} />}
                </div>
                <p className="text-xs font-semibold text-neutral-500 mt-2 uppercase tracking-wider">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Open Source CTA ── */}
        <section className="py-24 px-6 border-t border-white/5 relative overflow-hidden">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse 50% 60% at 50% 100%, rgba(186,0,0,0.06) 0%, transparent 70%)',
            }}
          />
          <div
            ref={ctaSection.ref}
            className="relative z-10 max-w-3xl mx-auto text-center space-y-8"
            style={{
              opacity: ctaSection.inView ? 1 : 0,
              transform: ctaSection.inView ? 'translateY(0)' : 'translateY(30px)',
              transition: 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-white">
              Own Your Signing
              <br />
              Infrastructure.
            </h2>
            <p className="text-base text-neutral-400 max-w-xl mx-auto leading-relaxed">
              Self-host with Docker, deploy to Cloudflare, or use our managed cloud. Your data, your
              certificates, your rules&mdash;no vendor lock-in, ever.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
              <Link
                href="/register"
                className="group relative w-full sm:w-auto px-8 py-4 rounded-xl bg-[#ba0000] text-white font-bold text-sm transition-all duration-300 shadow-xl shadow-red-900/30 hover:shadow-2xl hover:shadow-red-800/40 hover:bg-[#d41111] overflow-hidden"
              >
                <span className="relative z-10">Start Free →</span>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-700" />
              </Link>
              <a
                href="https://github.com/graphomy/graphsign.ink"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded-xl border border-white/10 hover:border-white/25 bg-white/5 hover:bg-white/10 text-white font-bold text-sm transition-all duration-300 backdrop-blur-sm"
              >
                <GitHubIcon className="w-4 h-4" />
                Star on GitHub
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-lg font-bold tracking-tight text-white">
              graph<span className="text-[#ba0000]">sign</span>.ink
            </Link>
            <span className="text-xs text-neutral-600">AGPL-3.0 License</span>
          </div>

          <div className="flex items-center gap-6 text-xs text-neutral-500">
            <a
              href="https://github.com/graphomy/graphsign.ink"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors flex items-center gap-1.5"
            >
              <GitHubIcon className="w-3.5 h-3.5" />
              GitHub
            </a>
            <span>&copy; {new Date().getFullYear()} graphsign.ink</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
