import { useEffect, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { useLanguage } from '../../contexts/LanguageContext';
import { useDragScroll } from './useDragScroll';
import { ReasoningBadge } from './ReasoningBadge';
import { cropCanvas } from './partCrop';
import { setSelectedPart, useSelectedPart } from './selectionStore';
import type { PartItem } from './partsRun';
// Side-effect import: configures the shared PDF.js worker.
import './pdfRender';

// The extracted supplied-parts list: one row per part, with its piece image
// cropped from the PDF on the fly (so nothing big is persisted). Every field row
// (letter, ref, name, size, qty, bag) shows always, with "-" where a manual
// doesn't print it, so the table shape stays stable across manuals.
export function PartsTable({
  file,
  items,
  reasoning,
  docId,
}: {
  file: Blob;
  items: PartItem[];
  reasoning: Record<number, string>;
  docId: string;
}) {
  const { t } = useLanguage();
  const [crops, setCrops] = useState<Record<number, string>>({});
  const scrollRef = useDragScroll<HTMLDivElement>();
  // The part (ref) selected for the image search below; clicking a column sets it.
  const selectedRef = useSelectedPart(docId);
  const onPick = (p: PartItem) => p.ref && setSelectedPart(docId, p.ref as string);

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

  // Transposed: one row per field (the labels are the sticky first column), one
  // column per part, scrolling horizontally. The sticky column's right edge is a
  // box-shadow (a border vanishes on a sticky cell while the row scrolls under).
  const labelCellCls =
    'sticky left-0 z-20 w-40 bg-white px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-900 shadow-[inset_-2px_0_0_0_#cbd5e1] dark:bg-slate-900 dark:text-white dark:shadow-[inset_-2px_0_0_0_#334155]';
  const dataCellCls =
    'min-w-[8rem] border-r border-slate-200 px-4 py-2 text-center text-slate-700 dark:border-slate-700 dark:text-slate-300';
  const rowCls = 'border-b border-slate-200 last:border-0 dark:border-slate-700';
  // A data cell, clickable to select its part's column (tinted when selected).
  const cellCls = (p: PartItem, extra = '') =>
    `${dataCellCls} ${extra} ${p.ref ? 'cursor-pointer' : ''} ${
      p.ref && p.ref === selectedRef ? 'bg-emerald-50 dark:bg-emerald-500/10' : ''
    }`;

  // A plain text field row: the label, then one cell per part showing the value
  // or "-" when this manual doesn't print it. All field rows show always (even
  // when empty for every part), so the table shape is stable across manuals.
  const textRow = (label: string, get: (p: PartItem) => string | null, extra = '') => (
    <tr className={rowCls}>
      <th className={labelCellCls}>{label}</th>
      {items.map((p, i) => (
        <td key={i} onClick={() => onPick(p)} className={cellCls(p, extra)}>
          {get(p) || '-'}
        </td>
      ))}
    </tr>
  );

  return (
    <>
    <div
      ref={scrollRef}
      className="mx-auto max-w-5xl cursor-grab overflow-x-auto rounded-xl border-2 border-slate-300 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:shadow-lg"
    >
      <table className="w-full text-sm">
        <tbody>
          <tr className={rowCls}>
            <th className={labelCellCls}>{t('notice.pdf.page')}</th>
            {items.map((p, i) => (
              <td
                key={i}
                onClick={() => onPick(p)}
                className={cellCls(p, 'font-semibold text-slate-900 dark:text-slate-100')}
              >
                <span className="inline-flex items-center justify-center gap-1.5">
                  {p.page}
                  <ReasoningBadge
                    content={<div className="whitespace-pre-line">{reasoning[p.page] || t('notice.cat.noReasoning')}</div>}
                    label={t('notice.cat.thinking')}
                    reasons
                  />
                </span>
              </td>
            ))}
          </tr>
          {textRow(t('notice.parts.letter'), (p) => p.letter, 'font-semibold text-slate-900 dark:text-slate-100')}
          {textRow(t('notice.parts.ref'), (p) => p.ref, 'font-mono')}
          {textRow(t('notice.parts.name'), (p) => p.name)}
          {textRow(t('notice.parts.size'), (p) => p.size, 'font-mono')}
          <tr className={rowCls}>
            <th className={labelCellCls}>{t('notice.parts.qty')}</th>
            {items.map((p, i) => (
              <td
                key={i}
                onClick={() => onPick(p)}
                className={cellCls(p, 'font-semibold tabular-nums text-slate-900 dark:text-slate-100')}
              >
                {p.qty != null ? `${p.qty}x` : '-'}
              </td>
            ))}
          </tr>
          {textRow(t('notice.parts.bag'), (p) => p.bag)}
          <tr className={rowCls}>
            <th className={labelCellCls}>{t('notice.parts.piece')}</th>
            {items.map((p, i) => (
              <td key={i} onClick={() => onPick(p)} className={cellCls(p)}>
                {crops[i] ? (
                  <img
                    src={crops[i]}
                    alt={p.ref ?? t('notice.parts.piece')}
                    className="mx-auto max-h-24 w-auto rounded bg-white"
                  />
                ) : (
                  <span className="text-slate-400">…</span>
                )}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
    </>
  );
}
