import { NOTICE_MODELS } from './models';
import { useLanguage } from '../../contexts/LanguageContext';

// The classification result for every page, all at once: one row per page, one
// column per model, so the assigned category for the whole document is visible
// in a single view. Cells fill in as a range run completes; a per-cell failure
// is shown in red instead of silently blanking.
export function PageCategoriesTable({
  numPages,
  page,
  categories,
  cellErrors,
}: {
  numPages: number;
  page: number;
  categories: Record<string, Record<number, string>>;
  cellErrors: Record<string, Record<number, string>>;
}) {
  const { t } = useLanguage();
  if (numPages < 1) return null;

  const pages = Array.from({ length: numPages }, (_, i) => i + 1);

  return (
    <div className="mx-auto max-h-[60vh] max-w-3xl overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-lg">
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
                return (
                  <td key={m.id} className="px-4 py-2 text-slate-700 dark:text-slate-300">
                    {cellError ? (
                      <span className="text-rose-600 dark:text-rose-400" title={cellError}>
                        {cellError}
                      </span>
                    ) : (
                      cell ?? '—'
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
