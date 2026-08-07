import { describe, it, expect } from 'vitest';
import {
  createUploadAgreementSchema,
  createScratchAgreementSchema,
  queryAgreementsSchema,
} from './agreement-validators.js';

describe('Agreement Validators Unit Tests (Epic INK-8)', () => {
  describe('createUploadAgreementSchema (INK-66)', () => {
    it('should validate valid PDF upload input', () => {
      const valid = createUploadAgreementSchema.safeParse({
        title: 'Master Services Agreement',
        fileName: 'msa_2026.pdf',
        fileSize: 1024 * 1024, // 1MB
        mimeType: 'application/pdf',
      });
      expect(valid.success).toBe(true);
    });

    it('should reject non-PDF/DOCX mime types', () => {
      const invalid = createUploadAgreementSchema.safeParse({
        title: 'Executable Script',
        fileName: 'malicious.exe',
        fileSize: 500,
        mimeType: 'application/x-msdownload',
      });
      expect(invalid.success).toBe(false);
    });

    it('should reject files exceeding 25MB', () => {
      const invalid = createUploadAgreementSchema.safeParse({
        title: 'Huge Document',
        fileName: 'huge.pdf',
        fileSize: 30 * 1024 * 1024, // 30MB
        mimeType: 'application/pdf',
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe('createScratchAgreementSchema (INK-67)', () => {
    it('should validate valid HTML content input', () => {
      const valid = createScratchAgreementSchema.safeParse({
        title: 'NDA Agreement',
        htmlContent: '<h1>Non Disclosure Agreement</h1><p>Terms...</p>',
      });
      expect(valid.success).toBe(true);
    });

    it('should sanitize script tags and XSS vectors from htmlContent', () => {
      const result = createScratchAgreementSchema.parse({
        title: 'XSS Test',
        htmlContent:
          '<p>Safe content</p><script>alert("xss")</script><iframe src="evil.com"></iframe>',
      });
      expect(result.htmlContent).not.toContain('<script');
      expect(result.htmlContent).not.toContain('<iframe');
      expect(result.htmlContent).toContain('<p>Safe content</p>');
    });
  });

  describe('queryAgreementsSchema', () => {
    it('should set default pagination values', () => {
      const parsed = queryAgreementsSchema.parse({});
      expect(parsed.page).toBe(1);
      expect(parsed.limit).toBe(20);
    });
  });
});
