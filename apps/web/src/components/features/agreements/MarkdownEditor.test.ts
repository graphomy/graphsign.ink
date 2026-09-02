import { describe, it, expect } from 'vitest';
import { renderMarkdownToHtml } from './MarkdownEditor';

describe('MarkdownEditor - renderMarkdownToHtml (SEC-03)', () => {
  it('neutralizes malicious javascript: URLs in markdown links', () => {
    const maliciousMd = '[Click here](javascript:alert("pwned"))';
    const html = renderMarkdownToHtml(maliciousMd);

    expect(html).not.toContain('javascript:');
    expect(html).toContain('href="#"');
    expect(html).toContain('Click here');
  });

  it('neutralizes data: and vbscript: URIs', () => {
    const dataUriMd = '[Click here](data:text/html,<script>alert(1)</script>)';
    const html = renderMarkdownToHtml(dataUriMd);

    expect(html).not.toContain('data:text/html');
    expect(html).toContain('href="#"');
  });

  it('preserves valid https://, http://, and mailto: URLs', () => {
    const validMd = '[Website](https://graphsign.ink) and [Contact](mailto:security@graphsign.ink)';
    const html = renderMarkdownToHtml(validMd);

    expect(html).toContain('href="https://graphsign.ink"');
    expect(html).toContain('href="mailto:security@graphsign.ink"');
  });
});
