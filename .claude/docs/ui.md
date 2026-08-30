# PART A — Design System Prompt

```
You are working on graphsign.ink, an e-signature and agreement execution platform built with
Next.js 16 (App Router, React 19, Turbopack), TypeScript 5.9, and Tailwind CSS 3.4.

Your task: establish a single, coherent design system. Do not change any business logic,
API contracts, Prisma schema, or Hono route handlers. This is a presentation-layer task only.

=====================================================================
1. DESIGN PRINCIPLES — these resolve every ambiguity below
=====================================================================

P1. LEGAL-GRADE CALM. This app executes binding documents. The UI must feel like a bank,
    not a consumer app. That means: restrained color, generous whitespace, strong typographic
    hierarchy, no decorative gradients, no emoji, no bouncing animations.

P2. ONE RED. Red is the brand and the primary action. It appears at most ONCE per viewport
    as a filled button. Everything else is neutral. If two red filled buttons are visible
    simultaneously, one of them is wrong.

P3. RED IS NEVER AN ERROR STATE BY BORDER ALONE. Because red is the brand, error states are
    signalled by an inline message + icon + tinted background, NOT by a red ring (a red ring
    is indistinguishable from brand focus). Resting inputs are neutral-bordered.

P4. AMBER MEANS "YOU MUST ACT". Every field a signer needs to fill is amber. This is the
    industry convention and it is the only non-neutral color allowed inside the document canvas.

P5. GREEN MEANS "SEALED". Completion, verification and audit-trail confirmations only.

P6. NEVER RENDER NULL. Every dynamic value passes through a fallback formatter.

P7. BRIGHT THEME ONLY. There is no dark mode. Any dark surface currently in the app is a bug.
    Delete all `dark:` variants and any hardcoded near-black page/panel backgrounds.

=====================================================================
2. COLOR TOKENS
=====================================================================

Add to tailwind.config.ts under theme.extend.colors. Also emit as CSS custom properties on
:root in globals.css so non-Tailwind surfaces (PDF overlay chrome, third-party embeds) can use them.

  brand:  // "Ink Red" — brand + primary action ONLY
    50:  '#FEF2F2'
    100: '#FEE2E2'
    200: '#FECACA'
    300: '#FCA5A5'
    400: '#F26A6A'
    500: '#E11D2E'
    600: '#C2101F'   // DEFAULT. Primary button fill. 6.15:1 on white — WCAG AA for text & UI
    700: '#9E0C18'   // hover / pressed
    800: '#7A0912'
    900: '#5C070E'

  ink:  // near-black neutral ramp — text, borders, surfaces
    950: '#0A0A0B'   // focus ring, highest-contrast text on light chips
    900: '#16181D'   // primary text
    800: '#252932'
    700: '#3D424D'   // strong secondary text
    600: '#565C69'
    500: '#6B7280'   // secondary text / labels
    400: '#9AA1AC'   // placeholder, disabled text
    300: '#CBD1D9'   // strong border, dividers on tinted surfaces
    200: '#E3E7EC'   // DEFAULT border
    100: '#F1F3F6'   // subtle fill, table header, hover row
    50:  '#F7F8FA'   // page background

  amber:  // "Signal Amber" — actionable/unfilled signer fields, in-progress
    50:  '#FFF8EB'
    100: '#FEEFC7'
    200: '#FDE0A0'
    300: '#FCCF5B'
    500: '#E8A317'
    600: '#C27C0B'   // text on amber-50 — 4.9:1, AA
    700: '#8F5A06'

  verified:  // "Sealed Green" — signed, executed, verified
    50:  '#ECFDF3'
    100: '#D1FADF'
    500: '#12A150'
    600: '#0B8043'   // 4.6:1 on white
    700: '#076C38'

  info:  // muted slate-blue — informational chrome ONLY, never a CTA
    50:  '#EEF2F8'
    100: '#DDE4EF'
    500: '#4A5A75'
    600: '#374761'

SEMANTIC ALIASES (use these in components, not raw ramps):
  --color-surface:            #FFFFFF
  --color-surface-sunken:     ink.50
  --color-surface-raised:     #FFFFFF
  --color-border:             ink.200
  --color-border-strong:      ink.300
  --color-text:               ink.900
  --color-text-muted:         ink.500
  --color-text-inverse:       #FFFFFF
  --color-action:             brand.600
  --color-action-hover:       brand.700
  --color-focus-ring:         ink.950
  --color-field-required:     amber.500
  --color-state-success:      verified.600
  --color-state-danger:       brand.600   (expressed as OUTLINE style — see §5)

HARD BANS — remove every occurrence:
  - Tailwind default `blue-*`, `indigo-*`, `violet-*`, `sky-*` classes anywhere in the app.
  - Any hex in the #1D4ED8 / #2563EB / #3B82F6 / #A5B4FC family.
  - Any `dark:` variant.
  - Any `bg-black`, `bg-neutral-900`, `bg-zinc-900` used as a page or panel background.

=====================================================================
3. TYPOGRAPHY
=====================================================================

Font: keep the existing geometric sans if one is already loaded via next/font; otherwise use
Inter via next/font/local or next/font/google with `display: 'swap'` and preload.
Monospace (versions, hashes, OTP, envelope IDs, timestamps): JetBrains Mono or ui-monospace.

Scale — set as Tailwind fontSize extensions with paired line-height and tracking:
  display   34px / 40px / -0.02em / 700   — success headline only
  h1        26px / 32px / -0.02em / 700   — page titles
  h2        20px / 28px / -0.01em / 650   — modal titles, section headers
  h3        16px / 24px /  0      / 600   — card titles, field group labels
  body      15px / 24px /  0      / 400   — DEFAULT. Currently ~13-14px in places; raise it.
  body-sm   13px / 20px /  0      / 400   — helper text, table meta
  label     13px / 16px /  0.01em / 550   — form labels
  caption   12px / 16px /  0.01em / 500   — timestamps, footnotes
  overline  11px / 16px /  0.08em / 700 uppercase — eyebrow badges

RULES:
  - Legal/disclosure body copy: 15px minimum, max-width 68ch, line-height 1.65.
  - All numeric columns, OTP digits, version chips, dates: `font-variant-numeric: tabular-nums`.
  - Never place ink.400 text on white for anything a user must read.
  - Maximum two font weights visible in any single component.

=====================================================================
4. SPACE, RADIUS, ELEVATION, MOTION
=====================================================================

SPACING: 4px base. Use only 4/8/12/16/20/24/32/40/48/64. No arbitrary values.
  - Card padding: 24px (desktop) / 16px (mobile)
  - Modal padding: 28px
  - Vertical rhythm between sections: 32px
  - Form field vertical gap: 20px

RADIUS:
  sm   6px   — chips, badges, input adornments
  md   10px  — inputs, buttons, table row hover
  lg   14px  — cards, panels
  xl   20px  — modals, sheets
  pill 9999px — status badges, segmented controls, avatars
  Buttons use `md`. Never mix pill buttons and rounded buttons in the same cluster
  (currently Download Copy is a pill while Sign in is a rectangle — unify to `md`).

ELEVATION — bright theme is border-first, shadow-second:
  e0  none, 1px ink.200 border            — cards, table containers, default
  e1  0 1px 2px rgb(16 24 40 / 0.04), 0 1px 3px rgb(16 24 40 / 0.06) + border  — raised cards
  e2  0 4px 8px -2px rgb(16 24 40 / 0.06), 0 12px 24px -4px rgb(16 24 40 / 0.08)  — popovers, dropdowns
  e3  0 8px 16px -4px rgb(16 24 40 / 0.08), 0 24px 48px -12px rgb(16 24 40 / 0.16)  — modals
  Never stack a shadow on a page-background element.

MODAL BACKDROP: rgb(10 10 11 / 0.55) + backdrop-blur-[2px]. Consistent everywhere.
  The current backdrop varies per modal and lets a broken toolbar show through — standardise it.

MOTION: durations 120ms (micro: hover, checkbox), 180ms (default: dropdown, tooltip),
  240ms (modal/sheet enter). Easing: cubic-bezier(0.16, 1, 0.3, 1) for enter,
  cubic-bezier(0.4, 0, 1, 1) for exit. Honour `prefers-reduced-motion: reduce` by collapsing
  all transforms to opacity-only at 100ms.

=====================================================================
5. COMPONENT PRIMITIVES
=====================================================================

Build these in /components/ui as typed, forwardRef'd, `cn()`-composable React components with
CVA-style variant maps. Every one of them must expose a visible :focus-visible state.

--- Button ---
Variants:
  primary     bg-brand-600 text-white           hover:bg-brand-700  active:bg-brand-800
  secondary   bg-ink-900 text-white             hover:bg-ink-800
  outline     bg-white text-ink-900 border-ink-200  hover:bg-ink-50 hover:border-ink-300
  ghost       bg-transparent text-ink-700       hover:bg-ink-100
  destructive bg-white text-brand-600 border-brand-200 hover:bg-brand-50 hover:border-brand-300
              ^ NOTE: destructive is OUTLINE, not filled, because filled red is the primary
                action. This is how Decline / Withdraw / Delete must render everywhere.
  link        text-brand-700 underline-offset-4 hover:underline

Sizes: sm 32px h / 12px px / body-sm · md 40px h / 16px px / body · lg 48px h / 20px px / body

States:
  disabled:  bg-ink-100 text-ink-400 border-ink-200 cursor-not-allowed, opacity NOT reduced
             (opacity-based disabling is what makes the current pale-blue CTA ambiguous).
  loading:   render a 16px spinner in place of the leading icon, keep the label,
             set aria-busy and disable pointer events. Never collapse the button width.
  focus-visible: ring-2 ring-ink-950 ring-offset-2 ring-offset-white
             (on brand-600 fills use ring-offset-white so the ring stays legible).

Every button takes optional `leftIcon` / `rightIcon` as lucide-react components at 16px (sm/md)
or 18px (lg), stroke-width 2, with `aria-hidden`. NEVER use an emoji as an icon.

--- Input / Field ---
  Resting:  h-40px, bg-white, border ink-200, radius md, px-12, text ink-900,
            placeholder ink-400
  Hover:    border ink-300
  Focus:    border ink-900 + ring-2 ring-ink-950/10, NO red
  Error:    border brand-500 + bg-brand-50/40 + a 13px brand-700 message below with a
            12px AlertCircle icon; set aria-invalid and aria-describedby
  Disabled: bg-ink-50, text ink-400
  MUST override Chrome autofill (currently a pale blue box overrides your styling):
    input:-webkit-autofill { -webkit-box-shadow: 0 0 0 1000px #FFFFFF inset;
      -webkit-text-fill-color: #16181D; transition: background-color 9999s ease-out; }
  Label sits above at 13px/550 ink-700, 6px gap. Helper text 13px ink-500 below.
  Password fields get a show/hide toggle (Eye / EyeOff, 16px, ink-500) and a Caps-Lock warning.

--- Badge / StatusPill ---
  Sizes sm (20px) / md (24px), radius pill, 11px overline weight 700, px 8/10.
  Tones:  neutral (ink-100 / ink-700) · info (info-50 / info-600) · attention (amber-50 /
          amber-700) · success (verified-50 / verified-700) · brand (brand-50 / brand-700)
  Map document statuses: Draft→neutral · Sent/Active→info · Awaiting You→attention ·
  Signed/Completed→success · Declined/Voided→brand · Expired→neutral with a strikethrough dot.

--- Card ---
  bg-white, border ink-200, radius lg, elevation e0. Optional `header` slot with a
  16px/600 title, a 13px ink-500 description, and a right-aligned action slot.

--- Modal / Dialog ---
  Use Radix Dialog (or keep the current primitive) but standardise: max-w 480px (sm),
  560px (md), 720px (lg); radius xl; elevation e3; padding 28px; backdrop as §4.
  MANDATORY on every modal: an accessible title, a visible close affordance (X, 32px hit target,
  top-right, ink-500), Escape-to-close, focus trap, focus returned to the trigger on close,
  and initial focus on the first interactive element — NOT on the destructive action.
  Body scroll must lock. Modals are Client Components ('use client').

--- EmptyValue helper (fixes finding #6) ---
  Create /lib/format.ts:
    export const orDash = (v?: string | null) => v?.trim() || '—'
    export const orLabel = (v: string | null | undefined, fallback: string) => v?.trim() || fallback
  Render the fallback in ink-400 italic. Never allow a bare `.`, `()`, or empty cell to ship.
  Sender/organisation lines must read "Sender not specified", not "sent by .".

--- Skeleton / Loading ---
  Every async surface gets a skeleton: ink-100 blocks at the final layout's dimensions with a
  1.4s shimmer. No spinners on full pages, no layout shift on resolve.

=====================================================================
6. ICONOGRAPHY
=====================================================================

Install lucide-react. Replace ALL emoji with these, 16px default, stroke 2, currentColor:
  ✍️  → PenLine / Signature      🔑 → KeyRound        ✨ → Sparkles → replace with UserPlus
  👤  → User                     🔒 → ShieldCheck     📄 → FileText
  🎯  → Target → replace with CheckCircle2            ✅ → CheckCircle2
Icons are always `aria-hidden="true"` when adjacent to a text label, and get an `aria-label`
when standalone.

=====================================================================
7. ACCESSIBILITY BASELINE (non-negotiable)
=====================================================================

- Every interactive element has a visible :focus-visible ring (ring-2 ink-950, offset-2).
  Currently there are none.
- Minimum hit target 40x40px (checkboxes, icon buttons, the consent checkbox especially).
- Contrast: body text ≥4.5:1, large text and UI borders ≥3:1. Verify brand-600 on white (6.15:1 ✓)
  and never place amber-500 text on white (fails — use amber-700).
- All modals, the OTP entry, and the signing canvas are keyboard-operable end to end.
- Status is never conveyed by color alone — pair every status pill with a label or icon.
- Announce async state changes (field signed, OTP sent, code invalid) via an aria-live="polite"
  region.

=====================================================================
8. RESPONSIVE
=====================================================================

Breakpoints: sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1536.
Container: max-w-[1440px] mx-auto px-6 lg:px-8 for app chrome.
A large share of signers open these links on a phone. Every signing-flow screen (Part B §3-§7)
must be verified at 390x844 before it is considered done.

=====================================================================
9. DELIVERABLE
=====================================================================

1. tailwind.config.ts with the full token set above.
2. globals.css with :root custom properties, the autofill override, and a base reset.
3. /components/ui/{button,input,badge,card,dialog,skeleton,field}.tsx with variant maps.
4. /lib/format.ts with the fallback helpers.
5. A codemod pass removing every banned color class, every `dark:` variant, and every emoji
   used as an icon. Report the file list you changed.

Do not proceed to screen-level work until this compiles and the primitives render in isolation.
```
