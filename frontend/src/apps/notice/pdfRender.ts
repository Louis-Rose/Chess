import * as pdfjsLib from 'pdfjs-dist';
import PdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker';
import type { PDFDocumentProxy } from 'pdfjs-dist';

// PDF.js renders pages off the main thread. Let Vite bundle and instantiate the
// worker (?worker) rather than pointing workerSrc at a raw .mjs URL: the latter
// is served as application/octet-stream by static hosts (nginx) and rejected by
// strict module-script MIME checks. A single shared worker serves every document,
// whether rendered on screen (PdfViewer) or off screen (the categorize run).
pdfjsLib.GlobalWorkerOptions.workerPort = new PdfjsWorker();

// Render any page off-screen to a PNG data URL, scaled to a target pixel width
// (used to categorize pages without touching the on-screen canvas).
export async function renderPdfPageToImage(
  doc: PDFDocumentProxy,
  n: number,
  targetWidth = 1000,
): Promise<string | null> {
  try {
    const pdfPage = await doc.getPage(n);
    const base = pdfPage.getViewport({ scale: 1 });
    const viewport = pdfPage.getViewport({ scale: targetWidth / base.width });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}
