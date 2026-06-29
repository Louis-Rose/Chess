import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2, Sparkles, Square } from 'lucide-react';
import { NOTICE_MODELS } from './models';
import { useLanguage } from '../../contexts/LanguageContext';
import { startAll, startThisPage, stopRun, setRunError, useRun } from './categoryRun';

// A table with one row per Gemini model: the model name, the category it assigns
// to the page currently shown, and the running Gemini spend for that model in the
// Notice.ai feature. Two actions: classify just the current page, or every page
// (cached per page, so the column fills in as you navigate).
//
// The run itself (busy/progress/results) lives in categoryRun, keyed by document
// id, so it survives leaving and returning to the reader tab. This component just
// reads that shared state and renders it; the cost/time columns stay local since
// they are only a display refresh.
export function CategoryTable({
  getPageImage,
  numPages,
  page,
  docId,
  file,
}: {
  getPageImage: () => string | null;
  numPages: number;
  page: number;
  docId: string;
  file: Blob;
}) {
  const { t } = useLanguage();
  const { busy, progress, active, categories, cellErrors, error } = useRun(docId);
  const [costs, setCosts] = useState<Record<string, number>>({});
  const [times, setTimes] = useState<Record<string, number>>({});

  const loadCosts = useCallback(async () => {
    try {
      const { data } = await axios.get<{
        costs: Record<string, number>;
        times: Record<string, number>;
      }>('/api/notice/costs');
      setCosts(data.costs || {});
      setTimes(data.times || {});
    } catch {
      // non-fatal: leave the cost/time columns empty
    }
  }, []);

  // Refresh the cost/time columns on mount and whenever a run finishes (busy ->
  // null), including a run that completed while the user was on another tab.
  useEffect(() => {
    if (!busy) void loadCosts();
  }, [busy, loadCosts]);

  const findThisPage = () => {
    const image = getPageImage();
    if (!image) {
      setRunError(docId, t('notice.err.rendering'));
      return;
    }
    void startThisPage(docId, image, page, t);
  };

  const btnClass =
    'flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:border-emerald-500 hover:bg-emerald-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-emerald-500/10';
  const stopBtnClass =
    'flex items-center gap-2 rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 shadow-sm transition-colors hover:border-rose-500 hover:bg-rose-50 dark:border-rose-500/40 dark:bg-slate-800 dark:text-rose-300 dark:hover:bg-rose-500/10';

  const failedCount = Object.values(cellErrors).reduce((sum, byPage) => sum + Object.keys(byPage).length, 0);

  return (
    <div className="mt-6">
      <div className="mb-3 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={findThisPage} disabled={!!busy} className={btnClass}>
          {busy === 'this' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {t('notice.cat.thisPage')}
        </button>
        <button
          type="button"
          onClick={() => void startAll(docId, file, t)}
          disabled={!!busy || numPages < 1}
          className={btnClass}
        >
          {busy === 'all' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {t('notice.cat.allPages')}
          {busy === 'all' && progress ? ` · ${progress.done}/${progress.total}` : ''}
          {busy === 'all' && active > 0 ? ` · ${active} ${t('notice.cat.inFlight')}` : ''}
        </button>
        {busy && (
          <button type="button" onClick={() => stopRun(docId)} className={stopBtnClass}>
            <Square className="h-4 w-4" />
            {t('notice.cat.stop')}
          </button>
        )}
      </div>

      {error && <p className="mb-2 text-center text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      {failedCount > 0 && (
        <p className="mb-2 text-center text-sm text-rose-600 dark:text-rose-400">
          {failedCount} {t('notice.cat.failed')}
        </p>
      )}

      <div className="mx-auto max-w-3xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-lg">
        <table className="w-full text-center text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-900 [&>th]:border-r [&>th]:border-slate-200 [&>th:last-child]:border-r-0 dark:border-slate-800 dark:text-white dark:[&>th]:border-slate-800/60">
              <th className="px-4 py-2 font-medium">{t('notice.cat.model')}</th>
              <th className="px-4 py-2 font-medium">
                {t('notice.cat.category')} ({t('notice.pdf.page')} {page})
              </th>
              <th className="px-4 py-2 font-medium">{t('notice.cat.cost')}</th>
              <th className="px-4 py-2 font-medium">{t('notice.cat.time')}</th>
            </tr>
          </thead>
          <tbody>
            {NOTICE_MODELS.map((m) => {
              const cell = categories[m.id]?.[page];
              const cellError = cellErrors[m.id]?.[page];
              return (
                <tr
                  key={m.id}
                  className="border-b border-slate-200 last:border-0 [&>td]:border-r [&>td]:border-slate-200 [&>td:last-child]:border-r-0 dark:border-slate-800/60 dark:[&>td]:border-slate-800/60"
                >
                  <td className="px-4 py-2.5 text-center font-semibold text-slate-900 dark:text-slate-100">
                    {m.label}
                  </td>
                  <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">
                    {cellError ? (
                      <span className="text-rose-600 dark:text-rose-400" title={cellError}>
                        {cellError}
                      </span>
                    ) : cell ?? (busy ? (
                      <Loader2 className="mx-auto h-4 w-4 animate-spin text-slate-500" />
                    ) : (
                      '—'
                    ))}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-emerald-600 dark:text-emerald-300">
                    ${(costs[m.id] ?? 0).toFixed(2)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-700 dark:text-slate-300">
                    {times[m.id] ? `${times[m.id].toFixed(1)}s` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
