import { useEffect, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { X } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import type { PartItem } from './partsRun';
// Side-effect import: configures the shared PDF.js worker.
import './pdfRender';

// Crop a normalized bbox (x0,y0,x1,y1 in 0..1) out of a rendered page canvas,
// with a little margin to absorb bounding-box imprecision, as a PNG data URL.
function cropCanvas(src: HTMLCanvasElement, bbox: [number, number, number, number], margin = 0.015): string {
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

// The extracted supplied-parts list: one row per part, with its piece image
// cropped from the PDF on the fly (so nothing big is persisted). The bag and
// reference columns appear only when at least one part carries that field.
export function PartsTable({ file, items }: { file: Blob; items: PartItem[] }) {
  const { t } = useLanguage();
  const [crops, setCrops] = useState<Record<number, string>>({});
  // The piece image currently zoomed (its data URL), or null.
  const [zoom, setZoom] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoom(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setCrops({});
    (async () => {
      const buf = await file.arrayBuffer();
      const task = pdfjsLib.getDocument({ data: buf });
      const doc = await task.promise;
      const cache = new Map<number, HTMLCanvasElement>();
      const renderPage = async (n: number) => {
        const hit = cache.get(n);
        if (hit) return hit;
        const pdfPage = await doc.getPage(n);
        const base = pdfPage.getViewport({ scale: 1 });
        // Render the page large so a small part still has enough pixels to stay
        // crisp when its crop is zoomed (the PDF is vector, so this is sharp).
        const viewport = pdfPage.getViewport({ scale: 2400 / base.width });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no 2d context');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise;
        cache.set(n, canvas);
        return canvas;
      };

      const next: Record<number, string> = {};
      for (let i = 0; i < items.length; i++) {
        if (cancelled) {
          void task.destroy();
          return;
        }
        try {
          const canvas = await renderPage(items[i].page);
          next[i] = cropCanvas(canvas, items[i].bbox);
        } catch {
          // skip a page that fails to render
        }
      }
      if (!cancelled) setCrops(next);
      void task.destroy();
    })();
    return () => {
      cancelled = true;
    };
  }, [file, items]);

  const hasBag = items.some((p) => p.bag);
  const hasRef = items.some((p) => p.ref);

  // Transposed: one row per field (the labels are the sticky first column), one
  // column per part, scrolling horizontally. The sticky column's right edge is a
  // box-shadow (a border vanishes on a sticky cell while the row scrolls under).
  const labelCellCls =
    'sticky left-0 z-20 w-40 bg-white px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-900 shadow-[inset_-2px_0_0_0_#cbd5e1] dark:bg-slate-900 dark:text-white dark:shadow-[inset_-2px_0_0_0_#334155]';
  const dataCellCls =
    'min-w-[8rem] border-r border-slate-200 px-4 py-2 text-center text-slate-700 dark:border-slate-700 dark:text-slate-300';
  const rowCls = 'border-b border-slate-200 last:border-0 dark:border-slate-700';

  return (
    <div className="mx-auto max-w-5xl overflow-x-auto rounded-xl border-2 border-slate-300 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:shadow-lg">
      <table className="w-full text-sm">
        <tbody>
          {hasBag && (
            <tr className={rowCls}>
              <th className={labelCellCls}>{t('notice.parts.bag')}</th>
              {items.map((p, i) => (
                <td key={i} className={dataCellCls}>{p.bag ?? '—'}</td>
              ))}
            </tr>
          )}
          {hasRef && (
            <tr className={rowCls}>
              <th className={labelCellCls}>{t('notice.parts.ref')}</th>
              {items.map((p, i) => (
                <td key={i} className={`${dataCellCls} font-mono`}>{p.ref ?? '—'}</td>
              ))}
            </tr>
          )}
          <tr className={rowCls}>
            <th className={labelCellCls}>{t('notice.parts.qty')}</th>
            {items.map((p, i) => (
              <td key={i} className={`${dataCellCls} font-semibold tabular-nums text-slate-900 dark:text-slate-100`}>
                {p.qty}x
              </td>
            ))}
          </tr>
          <tr className={rowCls}>
            <th className={labelCellCls}>{t('notice.parts.piece')}</th>
            {items.map((p, i) => (
              <td key={i} className={dataCellCls}>
                {crops[i] ? (
                  <img
                    src={crops[i]}
                    alt={p.ref ?? t('notice.parts.piece')}
                    onClick={() => setZoom(crops[i])}
                    title={t('notice.pdf.zoom')}
                    className="mx-auto max-h-24 w-auto cursor-zoom-in rounded bg-white"
                  />
                ) : (
                  <span className="text-slate-400">…</span>
                )}
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      {/* Lightbox: click the backdrop (or Escape) to close. */}
      {zoom && (
        <div
          onClick={() => setZoom(null)}
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/80 p-4"
        >
          <button
            type="button"
            onClick={() => setZoom(null)}
            aria-label={t('notice.pdf.close')}
            className="absolute right-4 top-4 cursor-pointer rounded-lg border border-slate-600 bg-slate-800/80 p-2 text-slate-200 transition-colors hover:bg-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={zoom}
            alt={t('notice.parts.piece')}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-[90vw] cursor-default rounded-lg bg-white shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
