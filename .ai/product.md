# Product Overview

## Product Name

graphsign.ink

---

# Mission

graphsign.ink is an open-source, globally compliant document generation, agreement workflow, and electronic signature platform.

It allows organizations to:

- Generate agreements
- Create reusable templates
- Route agreements through approval workflows
- Collect legally binding electronic signatures
- Produce independently verifiable signed PDFs
- Self-host the platform or use the managed cloud offering

The platform prioritizes:

- Security
- Compliance
- Transparency
- Open source
- Simplicity
- Performance

---

# Vision

Become the world's most trusted open-source electronic signature platform.

Users should never feel locked into graphsign.ink.

Every signed document must remain verifiable even if graphsign.ink no longer exists.

---

# Core Principles

Every decision must follow these principles.

## 1. Security First

Security is never optional.

Never implement a feature that weakens security.

Always choose the safer implementation.

---

## 2. Compliance by Design

Compliance is part of the architecture.

It is not an afterthought.

The platform is designed to support:

- ESIGN
- UETA
- eIDAS
- 21 CFR Part 11

---

## 3. Open Source First

The entire product core is open source under AGPL-3.0.

Enterprise capabilities are layered on top.

Never build code that intentionally prevents self-hosting.

---

## 4. API First

Every major feature should be accessible through APIs.

The Web UI is one client of the platform.

---

## 5. Multi Tenant

The hosted platform is multi-tenant.

Tenant isolation is mandatory.

Every request belongs to exactly one tenant.

---

## 6. Simplicity

Choose the simplest architecture that solves the problem.

Avoid unnecessary abstraction.

Avoid unnecessary frameworks.

---

## 7. Long-term Maintainability

The project is expected to live for many years.

Code readability is more important than clever code.

---

# Product Editions

## Self Hosted (OSS)

Free

Community supported

Customer manages:

- infrastructure
- storage
- certificates
- authentication
- AI models

---

## Starter

Hosted

Free

Basic features only.

---

## Growth

Hosted

Paid

Adds:

- support
- storage
- integrations
- OIDC

---

## Enterprise

Premium

Adds:

- SAML
- SCIM
- QES
- Part 11
- advanced administration
- compliance packages

---

# Product Scope

graphsign.ink consists of four major capabilities.

## 1. Agreement Generation

Users can:

- create documents
- upload PDFs
- upload DOCX
- use templates
- use AI drafting
- edit agreements

---

## 2. Workflow

Documents move through

Draft

↓

Review

↓

Approval

↓

Signing

↓

Completed

↓

Archived

Every transition is audited.

---

## 3. Electronic Signature

Users can

- place fields
- invite recipients
- sign
- verify signatures
- download signed PDFs

---

## 4. Administration

Organization admins manage

- users
- roles
- retention
- branding
- audit logs

Platform administrators manage

- tenants
- monitoring
- maintenance
- feature flags

---

# Primary Users

## Document Author

Creates agreements.

Needs speed.

---

## Reviewer

Reviews agreements.

Needs comments and version history.

---

## Approver

Approves documents.

Needs auditability.

---

## Signer

Signs documents.

Needs a frictionless experience.

---

## Organization Administrator

Manages organization.

Needs visibility and control.

---

## Platform Administrator

Manages graphsign.ink itself.

Needs monitoring and operational tooling.

---

# V1 Scope

Version 1 focuses only on these capabilities.

Authentication

Organization Management

RBAC

Audit Logs

Document Upload

Template Management

Agreement Creation

Field Placement

Signing Workflow

Recipient Management

Notifications

Signed PDF Generation

Certificate of Completion

Dashboard

Docker Deployment

API

Open Source Release

Nothing else.

---

# Explicit Non Goals

The following are NOT part of Version 1.

Contract Lifecycle Management

AI Risk Analysis

Clause Library

Clause Comparison

Contract Negotiation

Microsoft Office Plugins

Marketplace

Enterprise Administration

SAML

SCIM

QES

SOC2

ISO27001

Billing

Subscription Management

CRM

Legal Analytics

Obligation Tracking

These must not be implemented.

---

# AI Usage

AI is an assistant.

It never makes business decisions.

AI may

- draft agreements
- improve wording
- summarize documents

AI must never

- automatically sign documents
- approve workflows
- bypass security

Every AI output must remain editable by humans.

---

# Product Philosophy

Users own their data.

Users own their certificates.

Users own their AI.

graphsign.ink never creates vendor lock-in.

---

# UX Philosophy

The application should feel

Fast

Minimal

Professional

Calm

Predictable

Simple

Avoid visual clutter.

Every page should have one primary action.

---

# Security Principles

Least privilege.

Default deny.

Zero trust.

Every action authenticated.

Every action authorized.

Every action audited.

---

# Compliance Principles

Every business action must be traceable.

Every signature must be attributable.

Every signed document must be tamper evident.

Audit logs are immutable.

Time is authoritative.

Documents must remain reproducible.

---

# Performance Goals

Page load

<2 seconds

API response

<300ms average

Signing workflow

No unnecessary page refreshes

Large documents

Background processing

---

# Coding Philosophy

Business rules belong in services.

Controllers remain thin.

Components remain presentational.

Database access stays isolated.

Every change must include tests.

---

# Documentation Philosophy

Documentation is part of the product.

Every feature must include

Architecture

API documentation

User documentation

Developer documentation

Release notes

---

# Release Philosophy

Every release must be

Repeatable

Tested

Documented

Tagged

Deployable

Rollback capable

---

# AI Development Rules

Before writing code, every AI agent must

1. Read this file.
2. Read architecture.md.
3. Read coding-standards.md.
4. Read security.md.
5. Read api.md.
6. Read database.md.
7. Read testing.md.

Never generate code without understanding the product.

Never invent features.

Never expand scope.

Never rewrite unrelated code.

Prefer small pull requests.

Maintain backward compatibility unless explicitly instructed otherwise.

---

# Decision Hierarchy

When conflicts occur, follow this order.

1. Security
2. Compliance
3. Product Requirements
4. Architecture
5. Maintainability
6. Performance
7. Developer Convenience

Security always wins.

Compliance always wins over convenience.

---

# Success Criteria

Version 1 is considered complete only when:

- A user can create an agreement.
- A user can upload or start from a template.
- A workflow can route through review and approval.
- Recipients can sign electronically.
- A tamper-evident signed PDF is generated.
- A certificate of completion is generated.
- Audit logs are complete.
- Multi-tenancy works.
- RBAC works.
- Docker deployment is available.
- The platform is fully self-hostable.
- The source code is publicly available under AGPL-3.0.