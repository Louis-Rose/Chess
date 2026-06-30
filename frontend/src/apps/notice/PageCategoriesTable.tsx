import { Brain } from 'lucide-react';
import { NOTICE_MODELS } from './models';
import { useLanguage } from '../../contexts/LanguageContext';

// The classification result for every page, all at once: one row per page, one
// column per model, so the assigned category for the whole document is visible
// in a single view. Cells fill in as a range run completes; a per-cell failure
// is shown in red instead of silently blanking. Where the model returned a
// thought summary, a brain badge reveals its reasoning on hover.
export function PageCategoriesTable({
  numPages,
  page,
  categories,
  reasoning,
  cellErrors,
}: {
  numPages: number;
  page: number;
  categories: Record<string, Record<number, string>>;
  reasoning: Record<string, Record<number, string>>;
  cellErrors: Record<string, Record<number, string>>;
}) {
  const { t } = useLanguage();
  if (numPages < 1) return null;

  const pages = Array.from({ length: numPages }, (_, i) => i + 1);

  return (
    <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-lg">
      <table className="w-full text-center text-sm">
        <thead>
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
          {pages.map((n) => (
            <tr
              key={n}
              className={`border-b border-slate-200 last:border-0 [&>td]:border-r [&>td]:border-slate-200 [&>td:last-child]:border-r-0 dark:border-slate-800/60 dark:[&>td]:border-slate-800/60 ${
                n === page ? 'bg-emerald-50/70 dark:bg-emerald-500/10' : ''
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
                        {cell && reason && (
                          <span className="group relative inline-flex">
                            <span className="inline-flex items-center justify-center rounded-full border border-slate-300 p-0.5 text-slate-400 transition-colors group-hover:border-emerald-500 group-hover:text-emerald-600 dark:border-slate-600 dark:text-slate-500 dark:group-hover:border-emerald-400 dark:group-hover:text-emerald-400">
                              <Brain className="h-3 w-3" aria-label={t('notice.cat.thinking')} />
                            </span>
                            <span
                              role="tooltip"
                              className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-72 -translate-x-1/2 whitespace-pre-line rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs font-normal leading-relaxed text-slate-700 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                            >
                              {reason}
                            </span>
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
