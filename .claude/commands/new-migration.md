# /new-migration Command

Create a new Prisma database migration.

## Usage

```
/new-migration <name>
```

## Steps

1. Read `docs/database.md` for migration rules and naming conventions
2. Validate the migration name follows snake_case convention
3. Generate the Prisma migration:
   ```
   npx prisma migrate dev --name <name>
   ```
4. Review the generated SQL for:
   - [ ] RLS policies on any new tables
   - [ ] UUID v7 for IDs (not auto-increment)
   - [ ] `created_at`, `updated_at`, `deleted_at` timestamps
   - [ ] `organisation_id` on business tables
   - [ ] Appropriate indexes (see `docs/database.md` indexing strategy)
   - [ ] Foreign key constraints
   - [ ] No destructive operations (DROP TABLE, DROP COLUMN)
5. If new tables are created, generate RLS policy SQL
6. Run the migration against the dev database
7. Verify the migration can be rolled back

## Input

`$ARGUMENTS` — migration name in snake_case (e.g., `add_templates_table`)

## Output

- Generated migration file in `packages/db/prisma/migrations/`
- RLS policies for new tables
- Verification that migration applies and rolls back cleanly
