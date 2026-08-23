# Audit Hash Chain Skill

Implement and verify the append-only, hash-chained audit log for graphsign.ink.

## Context

See `docs/database.md` § Audit and `docs/security.md` § Audit Logging for full requirements.

The audit log is a compliance-critical component. Every business action must create an audit event. Events are append-only and hash-chained for tamper-evidence.

## Schema

```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id UUID NOT NULL,
  user_id UUID,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB,
  previous_hash VARCHAR(64),
  current_hash VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Hash Chain Algorithm

1. Retrieve the `current_hash` of the most recent audit event for the organisation
2. Compute `current_hash = SHA-256(previous_hash + action + resource_type + resource_id + user_id + created_at + metadata)`
3. Insert the new row with both `previous_hash` and `current_hash`
4. The first event for an org has `previous_hash = NULL`

## Verification

To verify chain integrity:

1. Read all audit events for an org ordered by `created_at`
2. For each event, recompute `current_hash` from the stored fields + `previous_hash`
3. Compare computed hash to stored `current_hash`
4. Any mismatch indicates tampering

## Rules

- Never UPDATE or DELETE audit records
- Always include `previous_hash` reference
- Partition by month for performance
- Index on `(organisation_id, created_at)` and `(resource_type, resource_id)`
