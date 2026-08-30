import { describe, it, expect } from 'vitest';
import {
  documentFieldSchema,
  recipientSchema,
  saveDocumentFieldsSchema,
} from './field-validators.js';

describe('Field Validators Unit Tests (INK-78 to INK-85)', () => {
  describe('recipientSchema', () => {
    it('validates correct recipient with hex color and valid email', () => {
      const valid = {
        id: 'rec-1',
        name: 'Alice Signer',
        email: 'alice@example.com',
        role: 'signer',
        color: '#4F46E5',
      };
      const result = recipientSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('rejects recipient with invalid email or invalid hex color', () => {
      const invalidEmail = {
        id: 'rec-1',
        name: 'Alice',
        email: 'not-an-email',
        role: 'signer',
        color: '#4F46E5',
      };
      expect(recipientSchema.safeParse(invalidEmail).success).toBe(false);

      const invalidColor = {
        id: 'rec-1',
        name: 'Alice',
        email: 'alice@example.com',
        role: 'signer',
        color: 'red',
      };
      expect(recipientSchema.safeParse(invalidColor).success).toBe(false);
    });
  });

  describe('documentFieldSchema', () => {
    it('validates field with percentage coordinates between 0 and 100', () => {
      const field = {
        id: 'fld-1',
        type: 'SIGNATURE',
        pageNumber: 1,
        x: 20.5,
        y: 65.0,
        width: 25.0,
        height: 8.0,
        recipientId: 'rec-1',
        isRequired: true,
      };
      const result = documentFieldSchema.safeParse(field);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('SIGNATURE');
        expect(result.data.pageNumber).toBe(1);
      }
    });

    it('rejects coordinates out of bounds (> 100% or < 0%)', () => {
      const invalidX = {
        id: 'fld-1',
        type: 'TEXT',
        x: 105.0,
        y: 50.0,
        width: 20.0,
        height: 5.0,
        recipientId: 'rec-1',
      };
      expect(documentFieldSchema.safeParse(invalidX).success).toBe(false);
    });
  });

  describe('saveDocumentFieldsSchema', () => {
    it('validates collection of fields and recipients', () => {
      const payload = {
        recipients: [
          {
            id: 'rec-1',
            name: 'Bob',
            email: 'bob@example.com',
            role: 'signer',
            color: '#10B981',
          },
        ],
        fields: [
          {
            id: 'fld-1',
            type: 'TEXT',
            pageNumber: 1,
            x: 10,
            y: 20,
            width: 30,
            height: 5,
            recipientId: 'rec-1',
            isRequired: false,
          },
        ],
      };
      const result = saveDocumentFieldsSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });
  });
});
