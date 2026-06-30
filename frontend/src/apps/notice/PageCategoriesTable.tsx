import { Fragment, type ReactNode } from 'react';
import { NOTICE_MODELS } from './models';
import type { Segment } from './categoryRun';
import { ReasoningBadge } from './ReasoningBadge';
import { useDragScroll } from './useDragScroll';
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
}) {
  const { t } = useLanguage();
  const scrollRef = useDragScroll<HTMLDivElement>();
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
    <div
      ref={scrollRef}
      className="mx-auto max-w-5xl cursor-grab overflow-x-auto rounded-xl border-2 border-slate-300 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:shadow-lg"
    >
      <table className="w-full text-center text-sm">
        <tbody>
          {/* Page numbers */}
          <tr className="border-b-2 border-slate-300 dark:border-slate-700">
            <th
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
                <th className={`${labelCellCls} font-semibold text-slate-900 dark:text-slate-100`}>
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
