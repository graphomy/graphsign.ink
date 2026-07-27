# UI Standards

> See also: `docs/coding-standards.md` for frontend project structure

## Design

Minimal, fast, accessible, professional, calm, predictable, simple.

## Framework

- React 18+ with Next.js 14+ (App Router)
- Tailwind CSS 3+
- shadcn/ui component library
- PDF.js for document rendering

## Layout

- 8px spacing system
- Responsive — desktop first
- Every page has one primary action

## Colors

- Black, White
- Red (#ba0000) — brand accent
- Neutral gray palette

## Typography

One font family. Maximum two font weights.

## Components

- Reusable, composable, accessible
- Use shadcn/ui as the component base
- Never invent new component styles — reuse existing components

## PDF Viewer & Field Placement

- PDF.js (Mozilla) for browser PDF rendering
- `pdf-lib` for lightweight client-side manipulation (page ordering, previews)
- Drag-and-drop signature/field placement at precise coordinates
- **Cryptographic sealing never happens in the browser** — delegated to the Signing Service

## Signer Experience

- Account-less signing via secure magic link
- Responsive signing page
- Signature capture: draw, type, or upload
- Guided tab-through field completion with progress indicator
- Clear consent-to-e-sign UI

## Forms

- Client validation + server validation
- Helpful error messages
- Zod schemas shared between client and server

## Loading States

Every async action must show: loading state, skeleton, or progress indicator.

## Empty States

Every list page must have an empty state with clear next action.

## Error States

Friendly, recoverable, with clear guidance.

## Accessibility

- WCAG 2.2 AA
- Keyboard navigation
- ARIA labels
- Focus states
- Screen reader support for signing flow

## Performance

- Main bundle under 500KB
- Lazy load non-critical components
- Optimize and lazy load images

## AI Rules

Never invent new component styles. Reuse existing shadcn/ui components. Follow the established design system.