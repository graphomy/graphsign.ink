# Implementation Plan: Organisation & Teams Management Architecture

**Jira Parent Epic:** [INK-249 — Adhoc Tasks Implemented in GraphSign](https://graphomy.atlassian.net/browse/INK-249)  
**Target Branch:** `feature/INK-249-organisation-teams-management` (branched from `develop`)  
**Scope:** Architecture, database schema, concurrency controls, domain verification, RBAC permissions, settings lockdown, minimum admin safeguards, account soft deletion, and UI/UX flows.

---

## 1. Architecture Overview & Core Tenets

### 1.1 Core Principles
1. **Domain Authority vs Mailbox Access**: Email verification confirms control over an individual inbox. It does NOT grant authority over an entire company domain. Domain-wide auto-membership requires cryptographic or DNS TXT ownership proof.
2. **Atomic State & Zero Race Conditions**: Organisation creation, first admin assignment, member role changes, and account deletion must execute within transactional boundaries with row locks (`SELECT ... FOR UPDATE`) to prevent duplicate organisations, orphaned workspaces, or zero-admin states.
3. **Strict Multi-Tenant Isolation**: Personal user assets (agreements, templates, signing certificates) belong to the individual's personal workspace. Joining a company Teams organisation MUST NOT expose or transfer existing personal data.
4. **Administrative Protection Invariant**: Any active organisation with active members MUST have at least one active, non-suspended administrator. No single user operation or concurrent race may violate this invariant.
5. **Cryptographic Sealing Immutability**: Organisation-wide branding changes apply strictly forward to new workflows and transactional notifications. Completed signed PDFs and cryptographic seals (PAdES B-LTA) are permanent and immutable.
6. **Operational Soft Deletion vs Compliance Retention**: Account deletion immediately invalidates sessions and credentials, soft-deletes user state, reassigns in-flight work, and preserves evidentiary records under lawful retention schedules.

---

## 2. Database Schema & Migration Specifications

### 2.1 Prisma Schema Modifications (`packages/db/prisma/schema.prisma`)

```prisma
// 1. Updated Organisation Model
model Organisation {
  id                         String    @id @db.Uuid
  name                       String    @db.VarChar(255)
  slug                       String    @unique @db.VarChar(100)
  tenantId                   String    @unique @default(uuid()) @map("tenant_id") @db.Uuid
  planType                   String    @default("individual") @map("plan_type") @db.VarChar(20) // 'individual' | 'teams' | 'enterprise'
  status                     String    @default("active") @db.VarChar(20) // 'active' | 'suspended' | 'inactive' | 'pending_closure'
  verifiedDomain             String?   @unique @map("verified_domain") @db.VarChar(255) // Locked once verified
  domainOnboardingPolicy     String    @default("admin_approval") @map("domain_onboarding_policy") @db.VarChar(30) // 'admin_approval' | 'automatic' | 'disabled'
  sessionTimeoutMinutes      Int       @default(15) @map("session_timeout_minutes")
  mfaRequired                Boolean   @default(false) @map("mfa_required")
  mfaRequiredRoles           Json?     @map("mfa_required_roles") @db.JsonB

  // Branding Customisations
  logoUrl                    String?   @map("logo_url") @db.VarChar(512)
  primaryColor               String?   @default("#ba0000") @map("primary_color") @db.VarChar(7)
  secondaryColor             String?   @default("#1e293b") @map("secondary_color") @db.VarChar(7)
  companyAddress             String?   @map("company_address") @db.VarChar(512)
  defaultSenderName          String?   @map("default_sender_name") @db.VarChar(255)
  emailFooterText            String?   @map("email_footer_text") @db.VarChar(1000)

  // Storage Quotas & Limits
  storageQuotaBytes          BigInt    @default(5368709120) @map("storage_quota_bytes")
  storageUsedBytes           BigInt    @default(0) @map("storage_used_bytes")
  maxDocuments               Int       @default(1000) @map("max_documents")
  documentCount              Int       @default(0) @map("document_count")
  maxUsers                   Int       @default(50) @map("max_users")

  // Compliance Settings
  allowedEsignStandards      Json?     @map("allowed_esign_standards") @db.JsonB
  requireReauthBeforeSigning Boolean   @default(false) @map("require_reauth_before_signing")
  signatureReasonRequired    Boolean   @default(false) @map("signature_reason_required")
  documentRetentionDays      Int       @default(30) @map("document_retention_days")
  notificationSettings       Json?     @map("notification_settings") @db.JsonB

  createdAt                  DateTime  @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt                  DateTime  @updatedAt @map("updated_at") @db.Timestamptz()
  deletedAt                  DateTime? @map("deleted_at") @db.Timestamptz()

  users                      User[]
  memberships                UserOrganisation[]
  invitations                OrganisationInvitation[]
  joinRequests               OrganisationJoinRequest[]
  teams                      Team[]
  customRoles                CustomRole[]
  domains                    OrganisationDomain[]
  agreements                 Agreement[]
  templates                  Template[]
  auditLogs                  AuditLog[]

  @@index([slug])
  @@index([status])
  @@index([tenantId])
  @@index([verifiedDomain])
  @@map("organisations")
}

// 2. Updated OrganisationDomain Model
model OrganisationDomain {
  id                String    @id @db.Uuid
  organisationId    String    @map("organisation_id") @db.Uuid
  domain            String    @unique @db.VarChar(255) // Fully qualified domain e.g. acme.com
  verificationToken String    @map("verification_token") @db.VarChar(255) // graphsign-verify=<token>
  status            String    @default("pending") @db.VarChar(20) // 'pending' | 'verified'
  isImmutable       Boolean   @default(false) @map("is_immutable") // True once verified; prevents edit/delete
  verifiedAt        DateTime? @map("verified_at") @db.Timestamptz()
  dnsCheckedAt      DateTime? @map("dns_checked_at") @db.Timestamptz()
  createdAt         DateTime  @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt         DateTime  @updatedAt @map("updated_at") @db.Timestamptz()

  organisation Organisation @relation(fields: [organisationId], references: [id], onDelete: Cascade)

  @@index([organisationId])
  @@index([domain, status])
  @@map("organisation_domains")
}

// 3. UserOrganisation Junction Model (Multi-Org Membership & Status)
model UserOrganisation {
  id             String    @id @db.Uuid
  userId         String    @map("user_id") @db.Uuid
  organisationId String    @map("organisation_id") @db.Uuid
  role           String    @default("member") @db.VarChar(50) // 'org_admin' | 'member' | custom role
  status         String    @default("active") @db.VarChar(20) // 'active' | 'suspended' | 'pending_approval'
  isDefault      Boolean   @default(false) @map("is_default")
  joinedVia      String    @default("invitation") @map("joined_via") @db.VarChar(30) // 'initial_creator' | 'domain_auto' | 'domain_approved' | 'invitation'
  invitedById    String?   @map("invited_by_id") @db.Uuid
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt      DateTime  @updatedAt @map("updated_at") @db.Timestamptz()

  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  organisation Organisation @relation(fields: [organisationId], references: [id], onDelete: Cascade)

  @@unique([userId, organisationId])
  @@index([userId])
  @@index([organisationId, role, status])
  @@map("user_organisations")
}

// 4. OrganisationJoinRequest Model (for admin_approval policy)
model OrganisationJoinRequest {
  id             String    @id @db.Uuid
  organisationId String    @map("organisation_id") @db.Uuid
  userId         String    @map("user_id") @db.Uuid
  email          String    @db.VarChar(255)
  status         String    @default("pending") @db.VarChar(20) // 'pending' | 'approved' | 'rejected'
  reviewedById   String?   @map("reviewed_by_id") @db.Uuid
  reviewedAt     DateTime? @map("reviewed_at") @db.Timestamptz()
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt      DateTime  @updatedAt @map("updated_at") @db.Timestamptz()

  organisation Organisation @relation(fields: [organisationId], references: [id], onDelete: Cascade)
  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  reviewedBy   User?        @relation("JoinRequestReviewer", fields: [reviewedById], references: [id])

  @@unique([organisationId, userId, status])
  @@index([organisationId, status])
  @@map("organisation_join_requests")
}
```

---

## 3. Detailed Specifications per Section

### 3.1 Section 1: Organisation Creation & First Administrator

#### Requirements Breakdown
1. **Email Verification Prerequisite**: User cannot enable Teams or create an organisation until `User.emailVerified === true`. If unverified, API returns `403 FORBIDDEN` with code `EMAIL_NOT_VERIFIED`.
2. **First Eligible User Becomes Admin**: If no organisation exists for that company domain, the first eligible verified user who triggers Teams enablement creates the organisation and receives the `org_admin` role.
3. **Proof of Domain Ownership**: Email verification does NOT grant domain auto-join authority. Automatic domain-based membership is disabled by default until proof of domain ownership (DNS TXT record: `graphsign-verify=<token>`) is validated. Once verified, `isImmutable = true` and the domain cannot be edited or modified.
4. **Atomic Concurrency Guarantee**: Simultaneous requests from multiple users with `@company.com` must not create duplicate organisations or race for initial admin. Enforce via:
   - PostgreSQL Unique Constraint on `verifiedDomain` in `organisations` table.
   - Transactional Advisory Lock on `hashtext(domain)` during creation/upgrade flow (`pg_advisory_xact_lock(hashtext(:domain))`).
5. **Disposable & Public Provider Blocklist**: Personal email providers (gmail.com, yahoo.com, hotmail.com, outlook.com, icloud.com, proton.me, etc.) and disposable email domains (mailinator.com, tempmail.com, etc.) are strictly prohibited from enabling domain-based Teams onboarding or registering company domains.

#### Implementation Logic
```typescript
// apps/api/src/utils/domain-validator.ts
const BLOCKED_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'hotmail.com',
  'outlook.com', 'live.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me',
  'protonmail.com', 'zoho.com', 'mail.com', 'gmx.com', 'yandex.com'
]);

export function isPersonalOrDisposableDomain(domain: string): boolean {
  const normalized = domain.toLowerCase().trim();
  if (BLOCKED_DOMAINS.has(normalized)) return true;
  // Also check against dynamic disposable email list / regex
  return isDisposableDomain(normalized);
}
```

#### Atomic Creation Sequence
```sql
-- Transaction with PostgreSQL advisory lock
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('acme.com'));

-- Check if organisation exists with this domain or verified domain
SELECT id FROM organisations WHERE verified_domain = 'acme.com' OR domain = 'acme.com' LIMIT 1;
-- If exists: abort org creation, direct user to join existing organisation.
-- If not exists: create organisation, assign user as org_admin, commit.
COMMIT;
```

---

### 3.2 Section 2: Joining an Existing Organisation

#### Requirements Breakdown
1. **Verified Domain Match Post Email Verification**: When a user verifies their email (e.g., `user@acme.com`), the system checks for an existing organisation with `verifiedDomain === 'acme.com'`.
2. **Onboarding Policies**:
   - `admin_approval` (Default, Safe): User is enrolled in `pending_approval` state. An `OrganisationJoinRequest` record is generated. Workspace admins receive notification and can approve or reject in `/settings/organisation?tab=members`.
   - `automatic`: User immediately joins with `member` role upon email verification.
   - `disabled`: No automatic joining via domain. Membership is strictly invite-only.
3. **Role Guarantee**: New members joining via domain match or invitation always receive the `member` role. They NEVER receive `admin` or `org_admin` automatically.
4. **Teams Entitlement Ownership**: The Teams entitlement belongs to the organisation. Members inherit features (templates, shared branding, team collaboration) from the organisation tenant without requiring individual paid seat subscriptions.
5. **Member Permissions**: Active members can create, edit, send, and sign agreements according to assigned permissions in `DEFAULT_ROLES` (`sender` / `member` capabilities).

---

### 3.3 Section 3: Existing Accounts & Invitations

#### Requirements Breakdown
1. **Existing Individual User Prompt**: If an existing user with an individual workspace has email `@acme.com` and Acme Corp verifies its domain:
   - On login or dashboard visit, a non-intrusive modal/banner displays: *"Acme Corp has a company workspace on GraphSign. Would you like to request to join?"*
2. **Strict Data & Asset Isolation**:
   - Joining a company organisation MUST NOT expose or transfer existing personal agreements, personal templates, drafts, or private signing keys.
   - Multi-tenant model: User maintains their personal `Organisation` (`tenantId`), and gains an active membership in the company `Organisation` via `UserOrganisation`.
   - Active workspace switching endpoint (`POST /api/v1/organisations/switch`) toggles session context.
3. **Invitation Constraints**:
   - Single-use, expiring (default 7 days), revocable by admin at any time.
   - Bound strictly to the invited email address. Token verification checks `invitation.email === currentUser.email`.
   - If an existing user accepts an invitation, the existing account joins the organisation; duplicate user records are never created.
4. **External-Domain Members**:
   - Users from external domains (e.g. contractor `@external.com`) MAY join an organisation ONLY through direct invitation.
   - External users CANNOT enable domain-based onboarding for their external domain or automatically admit other members.

---

### 3.4 Section 4: Roles & Administrator Management

#### Explicit Permission Matrix
| Permission / Capability | `super_admin` | `org_admin` | `member` |
| :--- | :---: | :---: | :---: |
| Invite / Remove Members | Yes | Yes | No |
| Suspend / Unsuspend Members | Yes | Yes | No |
| Promote to Admin / Demote | Yes | Yes | No |
| View / Edit Org Settings & Branding | Yes | Yes | Read-Only |
| View / Verify Custom Domains | Yes | Yes | Read-Only |
| View Org Audit Logs | Yes | Yes | No |
| Manage Teams & Custom Roles | Yes | Yes | No |
| Create, Edit, Send Agreements | Yes | Yes | Yes |
| Sign Assigned Agreements | Yes | Yes | Yes |
| Create & Use Templates | Yes | Yes | Yes |
| Override Admin Assignment | Yes (Global) | No | No |

#### Administrator Safeguards
1. **Step-Up Authentication for Admin Promotion**:
   - Promoting any user to `org_admin` requires recent re-authentication (password verification or session `auth_time` < 15 minutes).
   - Requires explicit confirmation modal acknowledging elevated workspace privileges.
2. **Self-Demotion & Self-Removal Protection**:
   - An administrator cannot demote themselves or remove themselves from the organisation unless at least one other active, non-suspended `org_admin` remains.
   - Suspended admins (`status === 'suspended'`) DO NOT count toward the minimum admin threshold.
3. **Audit Trail Invariant**:
   - All role and membership modifications log append-only hash-chained events:
     * `USER_PROMOTED_TO_ADMIN`
     * `USER_DEMOTED_FROM_ADMIN`
     * `USER_SUSPENDED`
     * `USER_UNSUSPENDED`
     * `USER_REMOVED_FROM_ORGANISATION`
     * `ADMIN_ASSIGNED_BY_SUPERADMIN`
4. **Super Admin Break-Glass Recovery**:
   - Platform `super_admin` (`kunal@graphomy.com` or `SUPERADMIN_ID`) can assign an admin to any organisation via `/api/v1/admin/organisations/:id/assign-admin` in emergency/abandoned workspace scenarios.

---

### 3.5 Section 5: Organisation Settings Enforcement & UI Lockdown

#### Requirements Breakdown
1. **API & UI RBAC Enforcement**:
   - Only `org_admin` and `super_admin` can execute `PATCH /api/v1/organisations/:id`, `PUT /branding`, `POST /domains`, `POST /teams`, etc.
   - Enforce via Hono middleware: `requireRole(['org_admin', 'super_admin'])`.
2. **Read-Only Member View**:
   - In `/settings/organisation`, members can view General, Branding, and Compliance tabs in a read-only state.
   - Action buttons ("Save Changes", "Upload Logo", "Add Domain", "Invite Member") are disabled or replaced with informational tooltips.
3. **Restricted Change Error Message**:
   - When a member attempts a restricted action via API or UI, the system displays:
     > **"Only an organisation admin can change this setting. Please contact your workspace administrator."**
4. **Contact Admin Directory**:
   - UI provides a "Contact Administrator" modal accessible to members showing:
     * Admin Name and Avatar
     * Work Email address (clickable `mailto:`)
     * Quick copy email button

---

### 3.6 Section 6: Organisation-Wide Configuration & Brand Immutability

#### Requirements Breakdown
1. **Single Source of Truth**:
   - Organisation branding (logo, colors, company address, sender name, footer) is stored on `Organisation` and shared across all members.
   - Outbound transactional emails, signing invites, and agreement headers automatically inherit organisation branding.
2. **Personal Preference Separation**:
   - Personal user settings (timezone, language, personal notification delivery toggles) reside strictly in `User` profile settings (`/settings/profile`) and never bleed into organisation configuration.
3. **Brand Immutability on Signed PDFs (Compliance Invariant)**:
   - Updating organisation branding (logo or primary color) MUST NEVER mutate existing or completed signed PDF documents.
   - Under eIDAS and ESIGN standards, completed PDFs are sealed with cryptographic timestamps (PAdES B-LTA). Visual assets stamped onto the PDF canvas are static byte-range data.
4. **Signing Workflow Policy**:
   - Policy changes (e.g. requiring MFA for signing, re-auth before signing, retention periods) apply to **newly created agreement drafts**.
   - Envelopes already sent for signing retain the compliance snapshot recorded at the time of sending to preserve legal validity of the in-flight signing transaction.

---

### 3.7 Section 7: Minimum Administrator Protection & Account Deletion

#### Transactional Enforcement
Every active organisation with active members MUST have at least one active administrator.
Enforce via atomic transaction and row lock:

```typescript
// Inside Prisma Interactive Transaction
await tx.$executeRaw`
  SELECT id FROM users
  WHERE organisation_id = ${orgId}
    AND role IN ('org_admin', 'admin')
    AND status = 'active'
    AND deleted_at IS NULL
  FOR UPDATE
`;

const activeAdminCount = await tx.user.count({
  where: {
    organisationId: orgId,
    role: { in: ['org_admin', 'admin'] },
    status: 'active',
    deletedAt: null,
  },
});

const totalActiveMembers = await tx.user.count({
  where: {
    organisationId: orgId,
    status: 'active',
    deletedAt: null,
  },
});

if (isTargetUserLastAdmin) {
  if (totalActiveMembers > 1) {
    throw new BadRequestError(
      'Cannot delete account or demote. You are the only active administrator. Please promote another active member to administrator first.'
    );
  } else {
    // Target user is the sole remaining member: Allow account soft deletion
    // and transition organisation status to 'inactive' / 'pending_closure'
    await tx.organisation.update({
      where: { id: orgId },
      data: { status: 'pending_closure', deletedAt: new Date() },
    });
  }
}
```

This check applies universally to:
- Account deletion (`POST /api/v1/auth/delete-account`)
- Role demotion (`PATCH /api/v1/organisations/:id/members/:userId/role`)
- Member suspension (`PATCH /api/v1/organisations/:id/members/:userId/status`)
- Member removal (`DELETE /api/v1/organisations/:id/members/:userId`)
- Leaving organisation (`POST /api/v1/organisations/:id/leave`)

---

### 3.8 Section 8: Soft Deletion, Retained Records & Compliance Retention

#### Requirements Breakdown
1. **Immediate Revocation (Operational Soft Deletion)**:
   - When account deletion is confirmed:
     * Set `User.deletedAt = new Date()`, `User.status = 'deleted'`.
     * Revoke all active sessions: delete all `RefreshSession` records for user.
     * Revoke API tokens and active JWTs.
2. **Asset Handover & In-Flight Work**:
   - **Draft Envelopes / Unsent Agreements**: Handed over to remaining active organisation admin or marked `archived_on_creator_deletion`.
   - **In-Flight Envelopes (Pending Signatures)**: Preserved. External signers can still complete their signatures. Notifications route to backup admin.
   - **Templates**: Kept in organisation template library, ownership updated to workspace admin so organization templates remain accessible.
3. **Evidentiary & Audit Trail Preservation**:
   - Signed PDFs, audit trail history, signature evidence records, and certificates MUST NOT be deleted.
   - Under eIDAS, ESIGN, and 21 CFR Part 11, signature evidence must be retained for the organisation's defined retention window (e.g. 7 years or `documentRetentionDays`).
   - Audit logs maintain hash chain continuity. `AuditLog.userId` remains linked or anonymized with cryptographic provenance preserved.
4. **Lawful Erasure Lifecycle**:
   - Operational soft deletion (instantaneous) vs Scheduled purge / anonymisation pipeline (running via background job after legal retention window expires).

---

## 4. API Specification & Endpoints

| Method | Endpoint | Access / Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/organisations/enable-teams` | Verified User | Converts workspace to Teams or initiates new Teams org with atomic domain locking. |
| `POST` | `/api/v1/organisations/domains` | `org_admin` | Registers custom domain, returns DNS TXT verification token. Rejects public/disposable domains. |
| `POST` | `/api/v1/organisations/domains/:id/verify` | `org_admin` | Queries DNS TXT record. On success, marks domain verified and sets immutable lock. |
| `PATCH` | `/api/v1/organisations/me/onboarding-policy` | `org_admin` | Sets domain onboarding policy (`admin_approval` \| `automatic` \| `disabled`). |
| `GET` | `/api/v1/organisations/me/join-requests` | `org_admin` | Lists pending join requests for verified domain. |
| `POST` | `/api/v1/organisations/me/join-requests/:id/review` | `org_admin` | Approves or rejects a user join request. |
| `GET` | `/api/v1/organisations/me/admins` | Any Member | Returns list of active administrators (names, avatars, emails) for member contact. |
| `PATCH` | `/api/v1/organisations/me/members/:id/role` | `org_admin` (Re-auth) | Updates member role. Requires recent re-authentication when promoting to admin. |
| `DELETE` | `/api/v1/organisations/me/members/:id` | `org_admin` | Removes member with transactional minimum admin verification. |
| `POST` | `/api/v1/auth/delete-account` | Authenticated User | Soft deletes account with password verification and transactional minimum admin protection. |
| `POST` | `/api/v1/admin/organisations/:id/assign-admin` | `super_admin` | Emergency super admin assignment of organisation administrator. |

---

## 5. Frontend & UI/UX Architecture (`apps/web`)

### 5.1 Settings Navigation & Tab Layout (`/settings/organisation`)
- **Role Detection**: Query user role on load (`isAdmin = userRole === 'org_admin' || userRole === 'super_admin'`).
- **Read-Only Mode for Members**:
  - Render a top-level banner for members: *"You are viewing organisation settings in read-only mode."*
  - Add "Need to make changes? [Contact Workspace Administrator]" trigger button opening `ContactAdminModal`.
  - Disable input fields, selects, and action buttons for non-admins.
- **Admin Promotion Modal with Re-Authentication**:
  - Modal prompts: *"Promoting to Administrator requires password confirmation."*
  - Calls step-up verification endpoint before granting admin rights.
- **Domain Verification Card**:
  - Displays DNS TXT record requirements (`Host: @`, `Type: TXT`, `Value: graphsign-verify=<token>`).
  - Once verified, displays green badge **"Verified & Locked"** with text: *"Domain verified. Domain name cannot be modified."*
- **Members Tab Additions**:
  - Tab badge showing pending join requests count.
  - Sub-section for "Pending Join Requests" with "Approve" and "Reject" buttons.
  - Delete/Demote confirmation guards checking remaining active admins.

---

## 6. Implementation Sequence & Jira Story Breakdown

All work will be tracked under parent epic **INK-249**.

### Phase 1: Database Schema & Concurrency Locks (Task INK-310)
- Add schema fields to `Organisation`, `OrganisationDomain`, `UserOrganisation`, `OrganisationJoinRequest`.
- Implement `isPersonalOrDisposableDomain` utility and blocklist.
- Create migration script with database indexes.
- Unit tests for domain validator and schema models.

### Phase 2: Domain Verification & Onboarding Engine (Task INK-311)
- Implement DNS TXT lookup service via Node `dns/promises`.
- Build atomic domain registration with `isImmutable` protection.
- Implement domain matching logic post email verification (`verifyEmail`).
- Implement `OrganisationJoinRequest` approval and auto-join flows.
- Integration tests for domain verification and onboarding policies.

### Phase 3: Roles, Step-up Auth & Admin Protection Safeguards (Task INK-312)
- Implement step-up password re-auth requirement for admin promotion.
- Transactional minimum admin check (`SELECT ... FOR UPDATE`) in `updateMemberRole`, `removeMember`, `updateMemberStatus`.
- Implement `super_admin` override endpoint.
- Unit and integration tests for concurrent demotion/deletion race prevention.

### Phase 4: Organisation Settings Lockdown & Member Read-Only UI (Task INK-313)
- Enforce API middleware permissions across all organisation modification routes.
- Update `apps/web/src/app/(auth)/settings/organisation/page.tsx` for member read-only display.
- Build `ContactAdminModal` component displaying active admins with direct contact links.
- Render custom warning banner when restricted action attempted.

### Phase 5: Soft Deletion, Asset Handover & Token Revocation (Task INK-314)
- Refactor `POST /api/v1/auth/delete-account` from destructive hard delete to compliance soft delete.
- Implement immediate session and refresh token revocation.
- Implement draft and template asset handover to remaining admin.
- Retain agreement evidence and maintain audit log hash-chain integrity.
- Verification tests for GDPR/eIDAS compliance lifecycle.

### Phase 6: E2E Verification & Audit Log Validation (Task INK-315)
- Full Playwright E2E test suite covering:
  1. Teams enablement & first admin creation.
  2. Domain verification and auto-join / approval flows.
  3. Attempting to delete last admin (blocked vs sole member org closure).
  4. Member read-only view and contact admin modal.
  5. Account soft deletion and token invalidation.
- Audit log hash chain verification.

---

## 7. Quality Gates & Acceptance Verification
Before raising PR targeting `develop`:
- `pnpm db:generate` passes.
- `pnpm typecheck` passes with 0 TypeScript errors.
- `pnpm lint` and `pnpm format:check` pass.
- `pnpm test` passes across `apps/api` and `apps/web` with >85% test coverage.
- PR title formatted: `INK-249: Organisation & Teams Management Architecture`.
- Screenshots of UI states attached to PR.
