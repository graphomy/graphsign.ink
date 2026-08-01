# Magic Link Signing Skill

Implement the account-less signer flow via secure magic links.

## Context

See `docs/architecture.md` § Runtime Flows and `docs/security.md` § Authentication for full details.

## Flow Overview

1. Sender creates envelope and assigns recipient emails
2. System generates per-recipient magic link tokens
3. Email with magic link sent to each signer
4. Signer clicks link → opens signing page (no account needed)
5. Signer reviews document, fills fields, signs
6. Token is consumed (single-use)

## Token Generation

```typescript
interface SigningToken {
  id: string; // UUID v7
  envelopeId: string; // UUID
  recipientId: string; // UUID
  tokenHash: string; // SHA-256 of the actual token
  expiresAt: Date; // Configurable, default 7 days
  usedAt: Date | null; // Set on first use
  createdAt: Date;
}
```

### Security Requirements

- Token is a cryptographically random string (min 32 bytes, base64url encoded)
- Only the hash is stored in the database — never the raw token
- Single-use: mark as used after signing completes
- Expiring: configurable per envelope (default 7 days)
- Per-recipient: each signer gets a unique token

## Magic Link URL

```
https://graphsign.ink/sign/{token}
```

## Signer Page Flow

1. Validate token (unexpired, unused, valid hash)
2. Log access event (IP, user agent, timestamp) → audit log
3. Display document with assigned fields highlighted
4. Show consent-to-e-sign checkbox
5. Guide signer through fields (tab-through with progress)
6. Capture signature (draw / type / upload)
7. Confirm and submit
8. Record intent, identity, and auth method → audit log
9. If all signatures collected → trigger seal flow

## Audit Events

Every step of the magic link flow must create an audit event:

- `signing_link.opened`
- `signing_link.consent_given`
- `signing_link.field_completed`
- `signing_link.signature_captured`
- `signing_link.completed`
- `signing_link.declined`
