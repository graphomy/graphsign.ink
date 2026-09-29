/** Loads PDF.js lazily so document parsing does not enter the initial app bundle. */
export async function loadPdfDocument(url: string) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  return pdfjs.getDocument({ url }).promise;
}
