# PDF signing service

This private Java 21 service creates embedded PDF CMS signatures using PDFBox and Bouncy Castle. It replaces the former comment-based seal. PDF signatures cover the final assembled document and its audit page. The API stores and downloads those exact bytes; it never regenerates completed agreements during download.

## Run and configure

Build with `mvn -B verify`, or build the Dockerfile in this directory. Expose port 8080 only behind an authenticated HTTPS endpoint. Configure:

- `SIGNING_SERVICE_TOKEN`: a randomly generated secret of at least 32 characters, shared with the API.
- `KEYSTORE_PASSWORD`: a secret of at least 16 characters, supplied through your secret manager.
- `KEYSTORE_DIR`: defaults to `/keys`. Mount a persistent, private volume writable by container UID 10001. Back up the encrypted PKCS12 stores and keep the password separately. Losing custody data prevents signing with existing profiles; the service refuses certificate mismatches.
- Optional `TSA_URL`, `TSA_ALLOWED_HOSTS` (comma-separated), and `TSA_CERT_SHA256` (certificate fingerprint): enable a real RFC 3161 timestamp from an allowlisted HTTPS service. A configured timestamp failure aborts sealing. Without a TSA, the PDF has a B-B signature and no trusted timestamp.

Set the API's `SIGNING_SERVICE_URL` and `SIGNING_SERVICE_TOKEN`. GitHub deployment uses the environment variable `SIGNING_SERVICE_URL` and secret `SIGNING_SERVICE_TOKEN`. Deploy this container and set its custody secrets before releasing the API. The repository does not automatically provision a hosting account or deploy this service.

The key store is encrypted software custody. Deployments requiring hardware-backed keys must replace it with a KMS/HSM integration before claiming that property.

## Recovery and compatibility

Recipient signatures remain saved when sealing fails. The agreement records `sealingStatus: FAILED`; verified downloads and completion notifications wait for a sealed artifact. An authorised user can retry from the viewer or `POST /api/v1/signing/seal/:agreementId`. Successful retries reuse the original artifact and token.

Historical comment-based seals remain labelled as legacy integrity records. Their stored bytes and certificates are preserved. They cannot acquire a historical PDF signature or timestamp retrospectively. New signing renews a legacy self-signed profile into a separate real X.509 profile. BYO profiles require a matching private key provisioned into custody.

An embedded digital signature is distinct from certificate identity trust. Adobe can recognise the CMS signature but may show an untrusted signer for a self-signed certificate. This service does not implement B-LT/B-LTA archival validation or assert Adobe trust-list membership. Validate the deployed PDF with Acrobat before production release.

## Validation

`mvn -B verify` independently verifies signatures, detects changes to covered bytes and appended content, preserves prior signatures when signing incrementally, and verifies raw CSC signatures against the provisioned certificate. The API's assembly step rejects already digitally signed source PDFs because rewriting them to add fields would invalidate the earlier signature.

Application checks are `pnpm db:generate`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, and `pnpm build`. Browser regression uses `pnpm --filter @graphsign/web test:e2e` after installing Playwright Chromium. Tests with mocked application persistence do not establish production database or email-delivery health; run staging smoke checks against the deployed services as well.
