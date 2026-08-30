# Agreement & Document Management (FR-005)

The **Agreement & Document Management** module handles document creation, file uploads, Markdown authoring, semantic versioning, metadata tagging, and change history.

---

## 📄 Creation Modes

### 1. File Upload (PDF / DOCX / MD)

- Authors can upload existing contracts in `.pdf`, `.docx`, or `.md` formats.
- **Security Scans**: Detects password-protected or corrupted files and blocks unauthorized uploads.
- Secure binary storage with cryptographic SHA-256 file checksums.

### 2. Scratch Markdown Document Authoring

- Dual-pane Markdown editor with real-time preview and formatting toolbar (Headings, Bold, Italic, Lists, Tables, Blockquotes).
- Stored as pure Markdown text for lightweight version diffing and automated clause generation.

---

## 🏷️ Document Lifecycle States

An agreement moves through the following lifecycle states:

| Status      | Meaning                       | Permitted Operations                                                 |
| :---------- | :---------------------------- | :------------------------------------------------------------------- |
| `DRAFT`     | Initial authoring phase       | Edit content, design fields, submit for review, send, clone, archive |
| `IN_REVIEW` | Under internal review         | Reviewer approve/reject, author cancel                               |
| `APPROVED`  | Approved by reviewer          | Send for signature, field placement, cancel                          |
| `REJECTED`  | Reviewer requested changes    | Edit content, adjust fields, re-submit for review                    |
| `SENT`      | Dispatched to signers         | Signers execute, author track/void                                   |
| `COMPLETED` | Fully executed by all signers | Download sealed PDF, view audit certificate                          |
| `CANCELLED` | Voided by author or admin     | Read-only archive                                                    |
| `DECLINED`  | Declined by a signer          | Read-only with decline reason                                        |
| `EXPIRED`   | Deadline passed               | Read-only archive                                                    |
| `ARCHIVED`  | Hidden from active views      | Restore to draft or permanent purge                                  |

---

## 🔢 Semantic Versioning & Change History

- **Draft Baselines**: New drafts start at version `0.1`.
- **Minor Revisions**: Edits to drafts bump the minor version (e.g. `0.1` $\rightarrow$ `0.2`).
- **Major Releases**: Activating or sending the agreement promotes the version to `1.0` (and `2.0` on major revisions).
- **Change History Timeline**: Authors can open the History modal to inspect a chronological audit of all edits, version promotions, and actors with localized date formatting (`DD-MON-YYYY HH:mm`).

---

## 🔍 Advanced Search & Filter Presets (INK-117 to INK-122)

- **Faceted Filters**: Filter by status (`Signed`, `Active`, `Drafts`, `Archived`), date ranges, and custom tags.
- **Saved Filter Presets**: Users can create, manage, and default reusable filter presets (`/api/v1/search/presets`).
- **Privacy Scoping (INK-248)**: Document payload access is strictly scoped to the document author and designated signers. Super administrators are restricted to organizational metadata only and cannot view private document bodies.

---

## 🔌 API Endpoints for Agreements

| Method  | Endpoint                          | Description                                                            | Permission Required |
| :------ | :-------------------------------- | :--------------------------------------------------------------------- | :------------------ |
| `GET`   | `/api/v1/agreements`              | List agreements with filters (`status`, `isArchived`, `tag`, `search`) | `documents:read`    |
| `POST`  | `/api/v1/agreements/upload`       | Upload PDF/DOCX agreement                                              | `documents:write`   |
| `POST`  | `/api/v1/agreements/scratch`      | Create agreement from scratch Markdown                                 | `documents:write`   |
| `GET`   | `/api/v1/agreements/:id`          | Get agreement details                                                  | `documents:read`    |
| `PUT`   | `/api/v1/agreements/:id/draft`    | Update draft content or title                                          | `documents:write`   |
| `POST`  | `/api/v1/agreements/:id/activate` | Activate draft agreement                                               | `documents:write`   |
| `POST`  | `/api/v1/agreements/:id/clone`    | Clone agreement into a new draft                                       | `documents:write`   |
| `POST`  | `/api/v1/agreements/:id/archive`  | Archive / unarchive agreement                                          | `documents:write`   |
| `GET`   | `/api/v1/agreements/:id/file`     | Stream document binary / text                                          | `documents:read`    |
| `GET`   | `/api/v1/agreements/:id/history`  | Retrieve concise change history                                        | `documents:read`    |
| `PATCH` | `/api/v1/agreements/:id/tags`     | Update metadata tags                                                   | `documents:write`   |
| `GET`   | `/api/v1/search/agreements`       | Faceted search across agreements                                       | `documents:read`    |
| `GET`   | `/api/v1/search/presets`          | List saved search filter presets                                       | `documents:read`    |
| `POST`  | `/api/v1/search/presets`          | Create custom filter preset                                            | `documents:write`   |

