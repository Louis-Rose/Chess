import { Fragment, type ReactNode, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, Brain } from 'lucide-react';
import { NOTICE_MODELS } from './models';
import type { Segment } from './categoryRun';
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
  raws,
  segments,
  cellErrors,
  onSelectPage,
  disabled,
  onToggleModel,
  labelWidth,
}: {
  numPages: number;
  categories: Record<string, Record<number, string>>;
  reasoning: Record<string, Record<number, string>>;
  raws: Record<string, Record<number, string>>;
  segments: Record<string, Record<number, Segment[]>>;
  cellErrors: Record<string, Record<number, string>>;
  onSelectPage?: (page: number) => void;
  disabled: Set<string>;
  onToggleModel: (modelId: string) => void;
  labelWidth?: number | null;
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

  // Sticky first column (row labels) + one column per page.
  // The right separator is a box-shadow rather than border-r: a sticky table
  // cell's border vanishes while the rest of the row scrolls under it, but its
  // box-shadow stays painted.
  const labelCellCls =
    'sticky left-0 z-20 w-56 bg-white px-4 py-2 text-center shadow-[inset_-2px_0_0_0_#cbd5e1] dark:bg-slate-900 dark:shadow-[inset_-2px_0_0_0_#334155]';
  const dataCellCls =
    'min-w-[10rem] cursor-pointer border-r-2 border-slate-300 px-3 py-2 transition-colors hover:bg-emerald-50 dark:border-slate-700 dark:hover:bg-emerald-500/10';
  // Mirror the stats table's first-column width when known (overrides the w-56
  // fallback in labelCellCls), so the two tables' first columns line up exactly.
  const labelStyle = labelWidth ? { width: labelWidth, minWidth: labelWidth } : undefined;

  // The hover tooltip for a cell. A reasoning model shows two captioned sections
  // (reasoning + raw output); a non-reasoning model shows just its raw output.
  const tooltipContent = (c: { reasonText: string; rawText: string; reasons: boolean }): ReactNode => {
    const section = (title: string | null, body: string) => (
      <div>
        {title && (
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {title}
          </div>
        )}
        <div className="whitespace-pre-line">{body || '—'}</div>
      </div>
    );
    if (c.reasons) {
      return (
        <div className="space-y-3">
          {section(t('notice.cat.reasoningTitle'), c.reasonText || t('notice.cat.noReasoning'))}
          {section(t('notice.cat.rawOutputTitle'), c.rawText)}
        </div>
      );
    }
    return section(null, c.rawText);
  };

  // One category cell. Each category label stays on a single line; a page split
  // into several sections stacks them with a "&" alone on its own line between
  // each pair. The brain badge, shown on every classified cell, is centered.
  const renderCell = (
    c: {
      err?: string;
      segs?: Segment[];
      cat?: string;
      reasonText: string;
      rawText: string;
      reasons: boolean;
    },
    muted = false,
  ) => {
    if (c.err) {
      return (
        <span className="text-rose-600 dark:text-rose-400" title={c.err}>
          {c.err}
        </span>
      );
    }
    const classified = !!(c.segs?.length || c.cat);
    return (
      <span className="inline-flex items-center justify-center gap-1.5">
        {c.segs && c.segs.length > 1 ? (
          <span className="flex flex-col whitespace-nowrap">
            {c.segs.map((s, i) => (
              <Fragment key={i}>
                {i > 0 && <span>&amp;</span>}
                <span>{s.category}</span>
              </Fragment>
            ))}
          </span>
        ) : (
          <span className="whitespace-nowrap">{c.segs?.[0]?.category ?? c.cat ?? '—'}</span>
        )}
        {classified && !muted && (
          <ReasoningBadge content={tooltipContent(c)} label={t('notice.cat.thinking')} reasons={c.reasons} />
        )}
      </span>
    );
  };

  // One column per page; disagreement (the models differ) tints the column red.
  const cols = pages.map((n) => {
    const cells = NOTICE_MODELS.map((m) => ({
      id: m.id,
      err: cellErrors[m.id]?.[n],
      segs: segments[m.id]?.[n],
      cat: categories[m.id]?.[n],
      reasonText: reasoning[m.id]?.[n] || '',
      rawText: raws[m.id]?.[n] || '',
      reasons: reasoningModels.has(m.id),
    }));
    // Only compare ENABLED models; a muted model is excluded from disagreement.
    const keys = cells
      .filter((c) => !disabled.has(c.id))
      .map((c) => (c.err ? '' : c.segs?.length ? c.segs.map((s) => s.category).join(' / ') : c.cat || ''))
      .filter(Boolean);
    return { n, cells, bg: new Set(keys).size > 1 ? 'bg-red-100 dark:bg-red-500/20' : '' };
  });

  return (
    <div className="mx-auto max-w-5xl overflow-x-auto rounded-xl border-2 border-slate-300 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:shadow-lg">
      <table className="w-full text-center text-sm">
        <tbody>
          {/* Page numbers */}
          <tr className="border-b-2 border-slate-300 dark:border-slate-700">
            <th
              style={labelStyle}
              className={`${labelCellCls} text-xs font-medium uppercase tracking-wide text-slate-900 dark:text-white`}
            >
              {t('notice.pdf.page')}
            </th>
            {cols.map((col) => (
              <td
                key={col.n}
                onClick={() => onSelectPage?.(col.n)}
                className={`${dataCellCls} font-semibold text-slate-900 dark:text-slate-100 ${col.bg}`}
              >
                {col.n}
              </td>
            ))}
          </tr>
          {/* One row per model */}
          {NOTICE_MODELS.map((m, mi) => {
            const off = disabled.has(m.id);
            return (
              <tr key={m.id} className="border-b-2 border-slate-300 last:border-0 dark:border-slate-700">
                <th style={labelStyle} className={`${labelCellCls} font-semibold text-slate-900 dark:text-slate-100`}>
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: m.color }}
                      aria-hidden
                    />
                    <button
                      type="button"
                      onClick={() => onToggleModel(m.id)}
                      className={`cursor-pointer transition-colors hover:underline ${
                        off ? 'text-slate-400 line-through dark:text-slate-600' : ''
                      }`}
                    >
                      {m.label}
                    </button>
                  </span>
                </th>
                {cols.map((col) => (
                  <td
                    key={col.n}
                    onClick={() => onSelectPage?.(col.n)}
                    className={`${dataCellCls} text-slate-700 dark:text-slate-300 ${col.bg} ${off ? 'opacity-40' : ''}`}
                  >
                    {renderCell(col.cells[mi], off)}
                  </td>
                ))}
              </tr>
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

function ReasoningBadge({
  content,
  label,
  reasons,
}: {
  content: ReactNode;
  label: string;
  reasons: boolean;
}) {
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
        {reasons ? <Brain className="h-3 w-3" aria-label={label} /> : <ArrowUp className="h-3 w-3" aria-label={label} />}
      </span>
      {open &&
        createPortal(
          <div
            ref={tipRef}
            role="tooltip"
            onMouseEnter={openTip}
            onMouseLeave={scheduleClose}
            style={{ position: 'fixed', left: coords.left, top: coords.top, transform: 'translateX(-50%)' }}
            className="z-50 max-h-[92vh] w-[52rem] max-w-[94vw] overflow-y-auto overscroll-contain rounded-lg border border-slate-200 bg-white px-5 py-4 text-left text-sm font-normal leading-relaxed text-slate-700 shadow-xl dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {content}
          </div>,
          document.body,
        )}
    </span>
  );
}
