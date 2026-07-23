# API Standards

Architecture

REST

---

## Versioning

/api/v1/

---

## Resource Names

Plural

/documents

/templates

/users

---

## HTTP

GET

POST

PUT

PATCH

DELETE

Follow REST conventions.

---

## Status Codes

200

201

204

400

401

403

404

409

422

500

---

## Errors

Consistent JSON.

Example

{
  "code": "DOCUMENT_NOT_FOUND",
  "message": "...",
  "traceId": "..."
}

---

## Pagination

cursor based

---

## Filtering

?status=

?createdAfter=

---

## Sorting

sort=

order=

---

## OpenAPI

Every endpoint documented.

---

## AI Rules

Never create undocumented endpoints.