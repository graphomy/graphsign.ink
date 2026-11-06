/** Loads PDF.js lazily so document parsing does not enter the initial app bundle. */
export async function loadPdfDocument(urlOrData: string | ArrayBuffer | Uint8Array) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  if (typeof urlOrData === 'string' && urlOrData.startsWith('blob:')) {
    try {
      const res = await fetch(urlOrData);
      const data = await res.arrayBuffer();
      return await pdfjs.getDocument({ data }).promise;
    } catch {
      return await pdfjs.getDocument({ url: urlOrData }).promise;
    }
  }

  if (typeof urlOrData === 'string') {
    return await pdfjs.getDocument({ url: urlOrData }).promise;
  }

  return await pdfjs.getDocument({ data: urlOrData }).promise;
}
