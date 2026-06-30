import { useMemo } from 'react';
import { NOTICE_MODELS } from './models';
import { useRun } from './categoryRun';

// The pages (and, for partial pages, the vertical band) of a given category in
// the selected run, taken from the authoritative model (the first model, in
// display order, that has results). Shared by the filtered viewer (Étape 2) and
// the parts extractor so both scope to the exact same regions.
export type Bands = {
  pages: number[];
  bands: Record<number, { top: number; bottom: number }>;
  model: string | null;
};

export function useCategoryBands(docId: string, category: string): Bands {
  const { segments } = useRun(docId);
  return useMemo(() => {
    const model =
      NOTICE_MODELS.find((m) => segments[m.id] && Object.keys(segments[m.id]).length)?.id ?? null;
    const pages: number[] = [];
    const bands: Record<number, { top: number; bottom: number }> = {};
    if (model) {
      const byPage = segments[model];
      for (const pageStr of Object.keys(byPage)) {
        const page = Number(pageStr);
        const segs = byPage[page];
        // The matching segments and the smallest band covering them (a segment
        // spans from its start to the next segment's start, or the page bottom).
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
    }
    return { pages, bands, model };
  }, [segments, category]);
}
