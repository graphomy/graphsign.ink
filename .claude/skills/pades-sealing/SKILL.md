# PAdES Sealing Skill

Implement PAdES B-LTA document sealing using EU DSS / PDFBox.

## Context

See `docs/architecture.md` § Signing Subsystem and `docs/security.md` § Document Integrity for full details.

## PAdES Levels

| Level     | Contents                     | Use Case                                |
| --------- | ---------------------------- | --------------------------------------- |
| B-B       | Basic signature              | Minimum                                 |
| B-T       | + RFC 3161 timestamp         | Proves signing time                     |
| B-LT      | + Revocation data (CRL/OCSP) | Long-term validation                    |
| **B-LTA** | + Archive timestamp          | **Target level** — survives cert expiry |

## Seal Flow

```
1. Receive PDF + field values + certificate profile + target level
2. Flatten placed fields into the PDF (PDFBox)
3. Prepare PAdES signature container (byte-range)
4. Compute SHA-256 hash of the document content
5. Send hash to KMS/HSM or QTSP via CSC signHash
6. Receive signature value
7. Attach signer certificate + chain to the signature
8. Request RFC 3161 timestamp from TSA
9. Embed timestamp token (B-T achieved)
10. Fetch and embed CRL/OCSP revocation data (B-LT achieved)
11. Apply archive timestamp (B-LTA achieved)
12. Output: sealed, self-verifiable PDF
```

## EU DSS Configuration

```java
// PAdES B-LTA signing with EU DSS
PAdESSignatureParameters parameters = new PAdESSignatureParameters();
parameters.setSignatureLevel(SignatureLevel.PAdES_BASELINE_B_LTA);
parameters.setDigestAlgorithm(DigestAlgorithm.SHA256);
parameters.setSigningCertificate(signingCert);
parameters.setCertificateChain(certChain);

// Timestamp source
OnlineTSPSource tspSource = new OnlineTSPSource("https://freetsa.org/tsr");
parameters.setContentTimestampParameters(tspSource);
```

## Timestamping

| Tier           | TSA                           | Cost          |
| -------------- | ----------------------------- | ------------- |
| Free (SES/AES) | FreeTSA.org, Open TSA         | Free          |
| Paid (QES)     | DigiCert, GlobalSign, Sectigo | Per-timestamp |

## Verification

A correctly sealed PDF must:

- Open in Adobe Reader without warnings (if AATL cert)
- Show valid signature with signer identity
- Show valid timestamp
- Detect any modification after sealing
- Verify offline (no need to contact graphsign.ink)

## Error Handling

- TSA timeout: retry with exponential backoff (max 3 attempts)
- KMS failure: return structured error, do not produce partial seal
- Invalid PDF: reject with descriptive error
- Missing certificate: fail fast with clear message
