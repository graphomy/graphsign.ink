# /security-review Command

Run a security review on staged or recent changes.

## Usage

```
/security-review
```

## Steps

1. Identify changed files (`git diff --name-only` against develop)
2. Read `docs/security.md` for the full security checklist
3. Check each changed file against:

### Authentication & Authorization

- All endpoints require auth (except public/signer routes)
- RBAC checks on every protected route
- Tenant context validated

### Input Validation

- User input validated with Zod
- File uploads validated (MIME, extension, size)
- No SQL injection or XSS vectors

### Secrets

- No secrets, API keys, or credentials in code
- No sensitive data in logs
- Private keys only via KMS/HSM

### Data Protection

- RLS enabled on new tables
- Sensitive fields encrypted
- Signed URLs for storage access

### Audit

- Business actions create audit events
- Audit records append-only

### Dependencies

- No new vulnerable dependencies

4. Output a security report with findings categorized as:
   - 🔴 **Critical** — must fix before merge
   - 🟡 **Warning** — should fix
   - 🟢 **Pass** — no issues found

## Output

Security review report with pass/fail for each category.
