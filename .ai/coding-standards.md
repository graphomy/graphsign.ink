# Graphsign Coding Standards

## Purpose

This document defines the coding standards for graphsign.ink.

All AI agents MUST follow these standards.

---

## General Principles

- Write production-quality code.
- Simplicity over cleverness.
- Readability over brevity.
- Prefer explicit code over magic.
- Never duplicate business logic.
- Never leave TODOs.
- Never leave commented code.
- Never commit debugging code.

---

## Language

- TypeScript only
- Strict mode enabled
- No JavaScript

---

## Code Style

- Use ESLint
- Use Prettier
- Maximum function length: 50 lines
- Maximum file length: 500 lines
- Maximum nesting: 3

---

## Naming

Classes
PascalCase

Interfaces
PascalCase

Functions
camelCase

Variables
camelCase

Constants
UPPER_CASE

Files
kebab-case.ts

Folders
kebab-case

---

## Comments

Only explain WHY.

Never explain WHAT.

Bad

// Increment counter

Good

// Required by ESIGN compliance to preserve audit order.

---

## Error Handling

Never swallow exceptions.

Always return meaningful errors.

Never expose internal implementation details.

---

## Logging

Never log

- passwords
- API keys
- certificates
- JWT tokens
- customer documents

---

## Dependencies

Prefer mature libraries.

Avoid unnecessary dependencies.

Never introduce a dependency without justification.

---

## Documentation

Every exported function requires JSDoc.

Every public API requires OpenAPI documentation.

---

## AI Rules

Before modifying code:

- Read existing implementation.
- Preserve coding style.
- Preserve architecture.
- Do not rewrite unrelated code.
- Keep pull requests focused.
