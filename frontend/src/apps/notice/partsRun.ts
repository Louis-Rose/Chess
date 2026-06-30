import { useCallback, useSyncExternalStore } from 'react';
import axios from 'axios';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import { renderPdfPageBand } from './pdfRender';
import type { Bands } from './categoryBands';

// The supplied-parts extraction for a document. Like categoryRun, it lives at
// module scope (keyed by document id) so it survives leaving and returning to
// the reader tab, and is persisted to localStorage. One latest result per doc
// (no history): re-running replaces it.

// One extracted part. `bbox` is PAGE-relative (x0,y0,x1,y1 in 0..1 from the top
// left of the page), so the table can crop it straight from the rendered page.
export type PartItem = {
  page: number;
  bbox: [number, number, number, number];
  // null when no count is printed (e.g. an overview thumbnail of all parts).
  qty: number | null;
  ref: string | null;
  bag: string | null;
};

// Collapse the false duplicates that come from a part appearing on more than one
// "Matériel fourni" section (an overview thumbnail without counts, plus the
// detailed list with quantities and reference numbers):
//   - drop overview entries: no quantity AND no reference,
//   - dedup by reference, keeping the entry that carries a quantity.
function dedupeParts(items: PartItem[]): PartItem[] {
  const real = items.filter((p) => p.qty != null || p.ref);
  const keptByRef = new Map<string, PartItem>();
  const out: PartItem[] = [];
  for (const p of real) {
    if (!p.ref) {
      out.push(p);
      continue;
    }
    const existing = keptByRef.get(p.ref);
    if (!existing) {
      keptByRef.set(p.ref, p);
      out.push(p);
    } else if (existing.qty == null && p.qty != null) {
      out[out.indexOf(existing)] = p; // prefer the appearance that has a count
      keptByRef.set(p.ref, p);
    }
  }
  return out;
}

type Snapshot = {
  busy: boolean;
  items: PartItem[];
  error: string | null;
  // The model's reasoning per page (shown in the PAGE row's tooltip).
  reasoning: Record<number, string>;
  // Pages done / total while extracting (null when idle), shown like Étape 1.
  progress: { done: number; total: number } | null;
};
type Entry = { snapshot: Snapshot; controller: AbortController | null; listeners: Set<() => void> };

const entries = new Map<string, Entry>();
const partsKey = (docId: string) => `notice.parts.${docId}`;
const reasonKey = (docId: string) => `notice.partsReason.${docId}`;

function loadItems(docId: string): PartItem[] {
  try {
    const raw = localStorage.getItem(partsKey(docId));
    const items = raw ? (JSON.parse(raw) as PartItem[]) : [];
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function saveItems(docId: string, items: PartItem[]) {
  try {
    localStorage.setItem(partsKey(docId), JSON.stringify(items));
  } catch {
    // ignore quota / serialization errors
  }
}

function loadReason(docId: string): Record<number, string> {
  try {
    const raw = localStorage.getItem(reasonKey(docId));
    const obj = raw ? (JSON.parse(raw) as Record<number, string>) : {};
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

function saveReason(docId: string, reasoning: Record<number, string>) {
  try {
    localStorage.setItem(reasonKey(docId), JSON.stringify(reasoning));
  } catch {
    // ignore quota / serialization errors
  }
}

function getEntry(docId: string): Entry {
  let entry = entries.get(docId);
  if (!entry) {
    entry = {
      snapshot: { busy: false, items: loadItems(docId), error: null, reasoning: loadReason(docId), progress: null },
      controller: null,
      listeners: new Set(),
    };
    entries.set(docId, entry);
  }
  return entry;
}

function update(docId: string, patch: Partial<Snapshot>) {
  const entry = getEntry(docId);
  entry.snapshot = { ...entry.snapshot, ...patch };
  entry.listeners.forEach((l) => l());
}

// Extract the parts list from the category's pages (in `bands`), one Gemini call
// per page. The page band is rendered and posted; each returned box (relative to
// the band) is converted to page-relative coordinates and accumulated. Results
// stream in page by page, replacing any previous extraction.
export async function extractParts(docId: string, file: Blob, bands: Bands, t: (k: string) => string) {
  const entry = getEntry(docId);
  if (entry.snapshot.busy) return;
  if (!bands.model || bands.pages.length === 0) {
    update(docId, { error: t('notice.cat2.noRun') });
    return;
  }

  const controller = new AbortController();
  entry.controller = controller;
  const { signal } = controller;
  update(docId, { busy: true, error: null, items: [], reasoning: {}, progress: { done: 0, total: bands.pages.length } });
  saveItems(docId, []);
  saveReason(docId, {});

  let loadingTask: PDFDocumentLoadingTask | null = null;
  try {
    const buf = await file.arrayBuffer();
    loadingTask = pdfjsLib.getDocument({ data: buf });
    const doc: PDFDocumentProxy = await loadingTask.promise;
    const items: PartItem[] = [];
    const reasoning: Record<number, string> = {};
    let done = 0;
    const total = bands.pages.length;

    for (const page of bands.pages) {
      if (signal.aborted) break;
      const band = bands.bands[page] ?? { top: 0, bottom: 1 };
      const image = await renderPdfPageBand(doc, page, band.top, band.bottom);
      if (signal.aborted) break;
      if (!image) {
        update(docId, { progress: { done: ++done, total } });
        continue;
      }

      const { data } = await axios.post<{
        parts: { bbox: [number, number, number, number]; qty: number | null; ref: string | null; bag: string | null }[];
        reasoning?: string;
      }>('/api/notice/parts', { model: bands.model, image, page }, { signal });

      reasoning[page] = data.reasoning || '';
      const span = band.bottom - band.top;
      for (const p of data.parts || []) {
        const [bx0, by0, bx1, by1] = p.bbox;
        items.push({
          page,
          // box is relative to the band image; map y back onto the full page.
          bbox: [bx0, band.top + by0 * span, bx1, band.top + by1 * span],
          qty: p.qty ?? null,
          ref: p.ref ?? null,
          bag: p.bag ?? null,
        });
      }
      // Show the deduplicated list (false duplicates collapsed across pages).
      const shown = dedupeParts(items);
      saveItems(docId, shown);
      saveReason(docId, { ...reasoning });
      update(docId, { items: shown, reasoning: { ...reasoning }, progress: { done: ++done, total } });
    }
  } catch (e) {
    if (!axios.isCancel(e)) {
      const msg =
        (axios.isAxiosError(e) && (e.response?.data as { error?: string })?.error) ||
        (e instanceof Error && e.message) ||
        t('notice.err.generic');
      update(docId, { error: msg });
    }
  } finally {
    entry.controller = null;
    update(docId, { busy: false, progress: null });
    void loadingTask?.destroy();
  }
}

export function stopParts(docId: string) {
  getEntry(docId).controller?.abort();
}

export function usePartsRun(docId: string): Snapshot {
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
