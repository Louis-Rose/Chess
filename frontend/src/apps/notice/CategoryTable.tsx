import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Info, Loader2, Sparkles, Square } from 'lucide-react';
import { NOTICE_MODELS } from './models';
import { useLanguage } from '../../contexts/LanguageContext';
import { startRange, stopRun, useRun } from './categoryRun';

// A table with one row per Gemini model: the model name, the category it assigns
// to the page currently shown, and the running Gemini spend for that model in the
// Notice.ai feature. The run classifies a contiguous page range (cached per page,
// so the column fills in as you navigate).
//
// The run itself (busy/progress/results) lives in categoryRun, keyed by document
// id, so it survives leaving and returning to the reader tab. This component just
// reads that shared state and renders it; the cost/time columns stay local since
// they are only a display refresh.
export function CategoryTable({
  numPages,
  page,
  docId,
  file,
}: {
  numPages: number;
  page: number;
  docId: string;
  file: Blob;
}) {
  const { t } = useLanguage();
  const { busy, progress, active, categories, cellErrors, error } = useRun(docId);
  const [costs, setCosts] = useState<Record<string, number>>({});
  const [times, setTimes] = useState<Record<string, number>>({});
  const [calls, setCalls] = useState<Record<string, number>>({});
  const [tokens, setTokens] = useState<Record<string, { input: number; output: number }>>({});
  const [pricing, setPricing] = useState<Record<string, { input: number; output: number }>>({});

  // Page-range selection. `from` follows the page on screen and `to` defaults to
  // the last page until the user edits either field (then it stays put).
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(0);
  const touchedFrom = useRef(false);
  const touchedTo = useRef(false);
  useEffect(() => {
    if (!touchedFrom.current) setFrom(page);
  }, [page]);
  useEffect(() => {
    if (!touchedTo.current && numPages > 0) setTo(numPages);
  }, [numPages]);

  const loadCosts = useCallback(async () => {
    try {
      const { data } = await axios.get<{
        costs: Record<string, number>;
        times: Record<string, number>;
        calls: Record<string, number>;
        tokens: Record<string, { input: number; output: number }>;
        pricing: Record<string, { input: number; output: number }>;
      }>('/api/notice/costs');
      setCosts(data.costs || {});
      setTimes(data.times || {});
      setCalls(data.calls || {});
      setTokens(data.tokens || {});
      setPricing(data.pricing || {});
    } catch {
      // non-fatal: leave the cost/time columns empty
    }
  }, []);

  // Refresh the cost/time columns on mount and whenever a run finishes (busy ->
  // null), including a run that completed while the user was on another tab.
  useEffect(() => {
    if (!busy) void loadCosts();
  }, [busy, loadCosts]);

  const btnClass =
    'flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:border-emerald-500 hover:bg-emerald-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-emerald-500/10';
  const stopBtnClass =
    'flex items-center gap-2 rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 shadow-sm transition-colors hover:border-rose-500 hover:bg-rose-50 dark:border-rose-500/40 dark:bg-slate-800 dark:text-rose-300 dark:hover:bg-rose-500/10';
  const numInputClass =
    'w-14 rounded-md border border-slate-300 bg-white px-2 py-1 text-center text-sm text-slate-800 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

  // Trailing " · done/total · N in progress" while the range run is live.
  const progressSuffix =
    busy === 'range'
      ? `${progress ? ` · ${progress.done}/${progress.total}` : ''}${
          active > 0 ? ` · ${active} ${t('notice.cat.inFlight')}` : ''
        }`
      : '';

  const onFrom = (v: number) => {
    touchedFrom.current = true;
    setFrom(v);
  };
  const onTo = (v: number) => {
    touchedTo.current = true;
    setTo(v);
  };

  const failedCount = Object.values(cellErrors).reduce((sum, byPage) => sum + Object.keys(byPage).length, 0);

  return (
    <div className="mt-6">
      <div className="mb-3 flex flex-wrap items-center justify-center gap-3">
        {/* Run a contiguous page range */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600 dark:text-slate-300">{t('notice.cat.from')}</span>
          <input
            type="number"
            min={1}
            max={Math.max(numPages, 1)}
            value={from}
            onChange={(e) => onFrom(Number(e.target.value))}
            disabled={!!busy || numPages < 1}
            className={numInputClass}
            aria-label={t('notice.cat.from')}
          />
          <span className="text-sm text-slate-600 dark:text-slate-300">{t('notice.cat.to')}</span>
          <input
            type="number"
            min={1}
            max={Math.max(numPages, 1)}
            value={to}
            onChange={(e) => onTo(Number(e.target.value))}
            disabled={!!busy || numPages < 1}
            className={numInputClass}
            aria-label={t('notice.cat.to')}
          />
          <button
            type="button"
            onClick={() => void startRange(docId, file, from, to, t)}
            disabled={!!busy || numPages < 1}
            className={btnClass}
          >
            {busy === 'range' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {t('notice.cat.runRange')}
            {progressSuffix}
          </button>
        </div>

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
              <th className="px-4 py-2 font-medium">{t('notice.cat.calls')}</th>
              <th className="px-4 py-2 font-medium">{t('notice.cat.tokens')}</th>
            </tr>
          </thead>
          <tbody>
            {NOTICE_MODELS.map((m) => {
              const cell = categories[m.id]?.[page];
              const cellError = cellErrors[m.id]?.[page];
              const price = pricing[m.id];
              return (
                <tr
                  key={m.id}
                  className="border-b border-slate-200 last:border-0 [&>td]:border-r [&>td]:border-slate-200 [&>td:last-child]:border-r-0 dark:border-slate-800/60 dark:[&>td]:border-slate-800/60"
                >
                  <td className="px-4 py-2.5 text-center font-semibold text-slate-900 dark:text-slate-100">
                    <span className="inline-flex items-center justify-center gap-1.5">
                      {m.label}
                      {price && (
                        <span className="group relative inline-flex">
                          <Info className="h-3.5 w-3.5 text-slate-400 transition-colors group-hover:text-emerald-600 dark:text-slate-500 dark:group-hover:text-emerald-400" />
                          <span
                            role="tooltip"
                            className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-max -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs font-normal leading-relaxed text-slate-700 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                          >
                            {t('notice.cat.priceIn')}: ${price.input.toFixed(2)} / 1M
                            <br />
                            {t('notice.cat.priceOut')}: ${price.output.toFixed(2)} / 1M
                          </span>
                        </span>
                      )}
                    </span>
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
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-700 dark:text-slate-300">
                    {calls[m.id] ?? 0}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-700 dark:text-slate-300">
                    {(tokens[m.id]?.input ?? 0).toLocaleString()}
                    <span className="text-slate-400 dark:text-slate-500"> ↓ / </span>
                    {(tokens[m.id]?.output ?? 0).toLocaleString()}
                    <span className="text-slate-400 dark:text-slate-500"> ↑</span>
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
