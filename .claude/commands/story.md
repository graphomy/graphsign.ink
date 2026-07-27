# /story Command

Implement a Jira story end-to-end.

## Usage

```
/story <JIRA-ID>
```

## Steps

1. Fetch the Jira story details (summary, description, acceptance criteria)
2. Read mandatory docs: `docs/product.md`, `docs/architecture.md`, `docs/anti-goals.md`
3. Verify the story is within V1 scope
4. Decompose into implementation tasks
5. Create a feature branch: `feature/<JIRA-ID>-<short-description>`
6. Implement each task, following the agent roster:
   - Schema changes → `db-engineer`
   - API endpoints → `api-engineer`
   - Frontend → `frontend-engineer`
   - Auth → `auth-engineer`
   - Signing → `signing-engineer`
7. Write tests for all new functionality
8. Run lint, type-check, and tests
9. Request security review
10. Summarize changes for PR description

## Input

`$ARGUMENTS` — the Jira issue ID (e.g., `INK-101`)

## Output

- Feature branch with implementation
- Tests passing
- PR-ready summary with: changes, files modified, testing performed, security impact
