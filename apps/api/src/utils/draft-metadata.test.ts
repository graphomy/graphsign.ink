import { describe, it, expect } from 'vitest';
import { draftMetadata } from './draft-metadata.js';
describe('draft copy metadata', () => {
  it('retains source bytes without inheriting the prior execution or changing the original', () => {
    const source = {
      fileBase64: 'source',
      signedPdfBase64: 'signed',
      verificationToken: 'GS-old',
      documentHash: 'old',
      envelopeId: 'ENV-old',
      client: 'Example',
    };
    expect(draftMetadata(source)).toEqual({ fileBase64: 'source', client: 'Example' });
    expect(source.signedPdfBase64).toBe('signed');
  });
});
