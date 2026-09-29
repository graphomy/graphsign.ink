import { describe, it, expect } from 'vitest';
import {
  createUploadAgreementSchema,
  createScratchAgreementSchema,
  updateDraftSchema,
  activateAgreementSchema,
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

    it('should validate valid Markdown (.md) upload input', () => {
      const valid = createUploadAgreementSchema.safeParse({
        title: 'Draft Proposal',
        fileName: 'proposal.md',
        fileSize: 5 * 1024,
        mimeType: 'text/markdown',
        markdownContent: '# Proposal Draft',
      });
      expect(valid.success).toBe(true);
    });

    it('should reject encrypted / password-locked documents with friendly error', () => {
      const locked = createUploadAgreementSchema.safeParse({
        title: 'Locked Document',
        fileName: 'secure.pdf',
        fileSize: 50000,
        mimeType: 'application/pdf',
        isEncrypted: true,
      });
      expect(locked.success).toBe(false);
      if (!locked.success) {
        expect(locked.error.issues[0]?.message).toContain(
          'The uploaded document is encrypted or password-protected',
        );
      }
    });

    it('should reject non-PDF/DOCX/MD mime types', () => {
      const invalid = createUploadAgreementSchema.safeParse({
        title: 'Executable Script',
        fileName: 'malicious.exe',
        fileSize: 500,
        mimeType: 'application/x-msdownload',
      });
      expect(invalid.success).toBe(false);
    });

    it('should reject files exceeding 15MB', () => {
      const invalid = createUploadAgreementSchema.safeParse({
        title: 'Huge Document',
        fileName: 'huge.pdf',
        fileSize: 20 * 1024 * 1024, // 20MB
        mimeType: 'application/pdf',
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe('createScratchAgreementSchema (INK-67)', () => {
    it('should validate valid Markdown content input', () => {
      const valid = createScratchAgreementSchema.safeParse({
        title: 'NDA Agreement',
        markdownContent: '# Non Disclosure Agreement\n\n## Terms\n- Confidentiality',
      });
      expect(valid.success).toBe(true);
    });
  });

  describe('updateDraftSchema (INK-68)', () => {
    it('should validate valid draft updates', () => {
      const valid = updateDraftSchema.safeParse({
        title: 'Updated NDA Title',
        markdownContent: '## Updated Terms\n1. Clause 1',
        tags: ['legal', 'nda'],
      });
      expect(valid.success).toBe(true);
    });
  });

  describe('activateAgreementSchema', () => {
    it('should validate optional comment', () => {
      const valid = activateAgreementSchema.safeParse({
        comment: 'Approved and finalized for signing',
      });
      expect(valid.success).toBe(true);
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
