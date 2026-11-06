import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadPdfDocument } from './pdf-document';

const mockGetDocument = vi.fn();

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: (...args: unknown[]) => mockGetDocument(...args),
}));

describe('loadPdfDocument (INK-249)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDocument.mockReturnValue({
      promise: Promise.resolve({ numPages: 2 }),
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('configures GlobalWorkerOptions.workerSrc to /pdf.worker.min.mjs', async () => {
    const pdfjs = await import('pdfjs-dist');
    await loadPdfDocument('https://example.com/test.pdf');
    expect(pdfjs.GlobalWorkerOptions.workerSrc).toBe('/pdf.worker.min.mjs');
  });

  it('loads remote PDF URLs via { url }', async () => {
    const doc = await loadPdfDocument('https://example.com/contract.pdf');
    expect(mockGetDocument).toHaveBeenCalledWith({ url: 'https://example.com/contract.pdf' });
    expect(doc).toEqual({ numPages: 2 });
  });

  it('reads blob: URLs into ArrayBuffer and passes { data } to avoid worker blob fetch failures', async () => {
    const testBytes = new Uint8Array([1, 2, 3, 4]).buffer;
    globalThis.fetch = vi.fn().mockResolvedValue({
      arrayBuffer: vi.fn().mockResolvedValue(testBytes),
    } as unknown as Response);

    const doc = await loadPdfDocument('blob:https://graphsign.ink/abc-123');
    expect(globalThis.fetch).toHaveBeenCalledWith('blob:https://graphsign.ink/abc-123');
    expect(mockGetDocument).toHaveBeenCalledWith({ data: testBytes });
    expect(doc).toEqual({ numPages: 2 });
  });

  it('falls back to { url } if reading blob: URL fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error on blob fetch'));

    const doc = await loadPdfDocument('blob:https://graphsign.ink/fallback-123');
    expect(mockGetDocument).toHaveBeenCalledWith({
      url: 'blob:https://graphsign.ink/fallback-123',
    });
    expect(doc).toEqual({ numPages: 2 });
  });

  it('passes raw ArrayBuffer or Uint8Array directly via { data }', async () => {
    const rawData = new Uint8Array([37, 80, 68, 70]);
    await loadPdfDocument(rawData);
    expect(mockGetDocument).toHaveBeenCalledWith({ data: rawData });
  });
});
