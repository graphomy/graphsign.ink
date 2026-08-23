import { describe, it, expect } from 'vitest';
import {
  createTemplateSchema,
  shareTemplateSchema,
  queryTemplatesSchema,
} from './template-validators.js';

describe('Template Validators Unit Tests (Epic INK-11)', () => {
  describe('createTemplateSchema (INK-73)', () => {
    it('should validate valid template creation input', () => {
      const valid = createTemplateSchema.safeParse({
        title: 'Standard Non-Disclosure Agreement',
        description: 'Reusable NDA template for vendors',
        htmlContent: '<h1>NDA</h1><p>Standard terms</p>',
        tags: ['legal', 'vendor'],
      });
      expect(valid.success).toBe(true);
    });

    it('should sanitize XSS vectors from htmlContent', () => {
      const parsed = createTemplateSchema.parse({
        title: 'XSS Test',
        htmlContent: '<h1>NDA</h1><script>alert("hack")</script><iframe src="evil.com"></iframe>',
      });
      expect(parsed.htmlContent).not.toContain('<script');
      expect(parsed.htmlContent).not.toContain('<iframe');
      expect(parsed.htmlContent).toContain('<h1>NDA</h1>');
    });
  });

  describe('shareTemplateSchema (INK-75)', () => {
    it('should validate valid share payload for user or team', () => {
      const validUser = shareTemplateSchema.safeParse({
        targetType: 'user',
        targetId: '00000000-0000-7000-8000-000000000001',
        accessLevel: 'USE',
      });
      expect(validUser.success).toBe(true);

      const validTeam = shareTemplateSchema.safeParse({
        targetType: 'team',
        targetId: '00000000-0000-7000-8000-000000000002',
        accessLevel: 'EDIT',
      });
      expect(validTeam.success).toBe(true);
    });

    it('should reject invalid targetType or accessLevel', () => {
      const invalid = shareTemplateSchema.safeParse({
        targetType: 'invalid_type',
        targetId: '00000000-0000-7000-8000-000000000001',
        accessLevel: 'SUPER_ADMIN',
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe('queryTemplatesSchema (INK-77)', () => {
    it('should apply defaults for page, limit, and view', () => {
      const parsed = queryTemplatesSchema.parse({});
      expect(parsed.page).toBe(1);
      expect(parsed.limit).toBe(20);
      expect(parsed.view).toBe('library');
    });
  });
});
