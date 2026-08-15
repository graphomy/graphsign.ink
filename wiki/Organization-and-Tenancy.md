# Organization & Multi-Tenancy Management (FR-002 & FR-003)

The **Organization & Multi-Tenancy** module provides workspace containerization, team hierarchies, custom domain verification, storage quotas, and fine-grained Role-Based Access Control (RBAC).

---

## 🏢 Multi-Tenant Isolation

### 1. Tenant Boundaries
- Every agreement, document, template, user, and audit record belongs to exactly one organization (`organisationId`).
- Multi-tenancy isolation is enforced at the database query layer and via API authentication middleware (`enforceTenantActiveStatus()`).
- Data access across tenant boundaries is strictly forbidden.

### 2. Organization Management
- **Creation & Onboarding**: Automatically provisioned upon user onboarding with customizable organization name and unique URL slug.
- **Soft Deletion & Recovery**: Organizations can be deactivated or soft-deleted with data retention policies.
- **Storage Quota Management**: Enforces storage size limits per organization edition with usage tracking in bytes.

### 3. Team Management & Hierarchies
- Organizations can create functional teams (e.g. *Legal*, *Sales*, *HR*, *Procurement*).
- Members can be assigned to teams for scoped document collaboration and template sharing.

### 4. Custom Domains & DNS Verification
- Organizations can configure custom white-label domains for sending signing invitations.
- Generates TXT and CNAME DNS verification records with automated status checks.

---

## 🛡️ Role-Based Access Control (RBAC)

graphsign.ink implements a permission-driven RBAC model:

| Role | Permissions | Scope |
| :--- | :--- | :--- |
| **owner** | All capabilities including billing, deletion, and owner transfers | Full organization |
| **admin** | User invites, team management, domain settings, compliance policies | Full organization |
| **sender** | Create agreements, place fields, submit for review, send envelopes | Own + Team resources |
| **viewer** | Read-only access to assigned agreements and completed documents | Assigned resources |

### Permission Keys
- `documents:read`, `documents:write`, `documents:delete`
- `templates:read`, `templates:manage`
- `users:invite`, `users:manage`
- `org:settings`, `org:manage`
- `audit:read`

---

## 🔌 API Endpoints for Organizations & Teams

| Method | Endpoint | Description | Permission Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/organisations` | Create new organization | Authenticated |
| `GET` | `/api/v1/organisations/me` | Fetch active organization details & usage | `org:settings` |
| `PATCH` | `/api/v1/organisations/me` | Update organization settings & branding | `org:manage` |
| `DELETE` | `/api/v1/organisations/me` | Soft-delete organization | `org:manage` (Owner only) |
| `POST` | `/api/v1/organisations/teams` | Create new team | `org:manage` |
| `GET` | `/api/v1/organisations/teams` | List organization teams | `org:settings` |
| `POST` | `/api/v1/organisations/domains` | Register custom domain | `org:manage` |
| `GET` | `/api/v1/organisations/domains` | List custom domains & DNS status | `org:settings` |
| `GET` | `/api/v1/roles` | List available roles and permissions | Authenticated |
