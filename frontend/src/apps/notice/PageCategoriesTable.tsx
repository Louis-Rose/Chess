import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Brain } from 'lucide-react';
import { NOTICE_MODELS } from './models';
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
  cellErrors,
}: {
  numPages: number;
  categories: Record<string, Record<number, string>>;
  reasoning: Record<string, Record<number, string>>;
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
            // Flag a page where the models landed on different categories, so the
            // disagreements stand out (needs at least two distinct non-empty labels).
            const disagree =
              new Set(NOTICE_MODELS.map((m) => categories[m.id]?.[n]).filter(Boolean)).size > 1;
            return (
            <tr
              key={n}
              className={`border-b border-slate-200 last:border-0 [&>td]:border-r [&>td]:border-slate-200 [&>td:last-child]:border-r-0 dark:border-slate-800/60 dark:[&>td]:border-slate-800/60 ${
                disagree ? 'bg-rose-50 dark:bg-rose-500/10' : ''
              }`}
            >
              <td className="px-4 py-2 font-semibold text-slate-900 dark:text-slate-100">{n}</td>
              {NOTICE_MODELS.map((m) => {
                const cell = categories[m.id]?.[n];
                const cellError = cellErrors[m.id]?.[n];
                const reason = reasoning[m.id]?.[n];
                return (
                  <td key={m.id} className="px-4 py-2 text-slate-700 dark:text-slate-300">
                    {cellError ? (
                      <span className="text-rose-600 dark:text-rose-400" title={cellError}>
                        {cellError}
                      </span>
                    ) : (
                      <span className="inline-flex items-center justify-center gap-1.5">
                        {cell ?? '—'}
                        {cell && reasoningModels.has(m.id) && (
                          <ReasoningBadge text={reason || t('notice.cat.noReasoning')} label={t('notice.cat.thinking')} />
                        )}
                      </span>
                    )}
                  </td>
                );
              })}
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
// clip it, and it can be wide without being cut off.
function ReasoningBadge({ text, label }: { text: string; label: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.min(Math.max(r.left + r.width / 2, 16), window.innerWidth - 16);
    setPos({ left, top: r.top - 8 });
  };

  return (
    <span
      ref={ref}
      onMouseEnter={show}
      onMouseLeave={() => setPos(null)}
      className="inline-flex"
    >
      <span className="inline-flex items-center justify-center rounded-full border border-slate-300 p-0.5 text-slate-400 transition-colors hover:border-emerald-500 hover:text-emerald-600 dark:border-slate-600 dark:text-slate-500 dark:hover:border-emerald-400 dark:hover:text-emerald-400">
        <Brain className="h-3 w-3" aria-label={label} />
      </span>
      {pos &&
        createPortal(
          <div
            role="tooltip"
            style={{ position: 'fixed', left: pos.left, top: pos.top, transform: 'translate(-50%, -100%)' }}
            className="pointer-events-none z-50 w-[36rem] max-w-[90vw] whitespace-pre-line rounded-lg border border-slate-200 bg-white px-4 py-3 text-left text-sm font-normal leading-relaxed text-slate-700 shadow-lg dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {text}
          </div>,
          document.body,
        )}
    </span>
  );
}
