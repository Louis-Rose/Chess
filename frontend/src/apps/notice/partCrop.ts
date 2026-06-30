import * as pdfjsLib from 'pdfjs-dist';
import type { PartItem } from './partsRun';
// Side-effect import: configures the shared PDF.js worker.
import './pdfRender';

// Crop a normalized bbox (x0,y0,x1,y1 in 0..1) out of a rendered page canvas,
// with a little margin to absorb bounding-box imprecision, as a PNG data URL.
export function cropCanvas(
  src: HTMLCanvasElement,
  bbox: [number, number, number, number],
  margin = 0.015,
): string {
  const [x0, y0, x1, y1] = bbox;
  const sx = Math.max(0, x0 - margin) * src.width;
  const sy = Math.max(0, y0 - margin) * src.height;
  const sw = Math.min(1, x1 + margin) * src.width - sx;
  const sh = Math.min(1, y1 + margin) * src.height - sy;
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(sw));
  out.height = Math.max(1, Math.round(sh));
  const ctx = out.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

// Render one part's crop straight from the PDF (loads the doc, renders its page
// large, crops). For a single part on demand; the parts table renders many crops
// with its own cached page canvases instead.
export async function renderPartCrop(file: Blob, item: PartItem): Promise<string | null> {
  const buf = await file.arrayBuffer();
  const task = pdfjsLib.getDocument({ data: buf });
  const doc = await task.promise;
  try {
    const pdfPage = await doc.getPage(item.page);
    const base = pdfPage.getViewport({ scale: 1 });
    const viewport = pdfPage.getViewport({ scale: 1600 / base.width });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise;
    return cropCanvas(canvas, item.bbox);
  } catch {
    return null;
  } finally {
    void task.destroy();
  }
}

// Render every part's crop in one pass: load the doc once and cache each rendered
// page canvas, so many parts on the same pages share a single render. Returns a
// crop (PNG data URL) or null per item, in order.
export async function renderPartCrops(file: Blob, items: PartItem[]): Promise<(string | null)[]> {
  const buf = await file.arrayBuffer();
  const task = pdfjsLib.getDocument({ data: buf });
  const doc = await task.promise;
  const pageCache = new Map<number, HTMLCanvasElement>();
  const renderPage = async (n: number) => {
    const hit = pageCache.get(n);
    if (hit) return hit;
    const pdfPage = await doc.getPage(n);
    const base = pdfPage.getViewport({ scale: 1 });
    const viewport = pdfPage.getViewport({ scale: 1600 / base.width });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise;
    pageCache.set(n, canvas);
    return canvas;
  };
  try {
    const out: (string | null)[] = [];
    for (const item of items) {
      try {
        out.push(cropCanvas(await renderPage(item.page), item.bbox));
      } catch {
        out.push(null);
      }
    }
    return out;
  } finally {
    void task.destroy();
  }
}
