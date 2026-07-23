# Database Standards

## Database

PostgreSQL

---

## ORM

Use Prisma.

Never write inline SQL unless necessary.

---

## Naming

Tables

snake_case

Columns

snake_case

Indexes

idx_table_column

Foreign Keys

fk_table_reference

---

## IDs

UUID v7

Never auto-increment.

---

## Timestamps

created_at

updated_at

deleted_at

---

## Soft Delete

Never permanently delete business data.

Use deleted_at.

---

## Multi-tenancy

Every business table contains

tenant_id

---

## Constraints

Prefer database constraints over application validation.

---

## Migrations

Never edit existing migrations.

Always create new migrations.

---

## Audit

Never update audit records.

Insert only.

---

## Performance

Add indexes.

Avoid N+1 queries.

Use pagination.

---

## AI Rules

Never modify production schema without migration.

Never drop columns automatically.