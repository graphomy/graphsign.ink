# Coding Standards

> Source of truth: [Confluence — Coding Standards](https://graphomy.atlassian.net/wiki/spaces/INK/pages/753767)

## Purpose

All AI agents MUST follow these standards.

## General Principles

- Write production-quality code
- Simplicity over cleverness
- Readability over brevity
- Prefer explicit code over magic
- Never duplicate business logic
- Never leave TODOs
- Never leave commented code
- Never commit debugging code

## Language

- TypeScript only — strict mode enabled
- No JavaScript files
- Avoid `any` — use `unknown` for dynamic data
- Use Zod for runtime validation

## Code Style

- ESLint + Prettier
- Maximum function length: 50 lines
- Maximum file length: 500 lines
- Maximum nesting: 3 levels

## Naming

| Element    | Convention    |
| ---------- | ------------- |
| Classes    | PascalCase    |
| Interfaces | PascalCase    |
| Functions  | camelCase     |
| Variables  | camelCase     |
| Constants  | UPPER_CASE    |
| Files      | kebab-case.ts |
| Folders    | kebab-case    |

## Frontend Structure

```
apps/web/src/
├── app/                  # Next.js App Router
│   ├── (auth)/          # Authenticated routes
│   ├── (public)/        # Public routes
│   └── api/             # API routes
├── components/
│   ├── ui/              # Reusable UI (shadcn/ui)
│   ├── layout/          # Layout components
│   └── features/        # Feature components
├── lib/
│   ├── utils/           # Utilities
│   ├── hooks/           # Custom hooks (prefix with `use`)
│   └── types/           # Types
└── styles/              # Global styles
```

## Backend Structure

```
apps/api/src/
├── routes/              # Route handlers (thin)
├── services/            # Business logic
├── middleware/           # Auth, rate limiting
├── validators/          # Zod schemas
└── utils/               # Utilities
```

## Comments

Only explain WHY, never WHAT.

```typescript
// Bad: Increment counter
// Good: Required by ESIGN compliance to preserve audit order.
```

## Error Handling

- Never swallow exceptions
- Always return meaningful errors
- Never expose internal implementation details
- Use consistent error format (see `docs/api.md`)

## Logging

Never log: passwords, API keys, certificates, JWT tokens, customer documents.

## Dependencies

- Prefer mature libraries
- Avoid unnecessary dependencies
- Never introduce a dependency without justification

## Testing

See `docs/testing.md` for full testing standards.

- Testing pyramid: 70% unit, 20% integration, 10% E2E
- Aim for 80%+ coverage; 90%+ for business logic
- Use Vitest/Jest for unit tests, Playwright for E2E

## Performance Standards

### Frontend

- Main bundle under 500KB
- Lazy load non-critical components
- Optimize and lazy load images

### Backend

- 95th percentile response time under 500ms
- Optimize database queries
- Use caching for expensive operations

## Git Standards

### Branching

- `main` — production-ready code
- `develop` — integration branch
- `feature/*` — feature branches
- `bugfix/*` — bug fixes
- `hotfix/*` — urgent production fixes

### Commits

- Conventional Commits format
- Imperative, present tense
- Include Jira ID in commit message

### Pull Requests

- Clear title with Jira ID (e.g., `GS-101: Add document upload`)
- Link to relevant issues
- Keep PRs small and focused

## Documentation

- Every exported function requires JSDoc
- Every public API requires OpenAPI documentation

## Code Review Checklist

- [ ] Follows established patterns
- [ ] All functionality is tested
- [ ] No secrets committed
- [ ] Security best practices followed
- [ ] Error handling is comprehensive
- [ ] Documentation updated

## AI Rules

Before modifying code: read existing implementation, preserve coding style, preserve architecture, do not rewrite unrelated code, keep PRs focused.
