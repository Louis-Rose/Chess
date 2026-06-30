import { Fragment, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Brain } from 'lucide-react';
import { NOTICE_MODELS } from './models';
import type { Split } from './categoryRun';
import { useLanguage } from '../../contexts/LanguageContext';

// The classification result for every page, all at once: one row per page, one
// column per model. The table scrolls within a bounded height with a sticky
// header. Cells fill in as a range run completes; a per-cell failure is shown in
// red. A brain badge reveals the model's reasoning on hover, but only for models
// that actually reason (skipped entirely for non-thinking models).
export function PageCategoriesTable({
  numPages,
  categories,
  reasoning,
  splits,
  cellErrors,
}: {
  numPages: number;
  categories: Record<string, Record<number, string>>;
  reasoning: Record<string, Record<number, string>>;
  splits: Record<string, Record<number, Split>>;
  cellErrors: Record<string, Record<number, string>>;
}) {
  const { t } = useLanguage();
  if (numPages < 1) return null;

  const pages = Array.from({ length: numPages }, (_, i) => i + 1);
  // A model "reasons" if it returned a thought summary on at least one page; only
  // then do we show the brain badge (with a placeholder on its rare empty pages).
  const reasoningModels = new Set(
    NOTICE_MODELS.filter((m) =>
      Object.values(reasoning[m.id] || {}).some((r) => r && r.trim()),
    ).map((m) => m.id),
  );

  const trCells =
    '[&>td]:border-r [&>td]:border-slate-200 [&>td:last-child]:border-r-0 dark:[&>td]:border-slate-800/60';
  const pageCellCls = 'px-4 py-2 font-semibold text-slate-900 dark:text-slate-100';
  const catCellCls = 'px-4 py-2 text-slate-700 dark:text-slate-300';

  // One category cell's content: the label plus, for reasoning models, the brain
  // badge revealing the thought summary.
  const cellInner = (label: string | undefined, showBadge: boolean, reasonText: string) => (
    <span className="inline-flex items-center justify-center gap-1.5">
      {label ?? '—'}
      {showBadge && (
        <ReasoningBadge text={reasonText || t('notice.cat.noReasoning')} label={t('notice.cat.thinking')} />
      )}
    </span>
  );

  return (
    <div className="mx-auto max-h-[70vh] max-w-3xl overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-lg">
      <table className="w-full text-center text-sm">
        <thead className="sticky top-0 z-10 bg-white dark:bg-slate-900">
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-900 [&>th]:border-r [&>th]:border-slate-200 [&>th:last-child]:border-r-0 dark:border-slate-800 dark:text-white dark:[&>th]:border-slate-800/60">
            <th className="px-4 py-2 font-medium">{t('notice.pdf.page')}</th>
            {NOTICE_MODELS.map((m) => (
              <th key={m.id} className="px-4 py-2 font-medium">
                {m.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pages.map((n) => {
            const cells = NOTICE_MODELS.map((m) => ({
              model: m,
              err: cellErrors[m.id]?.[n],
              split: splits[m.id]?.[n],
              cat: categories[m.id]?.[n],
              reasonText: reasoning[m.id]?.[n] || '',
              reasons: reasoningModels.has(m.id),
            }));
            // A page needs two rows when any model split it into two sections.
            const twoRows = cells.some((c) => c.split);
            // Flag a page where the models landed on different results, so the
            // disagreements stand out (needs at least two distinct non-empty labels).
            const keys = cells
              .map((c) => (c.err ? '' : c.split ? `${c.split.above} / ${c.split.below}` : c.cat || ''))
              .filter(Boolean);
            const bg = new Set(keys).size > 1 ? 'bg-red-100 dark:bg-red-500/20' : '';

            const errOrCell = (c: (typeof cells)[number]) =>
              c.err ? (
                <span className="text-rose-600 dark:text-rose-400" title={c.err}>
                  {c.err}
                </span>
              ) : (
                cellInner(c.cat, c.reasons && !!c.cat, c.reasonText)
              );

            if (!twoRows) {
              return (
                <tr key={n} className={`border-b border-slate-200 last:border-0 ${trCells} dark:border-slate-800/60 ${bg}`}>
                  <td className={pageCellCls}>{n}</td>
                  {cells.map((c) => (
                    <td key={c.model.id} className={catCellCls}>
                      {errOrCell(c)}
                    </td>
                  ))}
                </tr>
              );
            }

            // Split page: the top sections sit in the first row, the bottom
            // sections in the second; the page number and any non-split model span
            // both rows. A thin top border in the split columns divides the two.
            return (
              <Fragment key={n}>
                <tr className={`${trCells} dark:border-slate-800/60 ${bg}`}>
                  <td rowSpan={2} className={pageCellCls}>
                    {n}
                  </td>
                  {cells.map((c) =>
                    c.split ? (
                      <td key={c.model.id} className={catCellCls}>
                        {cellInner(c.split.above, c.reasons, c.reasonText)}
                      </td>
                    ) : (
                      <td key={c.model.id} rowSpan={2} className={catCellCls}>
                        {errOrCell(c)}
                      </td>
                    ),
                  )}
                </tr>
                <tr className={`border-b border-slate-200 last:border-0 ${trCells} dark:border-slate-800/60 ${bg}`}>
                  {cells
                    .filter((c) => c.split)
                    .map((c) => (
                      <td
                        key={c.model.id}
                        className={`${catCellCls} border-t border-slate-200 dark:border-slate-800/60`}
                      >
                        {cellInner(c.split!.below, false, '')}
                      </td>
                    ))}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// A circled brain that reveals the model's reasoning on hover. The tooltip is
// rendered into <body> (fixed position) so the table's scroll container can't
// clip it. It is sized to the viewport (capped height + internal scroll) and
// repositioned to stay fully on screen, however long the reasoning is. It stays
// open while the pointer is over the tooltip itself, so long text can be scrolled.
const MARGIN = 12;

function ReasoningBadge({ text, label }: { text: string; label: string }) {
  const iconRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ left: 0, top: 0 });

  // Center horizontally on the icon (clamped to the viewport) and prefer placing
  // the box above the icon; if it doesn't fit there, drop below, then clamp so
  // the top stays on screen and the internal scroll handles the overflow.
  const place = useCallback(() => {
    const icon = iconRef.current?.getBoundingClientRect();
    if (!icon) return;
    const tip = tipRef.current?.getBoundingClientRect();
    const w = tip?.width ?? 0;
    const h = tip?.height ?? 0;
    const left = Math.min(Math.max(icon.left + icon.width / 2, w / 2 + MARGIN), window.innerWidth - w / 2 - MARGIN);
    let top = icon.top - MARGIN - h;
    if (top < MARGIN) top = Math.min(icon.bottom + MARGIN, window.innerHeight - h - MARGIN);
    if (top < MARGIN) top = MARGIN;
    setCoords({ left, top });
  }, []);

  // Measure once mounted, then re-place. Re-measure on the next frame too, since
  // wrapping/height settles after the first paint.
  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  const openTip = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const scheduleClose = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  return (
    <span ref={iconRef} onMouseEnter={openTip} onMouseLeave={scheduleClose} className="inline-flex">
      <span className="inline-flex items-center justify-center rounded-full border border-slate-300 p-0.5 text-slate-400 transition-colors hover:border-emerald-500 hover:text-emerald-600 dark:border-slate-600 dark:text-slate-500 dark:hover:border-emerald-400 dark:hover:text-emerald-400">
        <Brain className="h-3 w-3" aria-label={label} />
      </span>
      {open &&
        createPortal(
          <div
            ref={tipRef}
            role="tooltip"
            onMouseEnter={openTip}
            onMouseLeave={scheduleClose}
            style={{ position: 'fixed', left: coords.left, top: coords.top, transform: 'translateX(-50%)' }}
            className="z-50 max-h-[92vh] w-[52rem] max-w-[94vw] overflow-y-auto overscroll-contain whitespace-pre-line rounded-lg border border-slate-200 bg-white px-5 py-4 text-left text-sm font-normal leading-relaxed text-slate-700 shadow-xl dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {text}
          </div>,
          document.body,
        )}
    </span>
  );
}
