# Glossary

> Source of truth: [Confluence — System Architecture Appendix B](https://graphomy.atlassian.net/wiki/spaces/INK/pages/1081396)

| Term | Meaning |
|---|---|
| **Envelope** | Signing container — documents + fields + recipients + workflow state |
| **Magic link** | Secure, expiring, single-use signing URL (no account required) |
| **PAdES** | PDF Advanced Electronic Signatures (ETSI EN 319 142) |
| **B-LTA** | PAdES baseline level: Long-Term with Archive timestamps — highest self-verifiable level |
| **CSC** | Cloud Signature Consortium — REST API standard for cloud/remote digital signing |
| **RLS** | Row-Level Security — Postgres tenant isolation mechanism |
| **RFC 3161** | Trusted timestamp protocol |
| **SES** | eIDAS Simple Electronic Signature |
| **AES** | eIDAS Advanced Electronic Signature |
| **QES** | eIDAS Qualified Electronic Signature |
| **BYO** | Bring Your Own (certificate) |
| **BYOM** | Bring Your Own Model (AI/LLM) |
| **KMS** | Key Management Service |
| **HSM** | Hardware Security Module |
| **PKCS#11** | Crypto token API standard for HSM access |
| **QTSP** | Qualified Trust Service Provider (issues QES certificates) |
| **AATL** | Adobe Approved Trust List |
| **DSC** | Document Signing Certificate |
| **LTV** | Long-Term Validation — embedded revocation and timestamp data |
| **ESIGN** | US Electronic Signatures in Global and National Commerce Act |
| **UETA** | Uniform Electronic Transactions Act (US state-level) |
| **eIDAS** | EU regulation on electronic identification and trust services |
| **21 CFR Part 11** | FDA regulation for electronic records and signatures |
| **TOTP** | Time-based One-Time Password (MFA) |
| **OIDC** | OpenID Connect (authentication protocol) |
| **SAML** | Security Assertion Markup Language (SSO protocol) |
| **SCIM** | System for Cross-domain Identity Management (user provisioning) |
| **RBAC** | Role-Based Access Control |
| **WAF** | Web Application Firewall |
| **Tenant** | An organisation using the platform — isolated data and config |
| **Seal** | The act of cryptographically signing and timestamping a completed PDF |
| **Completion Certificate** | Summary document generated after all signatures are collected |
