import { useCallback, useSyncExternalStore } from 'react';
import axios from 'axios';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import { renderPdfPageBand } from './pdfRender';
import type { StepBand } from './categoryBands';

// The per-assembly-step instruction extraction for a document. Like partsRun, it
// lives at module scope (keyed by document id) so it survives leaving and
// returning to the reader tab, and is persisted to localStorage. One latest
// result per doc (no history): re-running replaces it.

// One language's transcribed instruction text for a step. `lang` is a short
// language code (ISO 639-1) or null when the model couldn't name the language.
export type InstrEntry = { lang: string | null; text: string };

// step category ("Assemblage - Etape N") -> its instructions, one per language.
type ByStep = Record<string, InstrEntry[]>;

type Snapshot = {
  busy: boolean;
  instructions: ByStep;
  // The model's reasoning per step (shown in that step's tooltip).
  reasoning: Record<string, string>;
  error: string | null;
  // Step bands done / total while extracting (null when idle).
  progress: { done: number; total: number } | null;
};
type Entry = { snapshot: Snapshot; controller: AbortController | null; listeners: Set<() => void> };

const entries = new Map<string, Entry>();
const instrKey = (docId: string) => `notice.instr.${docId}`;
const reasonKey = (docId: string) => `notice.instrReason.${docId}`;

function loadStore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    const val = raw ? (JSON.parse(raw) as T) : fallback;
    return val && typeof val === 'object' ? val : fallback;
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

function getEntry(docId: string): Entry {
  let entry = entries.get(docId);
  if (!entry) {
    entry = {
      snapshot: {
        busy: false,
        instructions: loadStore<ByStep>(instrKey(docId), {}),
        reasoning: loadStore<Record<string, string>>(reasonKey(docId), {}),
        error: null,
        progress: null,
      },
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

// Merge a step's languages across its pages: same language on two pages has its
// text concatenated (a step's text can span pages), never duplicated.
function mergeEntries(existing: InstrEntry[], incoming: InstrEntry[]): InstrEntry[] {
  const byLang = new Map<string, InstrEntry>();
  const order: string[] = [];
  for (const e of [...existing, ...incoming]) {
    const key = e.lang || '?';
    const cur = byLang.get(key);
    if (!cur) {
      byLang.set(key, { lang: e.lang, text: e.text });
      order.push(key);
    } else if (!cur.text.includes(e.text)) {
      cur.text = `${cur.text}\n${e.text}`;
    }
  }
  return order.map((k) => byLang.get(k) as InstrEntry);
}

// Extract every assembly step's written instructions, one Gemini call per step
// band (a step may span several pages/bands). Results stream in step by step,
// replacing any previous extraction, and are keyed by the step's category so the
// UI can line them up with Étape 1's classification.
export async function extractInstructions(
  docId: string,
  file: Blob,
  steps: StepBand[],
  model: string,
  t: (k: string) => string,
) {
  const entry = getEntry(docId);
  if (entry.snapshot.busy) return;
  if (!model || steps.length === 0) {
    update(docId, { error: t('notice.cat2.noRun') });
    return;
  }

  const controller = new AbortController();
  entry.controller = controller;
  const { signal } = controller;
  const total = steps.reduce((sum, s) => sum + s.pages.length, 0);
  update(docId, { busy: true, error: null, instructions: {}, reasoning: {}, progress: { done: 0, total } });
  saveStore(instrKey(docId), {});
  saveStore(reasonKey(docId), {});

  let loadingTask: PDFDocumentLoadingTask | null = null;
  try {
    const buf = await file.arrayBuffer();
    loadingTask = pdfjsLib.getDocument({ data: buf });
    const doc: PDFDocumentProxy = await loadingTask.promise;
    const instructions: ByStep = {};
    const reasoning: Record<string, string> = {};
    let done = 0;

    for (const step of steps) {
      if (signal.aborted) break;
      instructions[step.category] = instructions[step.category] || [];
      for (const page of step.pages) {
        if (signal.aborted) break;
        const band = step.bands[page] ?? { top: 0, bottom: 1 };
        const image = await renderPdfPageBand(doc, page, band.top, band.bottom);
        if (signal.aborted) break;
        if (!image) {
          update(docId, { progress: { done: ++done, total } });
          continue;
        }

        const { data } = await axios.post<{ instructions: InstrEntry[]; reasoning?: string }>(
          '/api/notice/instructions',
          { model, image, page },
          { signal },
        );

        instructions[step.category] = mergeEntries(instructions[step.category], data.instructions || []);
        if (data.reasoning) {
          reasoning[step.category] = reasoning[step.category]
            ? `${reasoning[step.category]}\n${data.reasoning}`
            : data.reasoning;
        }
        saveStore(instrKey(docId), instructions);
        saveStore(reasonKey(docId), reasoning);
        update(docId, {
          instructions: { ...instructions },
          reasoning: { ...reasoning },
          progress: { done: ++done, total },
        });
      }
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

export function stopInstructions(docId: string) {
  getEntry(docId).controller?.abort();
}

export function useInstructionsRun(docId: string): Snapshot {
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
