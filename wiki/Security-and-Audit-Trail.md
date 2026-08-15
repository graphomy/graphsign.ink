# Security & Immutable Audit Trail (FR-011)

The **Security & Immutable Audit Trail** module guarantees tamper-evident compliance, cryptographic token hygiene, and verifiable document history.

---

## 🔒 Cryptographic Audit Trail Architecture

### 1. Append-Only Hash Chaining
Every lifecycle action across the platform records an immutable entry into the `AuditLog` table.
- Each record calculates a SHA-256 digest over:
  - Actor ID & Organization ID
  - Action Type (e.g. `AGREEMENT_CREATED`, `SUBMITTED_FOR_REVIEW`, `SENT_FOR_SIGNATURE`, `RECIPIENT_VIEWED`, `RECIPIENT_SIGNED`, `WORKFLOW_COMPLETED`)
  - Timestamp (ISO 8601 UTC)
  - Client IP address and User-Agent
  - Payload diff / metadata
  - `previousHash`: The SHA-256 hash of the immediate prior log entry.
- **Tamper Evidence**: Any modification to a historical log entry breaks the hash chain verification.

### 2. Token Security & Hashing
- Invitation and signing tokens are generated using cryptographically strong 256-bit entropy (`crypto.getRandomValues()`).
- **Zero Plaintext Storage**: Plaintext tokens are transmitted strictly via single-use email links (`/sign/[token]`). Only the SHA-256 hash (`signingTokenHash`) is persisted in the database.

### 3. Electronic Signature Compliance
- **ESIGN Act & UETA**: Captures explicit electronic consent checkbox prior to signature submission.
- **Intent & Attribution**: Binds signer full name, IP address, user-agent, timestamp, and signature data payload directly to the agreement envelope.

---

## 🛡️ Best Practices for Secure Operation

- **Transport Security**: Enforce TLS 1.2+ for all client and webhook communication.
- **Tenant Isolation**: All database queries must be scoped to the authenticated user's `organisationId`.
- **Credential Hygiene**: Never commit environment secrets, private keys, or API tokens to source control.
