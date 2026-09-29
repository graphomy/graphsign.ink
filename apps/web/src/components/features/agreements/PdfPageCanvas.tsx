'use client';

import { useEffect, useRef } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';

/** Renders a PDF page at the requested width and cancels stale renders. */
export function PdfPageCanvas({
  document,
  pageNumber,
  width,
}: {
  document: PDFDocumentProxy;
  pageNumber: number;
  width: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined;
    void document
      .getPage(pageNumber)
      .then((page) => {
        if (cancelled || !ref.current) return;
        const canvas = ref.current;
        const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
        const ratio = window.devicePixelRatio || 1;
        canvas.width = Math.ceil(viewport.width * ratio);
        canvas.height = Math.ceil(viewport.height * ratio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        task = page.render({ canvas, viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
        void task.promise.catch((error) => {
          if (!cancelled) console.error('Unable to render PDF page', error);
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [document, pageNumber, width]);
  return (
    <canvas ref={ref} aria-label={`Page ${pageNumber}`} className="max-w-full h-auto bg-white" />
  );
}
