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

// Render a page and return only the vertical band [top, bottom] (0..1 from the
// top) as a PNG data URL. Used to send just the in-category section of a page to
// the model. A full-page band (0..1) returns the whole page.
export async function renderPdfPageBand(
  doc: PDFDocumentProxy,
  n: number,
  top: number,
  bottom: number,
  targetWidth = 1100,
): Promise<string | null> {
  try {
    const pdfPage = await doc.getPage(n);
    const base = pdfPage.getViewport({ scale: 1 });
    const viewport = pdfPage.getViewport({ scale: targetWidth / base.width });
    const full = document.createElement('canvas');
    const fctx = full.getContext('2d');
    if (!fctx) return null;
    full.width = Math.floor(viewport.width);
    full.height = Math.floor(viewport.height);
    await pdfPage.render({ canvas: full, canvasContext: fctx, viewport }).promise;
    if (top <= 0 && bottom >= 1) return full.toDataURL('image/png');

    const y0 = Math.max(0, Math.floor(top * full.height));
    const y1 = Math.min(full.height, Math.ceil(bottom * full.height));
    const h = Math.max(1, y1 - y0);
    const band = document.createElement('canvas');
    const bctx = band.getContext('2d');
    if (!bctx) return null;
    band.width = full.width;
    band.height = h;
    bctx.drawImage(full, 0, y0, full.width, h, 0, 0, full.width, h);
    return band.toDataURL('image/png');
  } catch {
    return null;
  }
}
