# /seal-test Command

Run signing service integration tests.

## Usage

```
/seal-test
```

## Steps

1. Read `docs/security.md` for document integrity requirements
2. Verify the signing service is running (Docker container or local JVM)
3. Run integration tests that verify:

### Seal Flow

- [ ] PDF is flattened with field values
- [ ] Document hash is computed correctly
- [ ] Signature is applied via CSC signHash
- [ ] Certificate chain is embedded
- [ ] RFC 3161 timestamp is obtained and embedded
- [ ] Revocation data (CRL/OCSP) is embedded for LTV
- [ ] Final PDF is valid PAdES B-LTA

### Verification

- [ ] Sealed PDF opens in Adobe Reader without errors
- [ ] Signature validity shows correct signer
- [ ] Timestamp is present and valid
- [ ] Document modification after seal is detectable

### Error Handling

- [ ] Missing certificate returns meaningful error
- [ ] TSA timeout is handled with retry
- [ ] Invalid PDF input is rejected gracefully
- [ ] KMS/HSM connectivity failure is handled

## Output

- Test results for each seal flow step
- PAdES level verification
- Any failures with detailed error information
