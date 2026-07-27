# Testing Standards

> Source of truth for test architecture, coverage metrics, test types, and quality gates across graphsign.ink.

Testing is mandatory for all code added to the codebase. No pull request may be merged without passing automated test suites and meeting coverage thresholds.

---

## 1. Testing Strategy & Pyramid

graphsign.ink enforces a 70 / 20 / 10 testing pyramid:

```
      /\
     /  \        10% E2E Tests (Playwright)
    /----\       - Full user flows, magic links, visual & a11y regressions
   /      \      20% Integration Tests (Vitest + Test DB/Containers)
  /--------\     - RLS policy checks, API endpoints, PAdES seal integration, Auth
 /          \    70% Unit Tests (Vitest / JUnit 5)
/------------\   - Pure functions, state machines, Zod validation, PDF parsing
```

| Test Level | Scope | Framework | Execution Context | Target Speed |
|---|---|---|---|---|
| **Unit** | Pure functions, domain logic, state machines, validators | Vitest (TS), JUnit 5 (Java) | In-memory / isolated | < 10ms per test |
| **Integration** | DB repositories, RLS policies, Auth middleware, Signing service | Vitest + Neon/Postgres test instance + MinIO | Test DB & container bindings | < 200ms per test |
| **E2E** | Full browser workflow (Signer, Author, Org Admin) | Playwright | Headless browser vs local stack | < 5s per scenario |
| **Accessibility** | WCAG 2.2 AA compliance on UI pages | `@axe-core/playwright` | Part of E2E pipeline | < 2s per page |

---

## 2. Mandatory Coverage Thresholds

| Scope | Threshold | Strict Enforcement |
|---|---|---|
| **Global Codebase** | **80%** lines & branches | Enforced by CI quality gate |
| **Core Business Logic (`packages/core/`)** | **90%** lines & branches | Required for state machine & domain services |
| **Cryptographic Sealing (`services/signing/`)** | **100%** path coverage | Required for PAdES B-LTA and CSC integration |
| **Audit Log & Hash Chain (`packages/db/`)** | **100%** path coverage | Cryptographic tamper-evidence validation |
| **Authentication & RBAC (`packages/auth/`)** | **95%** path coverage | Security-critical boundary |

> **Rule:** Never reduce test coverage. A pull request that drops overall coverage will be blocked by CI.

---

## 3. Specialized Domain Testing Requirements

### 3.1 Multi-Tenant Row-Level Security (RLS) Testing
Every table containing `organisation_id` must have automated RLS tests verifying:

1. **Isolation:** Data inserted under `Tenant A` context (`SET app.current_tenant = 'tenant-a'`) is completely invisible when querying under `Tenant B` context.
2. **Boundary Protection:** Attempting a direct `SELECT`, `UPDATE`, or `DELETE` by explicit ID belonging to another tenant returns `0 rows` or throws a permission error.
3. **Insert Check:** `INSERT` statements with a mismatched `organisation_id` fail against the `WITH CHECK` policy clause.
4. **Bypass Prohibition:** Verify non-superadmin database roles (`app_readwrite`, `app_readonly`) cannot bypass RLS.

### 3.2 Cryptographic Sealing & PAdES Testing
The JVM Signing Service (`services/signing/`) requires integration tests that perform full-cycle sealing and verification:

1. **Field Flattening:** PDF form fields are flattened into static content before sealing.
2. **Byte-Range Digest:** SHA-256 digest calculation covers the exact PDF byte range excluding the signature container.
3. **PAdES B-LTA Validation:** Output PDF contains valid signature dictionary, embedded RFC 3161 timestamp token, and LTV revocation data (CRL/OCSP).
4. **Tamper Detection:** Modifying even a single byte of a sealed PDF causes Adobe Reader / PDFBox verification to report `SIGNATURE_INVALID`.
5. **CSC Protocol:** CSC endpoints (`credentials/list`, `signHash`) respond according to the CSC v2 API spec.

### 3.3 Audit Trail & Hash Chain Testing
Tests must explicitly verify the append-only, tamper-evident hash chain:

1. **Hash Link Continuity:** For any sequence of audit events $E_1, E_2, \dots, E_n$, verify that $E_i.\text{previous\_hash} = E_{i-1}.\text{current\_hash}$.
2. **Genesis Event:** The first event for a tenant has `previous_hash = NULL`.
3. **Tamper Rejection:** Recomputing the hash chain across an audit table where a row's metadata or timestamp was modified flags a verification failure.
4. **No Mutability:** Direct SQL `UPDATE` or `DELETE` on `audit_log` is rejected by DB triggers/permissions.

### 3.4 Magic Link Signer Workflow Testing
Signer-facing workflows (account-less access) must test:

1. **Single-Use Enforcement:** A magic link token can only complete a signing session once; subsequent attempts fail with `TOKEN_ALREADY_USED`.
2. **Expiration Handling:** Tokens past `expiresAt` are rejected with `TOKEN_EXPIRED`.
3. **Hash Storage:** Verify raw tokens are never written to the database — only SHA-256 token hashes.
4. **Consent Logging:** Signing cannot complete unless explicit e-sign consent (`consent_given = true`) is recorded in the audit trail.

---

## 4. Mocking Guidelines

To maintain test reliability and speed, follow strict mocking boundaries:

### What MUST Be Mocked in Unit Tests
- **External Email Service (`Resend`):** Mock email dispatch; capture sent payloads in memory.
- **SMS Gateway (`Twilio`):** Mock OTP generation and SMS sending.
- **External AI Providers:** Mock LLM completions with deterministic JSON/text fixtures.
- **Third-Party Identity / Verification (Stripe Identity / Onfido):** Mock verification webhooks and status responses.
- **Qualified Trust Service Providers (QTSPs):** Mock remote CSC HTTP responses during local unit test runs.

### What Must NEVER Be Mocked in Integration & E2E Tests
- **Postgres Row-Level Security Policies:** Tests must run against a real Postgres instance with RLS enabled.
- **Audit Hash Chain Computation:** Hashes must be computed using real SHA-256 algorithms.
- **Zod Schemas & Validators:** Always run live request/response schemas.
- **JWT Validation & RBAC Middleware:** Test real token signing and verification logic.

---

## 5. Test Organization & Conventions

### Directory Layout

```
apps/web/
├── src/
│   ├── components/features/
│   │   ├── SignaturePad.tsx
│   │   └── SignaturePad.test.tsx       # Unit / Component test
├── e2e/
│   ├── signing-flow.spec.ts            # Playwright E2E scenario
│   └── accessibility.spec.ts           # axe-core WCAG 2.2 AA audit

apps/api/
├── src/
│   ├── routes/
│   │   ├── envelopes.ts
│   │   └── envelopes.test.ts           # Route & Validation test
│   └── services/
│       ├── envelope-service.ts
│       └── envelope-service.test.ts    # Business logic unit test

packages/db/
├── src/
│   └── __tests__/
│       ├── rls-isolation.test.ts       # DB RLS integration tests
│       └── audit-chain.test.ts         # Audit hash chain integration tests

services/signing/
├── src/test/java/ink/graphsign/signing/
│   ├── PAdESSealerTest.java            # PAdES B-LTA sealing test
│   └── CSCControllerTest.java          # CSC API test
```

### Naming Conventions
- Unit/Integration tests (TypeScript): `*.test.ts` or `*.test.tsx`
- E2E scenario tests (Playwright): `*.spec.ts`
- Java tests: `*Test.java`
- Test descriptions: Use imperative, descriptive names (`it('should reject signing when magic link token is expired')`)

---

## 6. Execution Commands

| Task | Command |
|---|---|
| **Run All Unit Tests** | `pnpm test` |
| **Run Unit Tests (Watch)** | `pnpm test:watch` |
| **Run DB Integration Tests** | `pnpm --filter @graphsign/db test` |
| **Run Playwright E2E Tests** | `pnpm test:e2e` |
| **Run Accessibility Audit** | `pnpm test:a11y` or `/a11y-check` |
| **Run Signing Service Tests** | `cd services/signing && ./gradlew test` or `/seal-test` |
| **Run RLS Policy Check** | `/rls-check` |
| **Generate Coverage Report** | `pnpm test:coverage` |

---

## 7. AI Code Generation Rules for Testing

When generating code as an AI agent, you **MUST**:

1. **Generate Tests for All New Code:** Never output a feature, API route, or service method without accompanying unit or integration tests.
2. **Add Regression Tests for Bug Fixes:** When fixing a bug, write a test that fails prior to your fix and passes after it.
3. **Avoid Fragile Selectors in UI Tests:** Use `data-testid` attributes or ARIA roles (`getByRole`, `getByTestId`) instead of CSS classes or brittle XPath.
4. **No Arbitrary Timeouts (`sleep`):** Never write `await page.waitForTimeout(3000)`. Always wait for explicit state, network idle, or DOM elements.
5. **No `any` Types in Test Code:** Test fixtures, mocks, and assertions must be strictly typed in TypeScript.