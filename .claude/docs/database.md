# Database Standards

> Source of truth: [Confluence — Database Design](https://graphomy.atlassian.net/wiki/spaces/INK/pages/753745)

## Database

PostgreSQL 15+ (Neon Postgres hosted, Docker for self-host).

## ORM

Use Prisma. Never write inline SQL unless necessary.

## Naming

| Element | Convention | Example |
|---|---|---|
| Tables | snake_case | `documents`, `audit_log` |
| Columns | snake_case | `created_at`, `organisation_id` |
| Indexes | idx_table_column | `idx_documents_status` |
| Foreign Keys | fk_table_reference | `fk_documents_template` |

## IDs

UUID v7 — never auto-increment.

## Timestamps

Every business table must have: `created_at`, `updated_at`, `deleted_at`.

## Soft Delete

Never permanently delete business data. Use `deleted_at`.

## Multi-Tenancy

Every business table contains `organisation_id`. RLS policy restricts all reads/writes to the caller's tenant.

### RLS Implementation

```sql
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON documents
    USING (organisation_id IN (
        SELECT id FROM organisations
        WHERE tenant_id = current_setting('app.current_tenant')
    ));
```

Tenant context set via `SET app.current_tenant = 'tenant-id'` per connection.

## Core Tables

See `docs/domain-model.md` for the full entity relationship diagram.

Key tables: `organisations`, `users`, `documents`, `signatures`, `templates`, `certificates`, `audit_log`, `signature_requests`, `recipients`, `roles`, `permissions`, `api_keys`, `webhooks`.

## Indexing Strategy

- Covering indexes for common query patterns
- Composite indexes for filtered queries
- Partial indexes to reduce size
- GIN indexes for JSONB columns
- Avoid over-indexing

### Critical Indexes

| Table | Index | Purpose |
|---|---|---|
| organisations | slug, status, tenant_id | Lookup, filtering |
| users | (organisation_id, email), status | Unique email per org |
| documents | organisation_id, status, created_at | Common queries |
| signatures | document_id, recipient_id, status | By document/recipient |
| audit_log | (resource_type, resource_id), user_id, created_at | Event lookup |

## Constraints

Prefer database constraints over application validation.

## Migrations

- Never edit existing migrations — always create new ones
- Tools: Prisma Migrate
- Process: Dev → Code Review → Staging Test → Rollback Test → Production

## Audit

- Never update audit records — insert only
- Hash-chained: `previous_hash` → `current_hash` for tamper-evidence
- Partition by month for performance

## Performance

- Add indexes for query patterns
- Avoid N+1 queries
- Use cursor-based pagination
- Use connection pooling (PgBouncer)

## Backup & Recovery

| Type | Frequency | Retention | RPO |
|---|---|---|---|
| Full Database | Daily 2 AM UTC | 30 days | 24 hours |
| Incremental | Hourly | 7 days | 1 hour |
| WAL Archive | Continuous | 30 days | 5 minutes |

## Database Roles

| Role | Read | Write | DDL | RLS Bypass |
|---|---|---|---|---|
| app_readonly | ✓ | ✗ | ✗ | ✗ |
| app_readwrite | ✓ | ✓ | ✗ | ✗ |
| app_admin | ✓ | ✓ | ✓ | ✗ |
| super_admin | ✓ | ✓ | ✓ | ✓ |

## AI Rules

- Never modify production schema without migration
- Never drop columns automatically
- Always verify RLS policies on new tables