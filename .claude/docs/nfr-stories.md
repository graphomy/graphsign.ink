# Non-Functional Requirements

> Source of truth: [Confluence — System Architecture §17](https://graphomy.atlassian.net/wiki/spaces/INK/pages/1081396)

## NFR Summary

| Attribute | Target |
|---|---|
| **Availability** | Best-effort (free tiers); SLA on Enterprise |
| **Signing Latency** | Seal completes within seconds of last signature (warm signing instance) |
| **Page Load** | < 2 seconds |
| **API Response** | < 300ms average; 95th percentile < 500ms |
| **Integrity** | 100% completed docs tamper-evident (PAdES B-LTA) + hash-chained audit |
| **Confidentiality** | TLS 1.3; encryption at rest; RLS tenant isolation |
| **Scalability** | Workers autoscale; Neon scale-to-zero; signing scales horizontally |
| **Portability** | Self-host parity via Docker Compose; standards-based export |
| **Accessibility** | WCAG 2.2 AA signing experience |
| **Compliance** | ESIGN/UETA, eIDAS SES→QES (CSC), 21 CFR Part 11 (Enterprise) |

## NFR Stories

### Performance

- As a user, I expect page loads in under 2 seconds so that the platform feels fast.
- As a developer, API endpoints must respond in under 300ms on average.
- As a signer, the signing workflow must not require unnecessary page refreshes.
- Large documents must be processed in the background without blocking the UI.
- Frontend main bundle must stay under 500KB; lazy-load non-critical components.

### Security

- As an org admin, I expect tenant data to be fully isolated via RLS.
- All sensitive data must be encrypted at rest and in transit (TLS 1.3).
- Authentication, signing, and password-reset endpoints must be rate-limited.
- Signed documents must remain verifiable even if graphsign.ink ceases to exist.

### Reliability

- Sealed documents must be tamper-evident and independently verifiable.
- Audit logs must be immutable and hash-chained.
- The signing service must scale horizontally and keep one instance warm.
- Backup restoration must be tested periodically.

### Compliance

- Every signature must be uniquely attributable to its signer.
- Consent to electronic signing must be captured and logged.
- Every business action must produce an audit event.
- Post-approval edits must invalidate approvals (21 CFR Part 11).

### Accessibility

- The signing experience must meet WCAG 2.2 AA standards.
- All interactive elements must support keyboard navigation.
- ARIA labels and focus states must be present on all controls.

### Portability

- The platform must be fully self-hostable via Docker Compose.
- Data export must be available for all user data.
- No vendor lock-in — standards-based protocols throughout.
