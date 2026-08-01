# Welcome to graphsign.ink

**graphsign.ink** is an open-source, globally compliant document generation, agreement workflow, and electronic signature platform.

---

## 🌟 Mission & Vision

Organizations should never feel locked into proprietary electronic signature platforms. Every signed document created with graphsign.ink remains independently verifiable forever — even if graphsign.ink ceases to exist.

We prioritize:
- **Security First**: Default-deny access control, zero-trust architecture, and strict encryption standards.
- **Compliance by Design**: Native support for ESIGN Act, UETA, eIDAS (SES/AES), and auditable workflows.
- **Open Source First**: AGPL-3.0 open core; completely self-hostable with no vendor lock-in.
- **API First**: Every capability accessible via RESTful APIs; Web UI is built as an API client.
- **Multi-Tenant Isolation**: Built-in tenant isolation enforced at the database level with PostgreSQL Row-Level Security (RLS).

---

## ✨ Core Features (V1 Scope)

### 📄 Agreement Generation & Templates
- Upload PDF and DOCX documents.
- Build reusable agreement templates.
- Interactive field placement (signatures, initials, dates, text fields).

### 🔄 Agreement Workflow Engine
- State machine routing: `Draft` → `Review` → `Approval` → `Signing` → `Completed` → `Archived`.
- Audit logging for every state transition.

### ✍️ Legally Binding Electronic Signatures
- Recipient management and email invitation workflows.
- Secure email verification and single-use magic link signer access.
- Tamper-evident PAdES B-LTA PDF sealing with embedded RFC 3161 timestamp tokens and Certificate of Completion.

### 🛡️ Administration & Security
- Organization-level Role-Based Access Control (RBAC).
- Append-only, hash-chained audit trails.
- Configurable document retention and privacy controls.

---

## 🏗️ Architecture & Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Language** | TypeScript (Strict Mode) across frontend & API; Java for signing service |
| **Frontend** | Next.js 14+, React 19, Tailwind CSS, shadcn/ui, PDF.js |
| **API Layer** | Hono framework running on Cloudflare Workers |
| **Database** | Neon Postgres / PostgreSQL 15+ with Prisma ORM & Row-Level Security (RLS) |
| **Object Storage** | Cloudflare R2 (S3-compatible; MinIO for self-hosting) |
| **Identity & Auth** | Zitadel (OIDC, JWT validation, TOTP MFA) |
| **PDF Sealing** | JVM container (EU DSS / PDFBox) with CSC protocol support |

---

## 📖 Wiki Navigation

- **[Getting Started](Getting-Started)**: Step-by-step guide to cloning, setting up, and running graphsign.ink locally.
