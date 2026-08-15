# Template Management (FR-006)

The **Template Management** module enables organizations to build, approve, and reuse standardized contract templates with pre-configured fields and recipient roles.

---

## 📑 Core Capabilities

### 1. Template Authoring

- Create templates from scratch Markdown or pre-configured agreements.
- Define reusable placeholder fields (e.g., _Client Name_, _Pricing Terms_, _Start Date_).
- Tag templates with functional categories (e.g. _Sales_, _HR_, _Procurement_, _Legal_).

### 2. Publishing Governance

- **Draft Templates**: Internal templates under drafting.
- **Published Templates**: Requires organization admin approval to publish. Once published, all senders in the organization can instantiate new agreements from the template with a single click.

### 3. Template Cloning & Archiving

- Clone existing templates to produce new variants.
- Archive deprecated templates while preserving completed agreements created from previous versions.

---

## 🔌 API Endpoints for Templates

| Method   | Endpoint                        | Description                     | Permission Required        |
| :------- | :------------------------------ | :------------------------------ | :------------------------- |
| `GET`    | `/api/v1/templates`             | List organization templates     | `templates:read`           |
| `POST`   | `/api/v1/templates`             | Create new template             | `templates:manage`         |
| `GET`    | `/api/v1/templates/:id`         | Fetch template details & fields | `templates:read`           |
| `PUT`    | `/api/v1/templates/:id`         | Update template content         | `templates:manage`         |
| `DELETE` | `/api/v1/templates/:id`         | Archive template                | `templates:manage`         |
| `POST`   | `/api/v1/templates/:id/publish` | Publish template for org use    | `templates:manage` (Admin) |
| `POST`   | `/api/v1/templates/:id/clone`   | Clone template                  | `templates:manage`         |
