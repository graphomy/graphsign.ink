# /a11y-check Command

Run an accessibility audit against WCAG 2.2 AA standards.

## Usage

```
/a11y-check
```

## Steps

1. Read `docs/ui.md` for accessibility requirements
2. Identify pages/components to audit (focus on signer-facing pages)
3. Run automated accessibility checks:

   ```
   npx playwright test --grep @a11y
   ```

   Or use axe-core integration:

   ```
   npx @axe-core/cli <URL>
   ```

4. Check against WCAG 2.2 AA criteria:

### Perceivable

- [ ] All images have alt text
- [ ] Color contrast meets AA ratio (4.5:1 for text)
- [ ] Content is understandable without colour alone

### Operable

- [ ] All interactive elements keyboard accessible
- [ ] Focus order is logical
- [ ] Focus states are visible
- [ ] No keyboard traps

### Understandable

- [ ] Labels on all form controls
- [ ] Error messages are descriptive
- [ ] Language attribute set on HTML

### Robust

- [ ] Valid HTML
- [ ] ARIA attributes used correctly
- [ ] Compatible with screen readers

5. Special attention to signing experience:

- [ ] Signature pad accessible via keyboard
- [ ] Tab-through field completion works
- [ ] Progress indicator is screen-reader friendly
- [ ] Consent checkbox is accessible

## Output

- Accessibility report with pass/fail per criterion
- List of violations with severity and remediation guidance
- Page-by-page results
