# Graphsign Architecture

## Principles

- Modular
- API-first
- Multi-tenant
- Secure by design
- Event-driven where appropriate

---

## Layers

Frontend

↓

API

↓

Business Services

↓

Repositories

↓

Database

---

## Never

Frontend

↓

Database

Direct access is forbidden.

---

## Business Rules

Business logic belongs ONLY in services.

Never inside

- Controllers
- React Components
- Database

---

## Authentication

JWT

Refresh Tokens

MFA

RBAC

---

## Multi-tenancy

Every request belongs to exactly one tenant.

Every query must enforce tenant isolation.

---

## Audit

Every business action creates an audit event.

Audit logs are immutable.

---

## Storage

Metadata

↓

Database

Files

↓

Object Storage

---

## Background Jobs

Emails

Signing reminders

Retention

Cleanup

Webhooks

must execute asynchronously.

---

## AI

AI services never access the database directly.

Only through APIs.

---

## Architecture Changes

Major architectural changes require an ADR.