import { describe, expect, it } from 'vitest';
import { renderEmailLayout } from './email-layout.js';
describe('email branding', () => {
  it('uses the logo, email-safe typography, one brand color, and plaintext links', () => {
    const message = renderEmailLayout(
      'Please sign',
      '<div><p>Review your agreement</p><a href="https://example.com/sign" style="background:#2563eb">Sign</a></div>',
      'https://dev.graphsign.ink,https://preview.example.com',
    );
    expect(message.html).toContain('https://dev.graphsign.ink/graphsign-email-logo.png');
    expect(message.html).toContain('Arial,Helvetica,sans-serif');
    expect(message.html).toContain('background:#c2101f');
    expect(message.html).not.toContain('#2563eb');
    expect(message.text).toContain('Sign (https://example.com/sign)');
  });
});
