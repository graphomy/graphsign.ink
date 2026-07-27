# RLS Policies Skill

Write and test Row-Level Security policies for multi-tenant isolation.

## Context

See `docs/database.md` § Multi-Tenancy and § Tenant Isolation for full details.

## Why RLS?

RLS provides database-enforced tenant isolation. Even if the application layer has a bug, data cannot leak across tenants.

## Implementation Pattern

### 1. Enable RLS on Every Business Table

```sql
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
-- Apply to ALL tables with organisation_id
```

### 2. Create Tenant Isolation Policy

```sql
CREATE POLICY tenant_isolation ON documents
    FOR ALL
    USING (organisation_id IN (
        SELECT id FROM organisations
        WHERE tenant_id = current_setting('app.current_tenant')
    ))
    WITH CHECK (organisation_id IN (
        SELECT id FROM organisations
        WHERE tenant_id = current_setting('app.current_tenant')
    ));
```

### 3. Set Tenant Context Per Connection

```typescript
// In API middleware, after JWT validation
const tenantId = extractTenantFromJWT(token);
await prisma.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
```

### 4. Super-Admin Bypass

```sql
CREATE ROLE super_admin BYPASSRLS;
GRANT super_admin TO platform_admin;
```

Only the platform super-admin role bypasses RLS. This is used for cross-tenant operations (monitoring, support).

## Testing RLS

### Test Isolation

```sql
-- Set tenant context to Org A
SET app.current_tenant = 'org-a-tenant-id';

-- Should return only Org A's documents
SELECT * FROM documents;

-- Set tenant context to Org B
SET app.current_tenant = 'org-b-tenant-id';

-- Should return only Org B's documents (no Org A data)
SELECT * FROM documents;
```

### Test Cross-Tenant Denied

```sql
-- As Org A, try to access Org B's document by ID
SET app.current_tenant = 'org-a-tenant-id';
SELECT * FROM documents WHERE id = '<org-b-document-id>';
-- Should return 0 rows
```

### Test Insert Scoping

```sql
SET app.current_tenant = 'org-a-tenant-id';
INSERT INTO documents (organisation_id, ...) VALUES ('<org-b-id>', ...);
-- Should fail due to WITH CHECK policy
```

## Checklist for New Tables

- [ ] Table has `organisation_id` column
- [ ] `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` applied
- [ ] `tenant_isolation` policy created with USING and WITH CHECK
- [ ] Tested: correct tenant sees correct data
- [ ] Tested: cross-tenant access returns empty
- [ ] Tested: cross-tenant insert rejected
- [ ] Indexed: `organisation_id` included in key indexes
