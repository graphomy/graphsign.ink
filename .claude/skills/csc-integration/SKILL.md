# CSC Integration Skill

Implement the Cloud Signature Consortium (CSC) remote signing protocol.

## Context

See `docs/architecture.md` § Signing Subsystem and `docs/tech-stack.md` § 5.5 for CSC details.

## What is CSC?

CSC defines a common REST API for cloud/remote digital signatures. The signing service speaks CSC internally so self-operated AES keys and external QTSP QES keys sit behind the same interface.

## CSC API Endpoints (Internal)

### `POST /csc/credentials/list`
List available signing credentials for an organisation.

```json
{
  "credentialIDs": ["cert-uuid-1", "cert-uuid-2"],
  "authMode": "explicit"
}
```

### `POST /csc/credentials/info`
Get details about a specific credential (certificate, key algorithm, status).

### `POST /csc/signatures/signHash`
Sign a document hash using a credential.

```json
{
  "credentialID": "cert-uuid-1",
  "SAD": "server-authorisation-data",
  "hash": ["base64-encoded-sha256-hash"],
  "hashAlgo": "2.16.840.1.101.3.4.2.1",
  "signAlgo": "1.2.840.113549.1.1.11"
}
```

Response:
```json
{
  "signatures": ["base64-encoded-signature-value"]
}
```

## Integration Phases

| Phase | Integration |
|---|---|
| V1 | CSC-shaped interface, self-signed/BYO keys via KMS |
| V2 | Managed cloud-HSM keys via CSC |
| V3 | QTSP endpoint for eIDAS QES |

## Key Design Principle

Because the interface is CSC-shaped from day one, swapping a self-operated key (AES) for a QTSP credential (QES) is a configuration change, not a rewrite.

## Libraries

- EU DSS provides a CSC client implementation
- CSC API specification v2 is the reference
