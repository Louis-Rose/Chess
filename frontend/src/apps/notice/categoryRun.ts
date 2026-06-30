import { useCallback, useSyncExternalStore } from 'react';
import axios from 'axios';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import { NOTICE_MODELS } from './models';
import { renderPdfPageToImage } from './pdfRender';

// The page-range categorize run lives here, at module scope, instead of inside
// the CategoryTable component. The reader (NoticeViewer) is a React Router route,
// so navigating to another tab (Notes MVP, Library) unmounts it and its PdfViewer,
// which destroys the PDF.js document. A run kept in component state would lose its
// progress UI and its document on every such navigation. Holding it here — keyed
// by document id, with its own PDF.js document — lets a run keep going (and keep
// reporting) while the user is on another tab, and lets the table re-attach to the
// live run when they come back.

// How many pages to classify at once during a range run. Each page already
// fans out across the models, so this caps total in-flight Gemini requests
// (pages x models) to keep clear of rate limits.
const PAGE_CONCURRENCY = 5;

// model id -> page number -> category label (or per-cell error message)
type ByModelPage = Record<string, Record<number, string>>;

// A mid-page section change: `y` is the boundary (0..1 from the top), `above` and
// `below` the categories on each side. model id -> page number -> split.
export type Split = { y: number; above: string; below: string };
type SplitMap = Record<string, Record<number, Split>>;

export type RunSnapshot = {
  busy: null | 'range';
  progress: { done: number; total: number } | null;
  // Pages currently rendering/classifying, so the UI can show that several run at
  // once rather than reading as one-by-one.
  active: number;
  // Categories are remembered per PDF in this browser so they survive reloads;
  // each (page, model) keeps only its most recent result. A page split into two
  // sections is stored as "Above / Below".
  categories: ByModelPage;
  // Thought summary behind each (page, model) classification (empty for models
  // that don't reason). Persisted alongside the categories.
  reasoning: ByModelPage;
  // The model's raw reply text for each (page, model). Persisted.
  raws: ByModelPage;
  // Structured mid-page boundaries, used to draw the separator on the PDF. Only
  // present for pages the model split. Persisted alongside the categories.
  splits: SplitMap;
  // Per-cell failures, shown in the table instead of silently blanking the cell.
  // Transient, not persisted.
  cellErrors: ByModelPage;
  // A page the user asked the viewer to jump to (e.g. by clicking a table row).
  // The viewer applies it then clears it. Transient.
  requestedPage: number | null;
  // Models the user has muted (by clicking a model name): greyed out in the
  // tables and hidden on the PDF. Persisted.
  disabledModels: string[];
  error: string | null;
};

type Entry = {
  snapshot: RunSnapshot;
  controller: AbortController | null;
  listeners: Set<() => void>;
};

const entries = new Map<string, Entry>();

// Categories (and their reasoning) are persisted per document id so they survive
// reloads, each under its own key.
const mapKey = (docId: string) => `notice.categories.${docId}`;
const reasoningKey = (docId: string) => `notice.reasoning.${docId}`;
const rawsKey = (docId: string) => `notice.raws.${docId}`;
const splitsKey = (docId: string) => `notice.splits.${docId}`;
const disabledKey = (docId: string) => `notice.disabled.${docId}`;

function loadStore<T>(key: string): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : ({} as T);
  } catch {
    return {} as T;
  }
}

function saveStore(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota / serialization errors
  }
}

function getEntry(docId: string): Entry {
  let entry = entries.get(docId);
  if (!entry) {
    entry = {
      snapshot: {
        busy: null,
        progress: null,
        active: 0,
        categories: loadStore<ByModelPage>(mapKey(docId)),
        reasoning: loadStore<ByModelPage>(reasoningKey(docId)),
        raws: loadStore<ByModelPage>(rawsKey(docId)),
        splits: loadStore<SplitMap>(splitsKey(docId)),
        cellErrors: {},
        requestedPage: null,
        disabledModels: (() => {
          const v = loadStore<string[]>(disabledKey(docId));
          return Array.isArray(v) ? v : [];
        })(),
        error: null,
      },
      controller: null,
      listeners: new Set(),
    };
    entries.set(docId, entry);
  }
  return entry;
}

// Replace a document's snapshot (immutably, so useSyncExternalStore sees a new
// reference) and notify subscribers.
function update(docId: string, patch: Partial<RunSnapshot>) {
  const entry = getEntry(docId);
  entry.snapshot = { ...entry.snapshot, ...patch };
  entry.listeners.forEach((l) => l());
}

// Record one (model, page) result, keeping only the most recent, persist it, and
// clear any earlier failure for that cell. The thought summary (may be empty) is
// stored alongside. When `boundary`/`categoryBelow` describe a mid-page section
// change, the cell label becomes "Above / Below" and a structured split is kept
// for the PDF separator; otherwise any earlier split for the cell is dropped.
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
  const snap = getEntry(docId).snapshot;
  const split = boundary != null && categoryBelow ? { y: boundary, above: category, below: categoryBelow } : null;
  const label = split ? `${category} / ${categoryBelow}` : category;

  const nextCats: ByModelPage = { ...snap.categories };
  nextCats[modelId] = { ...(nextCats[modelId] || {}), [pageNum]: label };
  saveStore(mapKey(docId), nextCats);

  const nextReasoning: ByModelPage = { ...snap.reasoning };
  nextReasoning[modelId] = { ...(nextReasoning[modelId] || {}), [pageNum]: reasoning };
  saveStore(reasoningKey(docId), nextReasoning);

  const nextRaws: ByModelPage = { ...snap.raws };
  nextRaws[modelId] = { ...(nextRaws[modelId] || {}), [pageNum]: raw };
  saveStore(rawsKey(docId), nextRaws);

  const nextSplits: SplitMap = { ...snap.splits, [modelId]: { ...(snap.splits[modelId] || {}) } };
  if (split) nextSplits[modelId][pageNum] = split;
  else delete nextSplits[modelId][pageNum];
  saveStore(splitsKey(docId), nextSplits);

  update(docId, {
    categories: nextCats,
    reasoning: nextReasoning,
    raws: nextRaws,
    splits: nextSplits,
    cellErrors: clearCell(snap.cellErrors, modelId, pageNum),
  });
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

// Classify one page image across every model, storing results per (model, page).
// A cancelled request (the user pressed Stop) leaves the cell untouched; any other
// failure is surfaced in the cell.
async function classify(
  docId: string,
  image: string,
  pageNum: number,
  signal: AbortSignal,
  t: (k: string) => string,
) {
  await Promise.all(
    NOTICE_MODELS.map(async (m) => {
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

// Classify a contiguous span of pages (from..to, inclusive) with a bounded pool
// of workers pulling from a shared cursor, so several pages render and call out
// at once without flooding the API. The run owns its own PDF.js document (loaded
// from the stored blob) so it is independent of the on-screen viewer and survives
// navigating away from the reader.
export async function startRange(
  docId: string,
  file: Blob,
  from: number,
  to: number,
  t: (k: string) => string,
) {
  const entry = getEntry(docId);
  if (entry.snapshot.busy) return;
  update(docId, { busy: 'range', error: null, progress: null, active: 0 });
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
    update(docId, { busy: null, progress: null, active: 0 });
    void loadingTask?.destroy();
  }
}

export function stopRun(docId: string) {
  getEntry(docId).controller?.abort();
}

// Ask the viewer to jump to a page (or clear the request with null). The viewer
// reads this from its snapshot, navigates, then clears it.
export function requestPage(docId: string, page: number | null) {
  update(docId, { requestedPage: page });
}

// Mute / unmute a model (clicking its name): greys it out in the tables and
// hides its boundary lines on the PDF. Persisted per document.
export function toggleModel(docId: string, modelId: string) {
  const current = getEntry(docId).snapshot.disabledModels;
  const next = current.includes(modelId)
    ? current.filter((id) => id !== modelId)
    : [...current, modelId];
  saveStore(disabledKey(docId), next);
  update(docId, { disabledModels: next });
}

// Subscribe a component to a document's run state. getSnapshot returns a stable
// reference until the next update, so React only re-renders on real changes.
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
