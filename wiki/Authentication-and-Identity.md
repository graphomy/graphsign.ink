# Authentication & Identity Management (FR-001)

The **Authentication & Identity Management** module provides secure user registration, email verification, session handling, password recovery, and Multi-Factor Authentication (MFA).

---

## 🔐 Core Features

### 1. User Registration & Email Verification
- New users register with an email, strong password, and full name.
- Upon registration, a 256-bit cryptographic verification token is generated.
- Users verify their email address before accessing privileged organization capabilities.

### 2. Secure Authentication & Session Tokens
- **JSON Web Tokens (JWT)**: HMAC-SHA256 signed access and refresh tokens.
- Automatic token rotation with configurable session timeouts (default 24 hours).
- **Session Guards**:
  - `SessionGuard`: Enforces active session before rendering protected routes (`/agreements`, `/templates`, `/settings/*`, `/dashboard`).
  - `GuestGuard`: Redirects authenticated users away from public auth pages (`/login`, `/register`).
  - `RoleGuard`: Protects admin and owner screens.

### 3. Password Reset Flow
- Secure forgot-password request sends a one-time reset link with an expiring token.
- Password change invalidates existing sessions and creates an audit event.

### 4. Multi-Factor Authentication (MFA)
- **Time-Based One-Time Password (TOTP)**: Fully compliant with RFC 6238.
- Authenticator app setup (Google Authenticator, Microsoft Authenticator, 1Password, Authy).
- QR code generation and secret key provisioning.
- Organization-level MFA enforcement capability for sensitive sender and admin roles.

---

## 🔌 API Endpoints for Authentication

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/register` | Register new user account | No |
| `POST` | `/api/v1/auth/verify-email` | Verify email address using token | No |
| `POST` | `/api/v1/auth/login` | Sign in with email and password | No |
| `POST` | `/api/v1/auth/logout` | Sign out and revoke session | Yes |
| `POST` | `/api/v1/auth/forgot-password` | Request password reset email | No |
| `POST` | `/api/v1/auth/reset-password` | Reset password using token | No |
| `POST` | `/api/v1/auth/mfa/setup` | Generate TOTP secret and QR code | Yes |
| `POST` | `/api/v1/auth/mfa/verify` | Verify TOTP token and enable MFA | Yes |
| `POST` | `/api/v1/auth/mfa/disable` | Disable MFA (requires password confirmation) | Yes |

---

## 💡 Example: User Login Request

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "user-123",
      "email": "user@example.com",
      "name": "Jane Doe",
      "role": "sender",
      "organisationId": "org-123",
      "mfaEnabled": false
    }
  }
}
```
