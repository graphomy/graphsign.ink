/** Keeps source-file metadata while removing execution evidence from a new draft copy. */
export function draftMetadata(value: unknown): Record<string, unknown> {
  const result =
    value && typeof value === 'object' && !Array.isArray(value)
      ? ({ ...value } as Record<string, unknown>)
      : {};
  for (const key of [
    'signedPdfBase64',
    'sealedPdfBase64',
    'verificationToken',
    'verificationUrl',
    'documentHash',
    'sealedAt',
    'padesLevel',
    'sealingStatus',
    'envelopeId',
    'signerName',
    'signerEmail',
  ])
    delete result[key];
  return result;
}
