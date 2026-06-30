import { useMemo } from 'react';
import { PdfViewer, type ViewerFilter } from './PdfViewer';
import { NOTICE_MODELS } from './models';
import { useRun } from './categoryRun';
import { useLanguage } from '../../contexts/LanguageContext';

// Étape 2+ : show only the pages (or page sections) classified as one category,
// reusing the same PDF viewer in filter mode. A page only partly in the category
// is shown with the rest blacked out. The classification comes from the selected
// run's authoritative model (the first model, in display order, that has results).
export function CategoryViewer({
  file,
  docId,
  category,
}: {
  file: Blob;
  docId: string;
  category: string;
}) {
  const { segments, runs } = useRun(docId);
  const { t } = useLanguage();

  const filter = useMemo<ViewerFilter>(() => {
    const model = NOTICE_MODELS.find((m) => segments[m.id] && Object.keys(segments[m.id]).length)?.id;
    const pages: number[] = [];
    const bands: Record<number, { top: number; bottom: number }> = {};
    if (model) {
      const byPage = segments[model];
      for (const pageStr of Object.keys(byPage)) {
        const page = Number(pageStr);
        const segs = byPage[page];
        // The matching segments on this page; a segment spans from its start to
        // the next segment's start (or the page bottom). Keep the smallest span
        // that covers all matches, so a partial page only shows that band.
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
    return { pages, bands };
  }, [segments, category]);

  if (!runs.length) {
    return (
      <p className="text-center text-sm text-slate-500 dark:text-slate-400">{t('notice.cat2.noRun')}</p>
    );
  }
  if (filter.pages.length === 0) {
    return (
      <p className="text-center text-sm text-slate-500 dark:text-slate-400">{t('notice.cat2.empty')}</p>
    );
  }

  return (
    <div className="mx-auto h-[60vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-800/30 dark:shadow-none md:h-[80vh]">
      <PdfViewer key={`${docId}-${category}`} file={file} docId={docId} filter={filter} />
    </div>
  );
}
