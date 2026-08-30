# Welcome to graphsign.ink

**graphsign.ink** is an open-source, developer-friendly, and globally compliant electronic signature and agreement workflow platform.

---

## 🌟 Mission & Architectural Pillars

Organizations should never feel locked into proprietary electronic signature platforms. Every signed document created with graphsign.ink remains independently verifiable forever — even if graphsign.ink ceases to exist.

We build around five core principles:

1. **Security First**: Default-deny access control, zero-trust architecture, high-entropy cryptographic tokens, and immutable audit logs.
2. **Compliance by Design**: Native architecture designed for ESIGN Act, UETA, eIDAS (SES/AES), and 21 CFR Part 11 requirements.
3. **Open Source First**: AGPL-3.0 open core; completely self-hostable with no vendor lock-in.
4. **API First**: Every capability accessible via versioned RESTful APIs; Web UI is built cleanly as an API client.
5. **Multi-Tenant Isolation**: Built-in tenant isolation enforced at the database layer with strict organization scoping.

---

## 📑 Feature Overview (Implemented Modules)

### 📄 Agreement & Document Management

- Support for uploading `.pdf`, `.docx`, and `.md` documents with size/encryption detection.
- Live dual-pane Markdown scratch editor with formatting toolbar and preview.
- Semantic document versioning (`v0.1` draft baseline, auto-incrementing minor/major version bumps upon activation).
- Dedicated status tabs for Active agreements, Drafts, and Archived records.
- Change history timeline modal and metadata tagging.

### 🎨 Visual Document Editor & Field Placement

- Multi-page visual canvas with zoom controls, fit-to-width, and left-hand thumbnail navigation.
- Rich field palette: **Signature**, **Initials**, **Text**, **Date**, **Email**, **Company**, **Checkbox**, **Radio Group**, **Dropdown**.
- Recipient assignment with distinct color coding per envelope participant.
- Property inspector for required toggles, email/number/regex validation rules, and custom placeholders.
- Interactive **Preview Mode** with participant switcher to simulate signer inputs before dispatch.

### 🔄 Governed Workflow Engine & Signer Portal

- State machine lifecycle: `DRAFT` $\rightarrow$ `IN_REVIEW` $\rightarrow$ `APPROVED` / `REJECTED` $\rightarrow$ `SENT` $\rightarrow$ `COMPLETED` / `CANCELLED` / `EXPIRED` / `DECLINED`.
- Internal review submission and reviewer approval/rejection workflows with feedback comments.
- **Sequential vs Parallel Signing Order**: Tiered routing with automatic step advancement upon completion.
- Public **Signer Portal** (`/sign/[token]`) supporting Drawn canvas and Typed cursive signatures.
- **Dynamic Conditional Logic**: Real-time evaluation of trigger rules (`SHOW`, `HIDE`, `REQUIRE`).
- Automated view tracking beacons and cancellation/expiry handling.

### 👥 Identity, Multi-Tenancy & RBAC

- User registration, secure email verification, and password reset.
- Time-based One-Time Password (TOTP) Multi-Factor Authentication (MFA).
- Organization workspaces, team hierarchies, custom domain verification DNS records, and storage quotas.
- Fine-grained Role-Based Access Control (`owner`, `admin`, `sender`, `viewer`).

### 🔏 Cryptographic Signing & PAdES Verification (INK-18)

- **PAdES Baseline B-T / B-LTA Sealing**: Cryptographically seals completed agreements with digital signatures and RFC 3161 timestamps.
- **Certificate Custody (PKCS#11)**: Generates self-signed X.509 certificates with custom identity credentials (CN, O, OU, L, ST, C, EMAIL) or imports Bring Your Own (BYO) corporate commercial certificates with full intermediate chains.
- **RFC 3161 Multi-TSA Failover**: Automated timestamping via DigiCert, Sectigo, and FreeTSA.
- **Cloud Signature Consortium (CSC v2.2)**: Remote signature API at `/csc/v2/` for OAuth-based credential authorization and hash signing.
- **Public 3-Tier Verification Portal (`/verify`)**: Zero-knowledge browser subtle crypto verification, QR badge scanning, and downloadable Certificates of Authenticity.

### 🔍 Advanced Search & Saved Presets (INK-117 to INK-122)

- Global unified search across documents, templates, and recipients.
- Faceted multi-criteria filtering with custom saved filter presets.

### 🛡️ Immutable Audit Trail

- Cryptographic SHA-256 hash-chained audit logging (`previous_hash` $\rightarrow$ `current_hash`).
- Tamper-evident logging of every lifecycle transition, draft revision, view event, and signature execution.

---

## 🏗️ Technology Stack

| Layer              | Technology                                                          |
| :----------------- | :------------------------------------------------------------------ |
| **Language**       | TypeScript (Strict Mode) across monorepo                            |
| **Frontend**       | Next.js 15+ (App Router), React 19, Vanilla CSS, Tailwind utilities |
| **API Backend**    | Hono framework on Cloudflare Workers                                |
| **Database & ORM** | PostgreSQL 15+ / Neon Postgres with Prisma ORM                      |
| **Authentication** | JWT (HMAC-SHA256), Web Crypto API, TOTP MFA (RFC 6238)              |
| **Testing**        | Vitest, React Testing Library, JSDOM                                |

---

## 📖 Wiki Navigation

- **[Getting Started](Getting-Started.md)** — Step-by-step setup guide and Table of Contents
- **[Authentication & Identity Management](Authentication-and-Identity.md)** — User authentication, verification, and MFA
- **[Organization & Multi-Tenancy](Organization-and-Tenancy.md)** — Workspaces, teams, domains, quotas, and RBAC
- **[Agreement Management](Agreement-Management.md)** — File upload, scratch Markdown, lifecycle, and versioning
- **[Visual Document Editor & Field Placement](Document-Editor-and-Fields.md)** — Field palette, drag & drop, validation, and preview mode
- **[Workflow Engine & Signer Portal](Workflow-Engine-and-Signer-Portal.md)** — Review workflows, sequential/parallel routing, signer interface, and conditional logic
- **[Cryptographic Signing & Verification](Cryptographic-Signing-and-Verification.md)** — PAdES B-T/B-LTA sealing, BYO certificates, RFC 3161 timestamps, CSC v2.2, and public verification portal
- **[REST API Reference](REST-API-Reference.md)** — Complete endpoints, schemas, and developer integration guide
- **[Security & Immutable Audit Trail](Security-and-Audit-Trail.md)** — Cryptographic hash chaining and compliance
