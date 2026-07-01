import { useMemo } from 'react';
import { NOTICE_MODELS } from './models';
import { useRun, type Segment } from './categoryRun';

// The pages (and, for partial pages, the vertical band) of a given category in
// the selected run, taken from the authoritative model (the first model, in
// display order, that has results). Shared by the filtered viewer (Étape 2) and
// the parts extractor so both scope to the exact same regions.
export type Bands = {
  pages: number[];
  bands: Record<number, { top: number; bottom: number }>;
  model: string | null;
};

type SegmentsMap = Record<string, Record<number, Segment[]>>;

// The authoritative model of a run: the first, in display order, that produced
// any segments. Everything derived from the classification reads this one model.
function authoritativeModel(segments: SegmentsMap): string | null {
  return NOTICE_MODELS.find((m) => segments[m.id] && Object.keys(segments[m.id]).length)?.id ?? null;
}

// The pages and partial-page bands covered by one exact category in one model's
// segments. A segment spans from its start to the next segment's start (or the
// page bottom); a page keeps a band only when the category doesn't fill it.
function bandsForCategory(byPage: Record<number, Segment[]>, category: string) {
  const pages: number[] = [];
  const bands: Record<number, { top: number; bottom: number }> = {};
  for (const pageStr of Object.keys(byPage)) {
    const page = Number(pageStr);
    const segs = byPage[page];
    let top = 1;
    let bottom = 0;
    let found = false;
    segs.forEach((s, i) => {
      if (s.category !== category) return;
      top = Math.min(top, s.start);
      bottom = Math.max(bottom, i + 1 < segs.length ? segs[i + 1].start : 1);
      found = true;
    });
    if (found) {
      pages.push(page);
      if (top > 0 || bottom < 1) bands[page] = { top, bottom };
    }
  }
  pages.sort((a, b) => a - b);
  return { pages, bands };
}

export function useCategoryBands(docId: string, category: string): Bands {
  const { segments } = useRun(docId);
  return useMemo(() => {
    const model = authoritativeModel(segments);
    if (!model) return { pages: [], bands: {}, model: null };
    return { ...bandsForCategory(segments[model], category), model };
  }, [segments, category]);
}

// An assembly step ("Assemblage - Etape N") and the region it covers, so a step's
// pages/bands can be rendered and read like any other category.
const STEP_RE = /^Assemblage - Etape (\d+)$/;
export type StepBand = Bands & { category: string; num: number };

// Every assembly step present in the selected run, in printed order, each with
// its pages/bands. Empty until the classification (Étape 1) has run.
export function useAssemblySteps(docId: string): { model: string | null; steps: StepBand[] } {
  const { segments } = useRun(docId);
  return useMemo(() => {
    const model = authoritativeModel(segments);
    if (!model) return { model: null, steps: [] };
    const byPage = segments[model];
    const nums = new Map<string, number>();
    for (const pageStr of Object.keys(byPage)) {
      for (const s of byPage[Number(pageStr)]) {
        const m = STEP_RE.exec(s.category);
        if (m) nums.set(s.category, Number(m[1]));
      }
    }
    const steps = [...nums.entries()]
      .map(([category, num]) => ({ category, num, model, ...bandsForCategory(byPage, category) }))
      .sort((a, b) => a.num - b.num);
    return { model, steps };
  }, [segments]);
}
