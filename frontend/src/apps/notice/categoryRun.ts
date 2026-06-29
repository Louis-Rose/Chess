import { useCallback, useSyncExternalStore } from 'react';
import axios from 'axios';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import { NOTICE_MODELS } from './models';
import { renderPdfPageToImage } from './pdfRender';

// The "find all" categorize run lives here, at module scope, instead of inside
// the CategoryTable component. The reader (NoticeViewer) is a React Router route,
// so navigating to another tab (Notes MVP, Library) unmounts it and its PdfViewer,
// which destroys the PDF.js document. A run kept in component state would lose its
// progress UI and its document on every such navigation. Holding it here — keyed
// by document id, with its own PDF.js document — lets a run keep going (and keep
// reporting) while the user is on another tab, and lets the table re-attach to the
// live run when they come back.

// How many pages to classify at once during a "find all" run. Each page already
// fans out across the models, so this caps total in-flight Gemini requests
// (pages x models) to keep clear of rate limits.
const PAGE_CONCURRENCY = 5;

// model id -> page number -> category label (or per-cell error message)
type ByModelPage = Record<string, Record<number, string>>;

export type RunSnapshot = {
  busy: null | 'this' | 'all';
  progress: { done: number; total: number } | null;
  // Pages currently rendering/classifying, so the UI can show that several run at
  // once rather than reading as one-by-one.
  active: number;
  // Categories are remembered per PDF in this browser so they survive reloads;
  // each (page, model) keeps only its most recent result.
  categories: ByModelPage;
  // Per-cell failures, shown in the table instead of silently blanking the cell.
  // Transient, not persisted.
  cellErrors: ByModelPage;
  error: string | null;
};

type Entry = {
  snapshot: RunSnapshot;
  controller: AbortController | null;
  listeners: Set<() => void>;
};

const entries = new Map<string, Entry>();

// Categories are persisted per document id so they survive reloads.
const mapKey = (docId: string) => `notice.categories.${docId}`;

function loadCategories(docId: string): ByModelPage {
  try {
    const raw = localStorage.getItem(mapKey(docId));
    return raw ? (JSON.parse(raw) as ByModelPage) : {};
  } catch {
    return {};
  }
}

function saveCategories(docId: string, value: ByModelPage) {
  try {
    localStorage.setItem(mapKey(docId), JSON.stringify(value));
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
        categories: loadCategories(docId),
        cellErrors: {},
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
// clear any earlier failure for that cell.
function setResult(docId: string, modelId: string, pageNum: number, category: string) {
  const { categories, cellErrors } = getEntry(docId).snapshot;
  const nextCats: ByModelPage = { ...categories };
  nextCats[modelId] = { ...(nextCats[modelId] || {}), [pageNum]: category };
  saveCategories(docId, nextCats);
  update(docId, { categories: nextCats, cellErrors: clearCell(cellErrors, modelId, pageNum) });
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
        const { data } = await axios.post<{ category: string }>(
          '/api/notice/categorize',
          { image, model: m.id },
          { signal },
        );
        setResult(docId, m.id, pageNum, data.category);
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

// Classify just the current on-screen page. The image is captured by the caller
// (it needs the live canvas), then handed to the shared run state so the busy
// indicator is the same one the table reads.
export async function startThisPage(
  docId: string,
  image: string,
  pageNum: number,
  t: (k: string) => string,
) {
  const entry = getEntry(docId);
  if (entry.snapshot.busy) return;
  update(docId, { busy: 'this', error: null });
  const controller = new AbortController();
  entry.controller = controller;
  try {
    await classify(docId, image, pageNum, controller.signal, t);
  } finally {
    entry.controller = null;
    update(docId, { busy: null });
  }
}

// Classify every page with a bounded pool of workers pulling from a shared cursor,
// so several pages render and call out at once without flooding the API. The run
// owns its own PDF.js document (loaded from the stored blob) so it is independent
// of the on-screen viewer and survives navigating away from the reader.
export async function startAll(docId: string, file: Blob, t: (k: string) => string) {
  const entry = getEntry(docId);
  if (entry.snapshot.busy) return;
  update(docId, { busy: 'all', error: null, progress: null, active: 0 });
  const controller = new AbortController();
  entry.controller = controller;
  const { signal } = controller;

  let loadingTask: PDFDocumentLoadingTask | null = null;
  try {
    const buf = await file.arrayBuffer();
    loadingTask = pdfjsLib.getDocument({ data: buf });
    const doc: PDFDocumentProxy = await loadingTask.promise;
    const numPages = doc.numPages;
    if (numPages < 1) return;
    update(docId, { progress: { done: 0, total: numPages } });

    let nextPage = 1;
    let done = 0;
    const worker = async () => {
      for (let n = nextPage++; n <= numPages && !signal.aborted; n = nextPage++) {
        bumpActive(docId, 1);
        try {
          const image = await renderPdfPageToImage(doc, n);
          if (signal.aborted) return;
          if (image) await classify(docId, image, n, signal, t);
          update(docId, { progress: { done: ++done, total: numPages } });
        } finally {
          bumpActive(docId, -1);
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(PAGE_CONCURRENCY, numPages) }, worker));
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

// Surface a run-level error (e.g. the current page could not be rendered) on the
// shared state so it shows whether or not a run is in flight.
export function setRunError(docId: string, message: string) {
  update(docId, { error: message });
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
