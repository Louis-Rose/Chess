import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { ChevronLeft, ChevronRight, Loader2, Sparkles, Square } from 'lucide-react';
import { ModelStatsTable } from './ModelStatsTable';
import { PageCategoriesTable } from './PageCategoriesTable';
import { useLanguage } from '../../contexts/LanguageContext';
import { requestPage, selectRun, startRange, stopRun, toggleModel, useRun } from './categoryRun';
import { runBtnClass, stopBtnClass } from './controls';

// Etape 1: page classification. Stacked top to bottom:
//   1. the per-model run economics (cost / time / calls / tokens),
//   2. the page-range controls (from / to + Lancer),
//   3. the classification result for every page (one row per page).
//
// The run itself (busy/progress/results) lives in categoryRun, keyed by document
// id, so it survives leaving and returning to the reader tab. This component just
// reads that shared state and renders it; the cost/time figures stay local since
// they are only a display refresh.
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
  const [costs, setCosts] = useState<Record<string, number>>({});
  const [times, setTimes] = useState<Record<string, number>>({});
  const [calls, setCalls] = useState<Record<string, number>>({});
  const [tokens, setTokens] = useState<
    Record<string, { input: number; output: number; thinking: number }>
  >({});
  const [pricing, setPricing] = useState<Record<string, { input: number; output: number }>>({});
  // Width of the stats table's first column, mirrored onto the category table's
  // first column so they line up.
  const [labelWidth, setLabelWidth] = useState<number | null>(null);

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

  const loadCosts = useCallback(async () => {
    try {
      const { data } = await axios.get<{
        costs: Record<string, number>;
        times: Record<string, number>;
        calls: Record<string, number>;
        tokens: Record<string, { input: number; output: number; thinking: number }>;
        pricing: Record<string, { input: number; output: number }>;
      }>('/api/notice/costs');
      setCosts(data.costs || {});
      setTimes(data.times || {});
      setCalls(data.calls || {});
      setTokens(data.tokens || {});
      setPricing(data.pricing || {});
    } catch {
      // non-fatal: leave the cost/time figures empty
    }
  }, []);

  // Refresh the economics on mount and whenever a run finishes (busy -> null),
  // including a run that completed while the user was on another tab.
  useEffect(() => {
    if (!busy) void loadCosts();
  }, [busy, loadCosts]);

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

  const failedCount = Object.values(cellErrors).reduce((sum, byPage) => sum + Object.keys(byPage).length, 0);

  return (
    <div className="mt-6 flex flex-col gap-6">
      {/* 1. Per-model run economics */}
      <ModelStatsTable
        costs={costs}
        times={times}
        calls={calls}
        tokens={tokens}
        pricing={pricing}
        disabled={disabled}
        onToggleModel={onToggleModel}
        onFirstColWidth={setLabelWidth}
      />

      {/* 2. Page-range controls */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600 dark:text-slate-300">{t('notice.cat.from')}</span>
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
          <button
            type="button"
            onClick={() => void startRange(docId, file, Number(from) || 1, Number(to) || numPages, t)}
            disabled={!!busy || numPages < 1}
            className={runBtnClass}
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

        {/* Browse the run history; the tables and PDF follow the selected run. */}
        {runs.length > 0 && (
          <div className="flex items-center gap-1.5">
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
        labelWidth={labelWidth}
        onSelectPage={(p) => {
          requestPage(docId, p);
          document.getElementById('notice-pdf')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
      />
    </div>
  );
}
