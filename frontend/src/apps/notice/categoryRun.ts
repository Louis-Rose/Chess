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

// During a range run, pages are classified in blocks of this size: one Gemini
// call sees a whole block (in order) so it keeps assembly step numbers
// consistent. Blocks run sequentially per model, carrying the previous block's
// last category forward so the numbering stays consistent across block seams.
const BATCH_SIZE = 5;

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

type BatchResult = {
  category: string;
  reasoning?: string;
  raw?: string;
  boundary?: number | null;
  categoryBelow?: string | null;
};

// Classify one block of pages for one model in a single call, storing results in
// the active run. The model sees the pages in order plus `prevCategory` (the
// category in effect just before the block), so step numbers stay consistent.
// Returns the category in effect at the bottom of the block (to carry to the next
// one), or null. A cancelled request leaves the cells untouched; any other
// failure marks every page of the block as errored for this model (no fallback).
async function classifyBlock(
  docId: string,
  modelId: string,
  pages: number[],
  images: string[],
  prevCategory: string | null,
  signal: AbortSignal,
  t: (k: string) => string,
): Promise<string | null> {
  try {
    const { data } = await axios.post<{ results: BatchResult[] }>(
      '/api/notice/categorize-batch',
      { model: modelId, pages, images, prevCategory },
      { signal },
    );
    const results = data.results || [];
    pages.forEach((n, i) => {
      const r = results[i];
      if (!r) return;
      setResult(
        docId,
        modelId,
        n,
        r.category,
        r.reasoning || '',
        r.raw || '',
        r.boundary ?? null,
        r.categoryBelow ?? null,
      );
    });
    const last = results[results.length - 1];
    return last ? last.categoryBelow || last.category : prevCategory;
  } catch (e) {
    if (axios.isCancel(e)) return prevCategory;
    const msg =
      (axios.isAxiosError(e) && (e.response?.data as { error?: string })?.error) ||
      (e instanceof Error && e.message) ||
      t('notice.err.generic');
    pages.forEach((n) => recordCellError(docId, modelId, n, msg));
    return prevCategory;
  }
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

// Split a list of pages into consecutive blocks of at most `size`.
function chunk<T>(items: T[], size: number): T[][] {
  const blocks: T[][] = [];
  for (let i = 0; i < items.length; i += size) blocks.push(items.slice(i, i + size));
  return blocks;
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
    const total = models.length * pages.length;
    update(docId, { progress: { done: 0, total } });

    // Render each page once, shared across models: cache the promise so two
    // models awaiting the same page don't both render it.
    const renderCache = new Map<number, Promise<string | null>>();
    const renderPage = (n: number) => {
      let p = renderCache.get(n);
      if (!p) {
        p = renderPdfPageToImage(doc, n);
        renderCache.set(n, p);
      }
      return p;
    };

    const blocks = chunk(pages, BATCH_SIZE);
    let done = 0;
    const bump = (by: number) => update(docId, { progress: { done: (done += by), total } });

    // Each model walks its blocks in order, carrying the previous block's last
    // category forward so step numbers stay consistent across seams. The two
    // models run in parallel with each other (independent sequences).
    const runModel = async (modelId: string) => {
      let prevCategory: string | null = null;
      for (const block of blocks) {
        if (signal.aborted) return;
        // Render the block; a page that fails to render is surfaced as a cell
        // error and dropped from the call (the rest still go, mapped by page).
        const pageNums: number[] = [];
        const images: string[] = [];
        for (const n of block) {
          const image = await renderPage(n);
          if (signal.aborted) return;
          if (image) {
            pageNums.push(n);
            images.push(image);
          } else {
            recordCellError(docId, modelId, n, t('notice.err.rendering'));
            bump(1);
          }
        }
        if (pageNums.length === 0) continue;
        bumpActive(docId, 1);
        try {
          prevCategory = await classifyBlock(docId, modelId, pageNums, images, prevCategory, signal, t);
        } finally {
          bumpActive(docId, -1);
        }
        bump(pageNums.length);
      }
    };

    await Promise.all(models.map(runModel));
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
