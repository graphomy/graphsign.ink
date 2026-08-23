# /rls-check Command

Verify Row-Level Security policies on all tenant tables.

## Usage

```
/rls-check
```

## Steps

1. Read `docs/database.md` for RLS implementation standards
2. Connect to the database and identify all tables with `organisation_id` or `tenant_id` columns
3. For each table, verify:
   - [ ] RLS is enabled (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`)
   - [ ] A tenant isolation policy exists
   - [ ] The policy uses `current_setting('app.current_tenant')`
   - [ ] No BYPASSRLS roles exist except `super_admin`
4. Check for tables that SHOULD have RLS but don't:
   - Any table with business data
   - Any table with user data
   - Any table with document data
5. Verify RLS policies cannot be bypassed by:
   - Testing cross-tenant access with different tenant contexts
   - Checking for `SECURITY DEFINER` functions that might bypass RLS

## Output

- List of all tables with RLS status (✅ enabled / ❌ missing)
- List of tables that need RLS but don't have it
- Any policy gaps or bypass risks
