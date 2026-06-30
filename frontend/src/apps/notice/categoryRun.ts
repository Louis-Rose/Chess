import { useCallback, useSyncExternalStore } from 'react';
import axios from 'axios';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import { NOTICE_MODELS } from './models';
import { renderPdfPageToImage } from './pdfRender';

// The page-range categorize run lives here, at module scope, instead of inside
// the CategoryTable component. The reader (NoticeViewer) is a React Router route,
// so navigating to another tab unmounts it and its PdfViewer, which destroys the
// PDF.js document. Holding the run here — keyed by document id, with its own
// PDF.js document — lets it keep going while the user is on another tab.

// How many pages to classify at once during a range run. Each page already
// fans out across the models, so this caps total in-flight Gemini requests.
const PAGE_CONCURRENCY = 5;

// model id -> page number -> category label (or per-cell error message)
type ByModelPage = Record<string, Record<number, string>>;

// A mid-page section change: `y` is the boundary (0..1 from the top), `above` and
// `below` the categories on each side.
export type Split = { y: number; above: string; below: string };
type SplitMap = Record<string, Record<number, Split>>;

// One categorize run: a self-contained result set for the models it called over
// a page range. Runs are kept as a browsable history; a new run never merges into
// a previous one, and a model that wasn't called has no results in that run.
export type Run = {
  models: string[];
  from: number;
  to: number;
  categories: ByModelPage;
  reasoning: ByModelPage;
  raws: ByModelPage;
  splits: SplitMap;
};

export type RunSnapshot = {
  busy: null | 'range';
  progress: { done: number; total: number } | null;
  active: number;
  // History of runs, and which one is currently displayed (-1 if none).
  runs: Run[];
  selected: number;
  // Mirror of the selected run, so components read the displayed results directly.
  categories: ByModelPage;
  reasoning: ByModelPage;
  raws: ByModelPage;
  splits: SplitMap;
  runModels: string[];
  // Per-cell failures of the active run (transient, not persisted).
  cellErrors: ByModelPage;
  // A page the user asked the viewer to jump to; the viewer applies then clears it.
  requestedPage: number | null;
  // Models the user has muted (greyed out, not called, hidden on the PDF).
  disabledModels: string[];
  error: string | null;
};

type Entry = {
  snapshot: RunSnapshot;
  controller: AbortController | null;
  // Index of the run currently being filled (-1 when idle); setResult targets it.
  activeRun: number;
  listeners: Set<() => void>;
};

const entries = new Map<string, Entry>();

const runsKey = (docId: string) => `notice.runs.${docId}`;
const selectedKey = (docId: string) => `notice.selected.${docId}`;
const disabledKey = (docId: string) => `notice.disabled.${docId}`;
// Pre-history single-result keys, migrated into one run on first load.
const legacyCatKey = (docId: string) => `notice.categories.${docId}`;
const legacyReasonKey = (docId: string) => `notice.reasoning.${docId}`;
const legacyRawsKey = (docId: string) => `notice.raws.${docId}`;
const legacySplitsKey = (docId: string) => `notice.splits.${docId}`;

function loadStore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveStore(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota / serialization errors
  }
}

function loadRuns(docId: string): Run[] {
  const runs = loadStore<Run[]>(runsKey(docId), []);
  if (Array.isArray(runs) && runs.length) return runs;
  // Migrate a pre-history single result set into one run, if present.
  const categories = loadStore<ByModelPage>(legacyCatKey(docId), {});
  if (!Object.keys(categories).length) return [];
  const migrated: Run = {
    models: Object.keys(categories),
    from: 1,
    to: 0,
    categories,
    reasoning: loadStore<ByModelPage>(legacyReasonKey(docId), {}),
    raws: loadStore<ByModelPage>(legacyRawsKey(docId), {}),
    splits: loadStore<SplitMap>(legacySplitsKey(docId), {}),
  };
  saveStore(runsKey(docId), [migrated]);
  return [migrated];
}

const EMPTY: ByModelPage = {};
const EMPTY_SPLITS: SplitMap = {};

// Derive the displayed maps from the selected run.
function mirror(runs: Run[], selected: number) {
  const r = runs[selected];
  return {
    categories: r?.categories ?? EMPTY,
    reasoning: r?.reasoning ?? EMPTY,
    raws: r?.raws ?? EMPTY,
    splits: r?.splits ?? EMPTY_SPLITS,
    runModels: r?.models ?? [],
  };
}

function getEntry(docId: string): Entry {
  let entry = entries.get(docId);
  if (!entry) {
    const runs = loadRuns(docId);
    const storedSel = loadStore<number>(selectedKey(docId), runs.length - 1);
    const selected = runs.length ? Math.min(Math.max(storedSel, 0), runs.length - 1) : -1;
    const disabledRaw = loadStore<string[]>(disabledKey(docId), []);
    entry = {
      snapshot: {
        busy: null,
        progress: null,
        active: 0,
        runs,
        selected,
        ...mirror(runs, selected),
        cellErrors: {},
        requestedPage: null,
        disabledModels: Array.isArray(disabledRaw) ? disabledRaw : [],
        error: null,
      },
      controller: null,
      activeRun: -1,
      listeners: new Set(),
    };
    entries.set(docId, entry);
  }
  return entry;
}

// Replace a document's snapshot (immutably) and notify subscribers. The displayed
// maps are always re-derived from the selected run.
function update(docId: string, patch: Partial<RunSnapshot>) {
  const entry = getEntry(docId);
  const next = { ...entry.snapshot, ...patch };
  entry.snapshot = { ...next, ...mirror(next.runs, next.selected) };
  entry.listeners.forEach((l) => l());
}

// Record one (model, page) result into the run currently being filled. A page
// split into two sections becomes "Above / Below" plus a structured split.
function setResult(
  docId: string,
  modelId: string,
  pageNum: number,
  category: string,
  reasoning: string,
  raw: string,
  boundary: number | null,
  categoryBelow: string | null,
) {
  const entry = getEntry(docId);
  const idx = entry.activeRun;
  const runs = entry.snapshot.runs;
  if (idx < 0 || !runs[idx]) return;
  const split = boundary != null && categoryBelow ? { y: boundary, above: category, below: categoryBelow } : null;
  const label = split ? `${category} / ${categoryBelow}` : category;

  const run = runs[idx];
  const nextSplits: SplitMap = { ...run.splits, [modelId]: { ...(run.splits[modelId] || {}) } };
  if (split) nextSplits[modelId][pageNum] = split;
  else delete nextSplits[modelId][pageNum];

  const nextRun: Run = {
    ...run,
    categories: { ...run.categories, [modelId]: { ...(run.categories[modelId] || {}), [pageNum]: label } },
    reasoning: { ...run.reasoning, [modelId]: { ...(run.reasoning[modelId] || {}), [pageNum]: reasoning } },
    raws: { ...run.raws, [modelId]: { ...(run.raws[modelId] || {}), [pageNum]: raw } },
    splits: nextSplits,
  };
  const nextRuns = runs.slice();
  nextRuns[idx] = nextRun;
  saveStore(runsKey(docId), nextRuns);
  update(docId, { runs: nextRuns, cellErrors: clearCell(entry.snapshot.cellErrors, modelId, pageNum) });
}

function clearCell(map: ByModelPage, modelId: string, pageNum: number): ByModelPage {
  if (map[modelId]?.[pageNum] === undefined) return map;
  const forModel = { ...map[modelId] };
  delete forModel[pageNum];
  return { ...map, [modelId]: forModel };
}

function recordCellError(docId: string, modelId: string, pageNum: number, message: string) {
  const { cellErrors } = getEntry(docId).snapshot;
  update(docId, {
    cellErrors: { ...cellErrors, [modelId]: { ...(cellErrors[modelId] || {}), [pageNum]: message } },
  });
}

// Classify one page image across the enabled models, storing results in the
// active run. A muted model is skipped (no API call, no cost). A cancelled
// request leaves the cell untouched; any other failure is surfaced in the cell.
async function classify(
  docId: string,
  image: string,
  pageNum: number,
  signal: AbortSignal,
  t: (k: string) => string,
) {
  const disabled = new Set(getEntry(docId).snapshot.disabledModels);
  await Promise.all(
    NOTICE_MODELS.filter((m) => !disabled.has(m.id)).map(async (m) => {
      try {
        const { data } = await axios.post<{
          category: string;
          reasoning?: string;
          raw?: string;
          boundary?: number | null;
          categoryBelow?: string | null;
        }>('/api/notice/categorize', { image, model: m.id }, { signal });
        setResult(
          docId,
          m.id,
          pageNum,
          data.category,
          data.reasoning || '',
          data.raw || '',
          data.boundary ?? null,
          data.categoryBelow ?? null,
        );
      } catch (e) {
        if (axios.isCancel(e)) return;
        const msg =
          (axios.isAxiosError(e) && (e.response?.data as { error?: string })?.error) ||
          (e instanceof Error && e.message) ||
          t('notice.err.generic');
        recordCellError(docId, m.id, pageNum, msg);
      }
    }),
  );
}

function bumpActive(docId: string, delta: number) {
  update(docId, { active: getEntry(docId).snapshot.active + delta });
}

// Build the list of page numbers to run for a contiguous range, clamped to the
// document and order-forgiving (from/to may be swapped).
function pageRange(from: number, to: number, numPages: number): number[] {
  const lo = Math.max(1, Math.min(from, to));
  const hi = Math.min(numPages, Math.max(from, to));
  const pages: number[] = [];
  for (let n = lo; n <= hi; n++) pages.push(n);
  return pages;
}

// Start a new run over a page range. It appends a fresh result set (for the
// enabled models) to the history and selects it, so previous outputs disappear
// from view, then classifies each page with a bounded worker pool.
export async function startRange(
  docId: string,
  file: Blob,
  from: number,
  to: number,
  t: (k: string) => string,
) {
  const entry = getEntry(docId);
  if (entry.snapshot.busy) return;

  const disabled = new Set(entry.snapshot.disabledModels);
  const models = NOTICE_MODELS.map((m) => m.id).filter((id) => !disabled.has(id));
  const newRun: Run = { models, from, to, categories: {}, reasoning: {}, raws: {}, splits: {} };
  const runs = [...entry.snapshot.runs, newRun];
  entry.activeRun = runs.length - 1;
  saveStore(runsKey(docId), runs);
  saveStore(selectedKey(docId), entry.activeRun);
  update(docId, {
    runs,
    selected: entry.activeRun,
    busy: 'range',
    error: null,
    progress: null,
    active: 0,
    cellErrors: {},
  });

  const controller = new AbortController();
  entry.controller = controller;
  const { signal } = controller;

  let loadingTask: PDFDocumentLoadingTask | null = null;
  try {
    const buf = await file.arrayBuffer();
    loadingTask = pdfjsLib.getDocument({ data: buf });
    const doc: PDFDocumentProxy = await loadingTask.promise;
    const pages = pageRange(from, to, doc.numPages);
    if (pages.length === 0) return;
    update(docId, { progress: { done: 0, total: pages.length } });

    let cursor = 0;
    let done = 0;
    const worker = async () => {
      for (let i = cursor++; i < pages.length && !signal.aborted; i = cursor++) {
        const n = pages[i];
        bumpActive(docId, 1);
        try {
          const image = await renderPdfPageToImage(doc, n);
          if (signal.aborted) return;
          if (image) await classify(docId, image, n, signal, t);
          update(docId, { progress: { done: ++done, total: pages.length } });
        } finally {
          bumpActive(docId, -1);
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(PAGE_CONCURRENCY, pages.length) }, worker));
  } catch {
    if (!signal.aborted) update(docId, { error: t('notice.err.rendering') });
  } finally {
    entry.controller = null;
    entry.activeRun = -1;
    update(docId, { busy: null, progress: null, active: 0 });
    void loadingTask?.destroy();
  }
}

export function stopRun(docId: string) {
  getEntry(docId).controller?.abort();
}

// Browse the run history: show run #index. Tables and the PDF viewer follow.
export function selectRun(docId: string, index: number) {
  const { runs } = getEntry(docId).snapshot;
  if (index < 0 || index >= runs.length) return;
  saveStore(selectedKey(docId), index);
  update(docId, { selected: index });
}

// Ask the viewer to jump to a page (or clear the request with null).
export function requestPage(docId: string, page: number | null) {
  update(docId, { requestedPage: page });
}

// Mute / unmute a model (clicking its name): greyed out, not called, hidden on
// the PDF. Persisted per document.
export function toggleModel(docId: string, modelId: string) {
  const current = getEntry(docId).snapshot.disabledModels;
  const next = current.includes(modelId)
    ? current.filter((id) => id !== modelId)
    : [...current, modelId];
  saveStore(disabledKey(docId), next);
  update(docId, { disabledModels: next });
}

// Subscribe a component to a document's run state.
export function useRun(docId: string): RunSnapshot {
  const subscribe = useCallback(
    (cb: () => void) => {
      const entry = getEntry(docId);
      entry.listeners.add(cb);
      return () => {
        entry.listeners.delete(cb);
      };
    },
    [docId],
  );
  const getSnapshot = useCallback(() => getEntry(docId).snapshot, [docId]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
