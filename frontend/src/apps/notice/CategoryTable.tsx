import { type ReactNode, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Sparkles, Square } from 'lucide-react';
import { PageCategoriesTable } from './PageCategoriesTable';
import { ReasoningBadge } from './ReasoningBadge';
import { useLanguage } from '../../contexts/LanguageContext';
import { requestPage, selectRun, startRange, stopRun, toggleModel, useRun } from './categoryRun';
import { runBtnClass, stopBtnClass } from './controls';
import { runDetect, useBrand } from './brandStore';

// Etape 1: page classification. Stacked top to bottom:
//   1. the page-range controls (from / to + Lancer, plus the detected brand),
//   2. the classification result for every page (one row per page).
//
// The run itself (busy/progress/results) lives in categoryRun, keyed by document
// id, so it survives leaving and returning to the reader tab. This component just
// reads that shared state and renders it. Clicking Lancer also fires the brand
// detection as a parallel call (shown read-only beside the controls); the brand
// is reused by Étape 3's part image search.
export function CategoryTable({
  numPages,
  docId,
  file,
}: {
  numPages: number;
  docId: string;
  file: Blob;
}) {
  const { t } = useLanguage();
  const { busy, progress, active, categories, reasoning, raws, segments, cellErrors, disabledModels, runs, selected, error } =
    useRun(docId);
  const disabled = new Set(disabledModels);
  const onToggleModel = (modelId: string) => toggleModel(docId, modelId);
  const { brand, time, people, maxWeight, detecting, reasoning: infoReasoning, raw: infoRaw } =
    useBrand(docId);

  // The general-info columns: always all of them, so the shape is stable. While
  // detecting, every value cell shows a spinner; once done, each shows its value
  // or "-" when the manual doesn't state it.
  const infoCols = [
    { key: 'brand', label: t('notice.step3.brand'), value: brand },
    { key: 'time', label: t('notice.info.time'), value: time },
    { key: 'people', label: t('notice.info.people'), value: people },
    { key: 'maxWeight', label: t('notice.info.maxWeight'), value: maxWeight },
  ];
  // Show the table once a run has produced (or is producing) info.
  const hasInfo = detecting || !!infoRaw.trim() || infoCols.some((c) => c.value.trim());

  // The cover-page extraction is one model call, so a single badge covers the
  // whole info table. Same two-section tooltip as the categories table: the
  // model's reasoning over its raw output.
  const infoReasons = !!infoReasoning.trim();
  const infoTooltip: ReactNode = (
    <div className="space-y-3">
      <div>
        <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {t('notice.cat.reasoningTitle')}
        </div>
        <div className="whitespace-pre-line">{infoReasoning.trim() || t('notice.cat.noReasoning')}</div>
      </div>
      <div>
        <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {t('notice.cat.rawOutputTitle')}
        </div>
        <div className="whitespace-pre-line">{infoRaw.trim() || '—'}</div>
      </div>
    </div>
  );

  // Page-range selection. Held as strings so the field can be cleared while
  // typing (a number input would snap an empty value back to 0). `from` starts at
  // 1; `to` defaults to the last page until the user edits it (then it stays put).
  // Neither tracks the page on screen, so paging the reader (incl. with the arrow
  // keys) leaves the range untouched.
  const [from, setFrom] = useState('1');
  const [to, setTo] = useState('');
  const touchedTo = useRef(false);
  useEffect(() => {
    if (!touchedTo.current && numPages > 0) setTo(String(numPages));
  }, [numPages]);

  const numInputClass =
    'w-14 rounded-md border border-slate-300 bg-white px-2 py-1 text-center text-sm text-slate-800 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';
  const navBtnClass =
    'rounded-lg border border-slate-300 bg-white p-2 text-slate-700 transition-colors hover:border-emerald-500 hover:bg-emerald-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-emerald-500/10';

  // Trailing " · done/total · N in progress" while the range run is live.
  const progressSuffix =
    busy === 'range'
      ? `${progress ? ` · ${progress.done}/${progress.total}` : ''}${
          active > 0 ? ` · ${active} ${t('notice.cat.inFlight')}` : ''
        }`
      : '';

  const onFrom = (v: string) => {
    setFrom(v);
  };
  const onTo = (v: string) => {
    touchedTo.current = true;
    setTo(v);
  };

  // Lancer kicks off the page classification and, in parallel, re-extracts the
  // cover's general info (brand + time + people). Re-run every time so a fresh run
  // refreshes the info (one cheap page-1 call) rather than reusing a stale result.
  const onRun = () => {
    void startRange(docId, file, Number(from) || 1, Number(to) || numPages, t);
    void runDetect(docId, file);
  };

  const failedCount = Object.values(cellErrors).reduce((sum, byPage) => sum + Object.keys(byPage).length, 0);

  return (
    <div className="mt-6 flex flex-col gap-6">
      {/* 1. Page-range controls: the from / to selectors on one line, with the
          Lancer button (and the Stop button while busy) stacked below them. */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={Math.max(numPages, 1)}
            value={from}
            onChange={(e) => onFrom(e.target.value)}
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
            onChange={(e) => onTo(e.target.value)}
            disabled={!!busy || numPages < 1}
            className={numInputClass}
            aria-label={t('notice.cat.to')}
          />
        </div>

        <button
          type="button"
          onClick={onRun}
          disabled={!!busy || numPages < 1}
          className={runBtnClass}
        >
          {busy === 'range' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {t('notice.cat.runRange')}
          {progressSuffix}
        </button>

        {busy && (
          <button type="button" onClick={() => stopRun(docId)} className={stopBtnClass}>
            <Square className="h-4 w-4" />
            {t('notice.cat.stop')}
          </button>
        )}
      </div>

      {/* 2. General info read off the cover (read-only): brand — reused by the
          part image search — plus estimated time / people when the page states
          them. One column per present field: a header row over a value row. */}
      {hasInfo && (
        <div className="mx-auto overflow-hidden rounded-xl border-2 border-slate-300 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:shadow-lg">
          <table className="text-center text-sm">
            <tbody>
              <tr className="border-b-2 border-slate-300 dark:border-slate-700">
                {infoCols.map((c) => (
                  <th
                    key={c.key}
                    className="border-r-2 border-slate-300 px-4 py-2 font-semibold text-slate-900 last:border-r-0 dark:border-slate-700 dark:text-slate-100"
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
              <tr>
                {infoCols.map((c, i) => (
                  <td
                    key={c.key}
                    className="border-r-2 border-slate-300 px-4 py-2 text-slate-700 last:border-r-0 dark:border-slate-700 dark:text-slate-200"
                  >
                    <span className="inline-flex items-center justify-center gap-1.5">
                      {detecting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {c.value.trim() || '-'}
                        </span>
                      )}
                      {i === 0 && !detecting && (infoReasoning.trim() || infoRaw.trim()) && (
                        <ReasoningBadge content={infoTooltip} label={t('notice.cat.thinking')} reasons={infoReasons} />
                      )}
                    </span>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {error && <p className="-mt-2 text-center text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      {failedCount > 0 && (
        <p className="-mt-2 text-center text-sm text-rose-600 dark:text-rose-400">
          {failedCount} {t('notice.cat.failed')}
        </p>
      )}

      {/* 3. Category of every page */}
      <PageCategoriesTable
        numPages={numPages}
        categories={categories}
        reasoning={reasoning}
        raws={raws}
        segments={segments}
        cellErrors={cellErrors}
        disabled={disabled}
        onToggleModel={onToggleModel}
        onSelectPage={(p) => {
          requestPage(docId, p);
          document.getElementById('notice-pdf')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
      />

      {/* 4. Run history navigation, below the category table. */}
      {runs.length > 0 && (
        <div className="flex items-center justify-center gap-1.5">
          <button
            type="button"
            onClick={() => selectRun(docId, selected - 1)}
            disabled={selected <= 0}
            className={navBtnClass}
            aria-label={t('notice.cat.prevRun')}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[5rem] text-center text-sm tabular-nums text-slate-600 dark:text-slate-300">
            {t('notice.cat.run')} {selected + 1}/{runs.length}
          </span>
          <button
            type="button"
            onClick={() => selectRun(docId, selected + 1)}
            disabled={selected >= runs.length - 1}
            className={navBtnClass}
            aria-label={t('notice.cat.nextRun')}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
