import { useMemo } from 'react';
import { PdfViewer, type ViewerFilter } from './PdfViewer';
import { useCategoryBands } from './categoryBands';
import { useRun } from './categoryRun';
import { useLanguage } from '../../contexts/LanguageContext';

// Étape 2+ : show only the pages (or page sections) classified as one category,
// reusing the same PDF viewer in filter mode. A page only partly in the category
// is shown with the rest blacked out.
export function CategoryViewer({
  file,
  docId,
  category,
}: {
  file: Blob;
  docId: string;
  category: string;
}) {
  const { runs } = useRun(docId);
  const { pages, bands } = useCategoryBands(docId, category);
  const { t } = useLanguage();
  const filter = useMemo<ViewerFilter>(() => ({ pages, bands }), [pages, bands]);

  if (!runs.length) {
    return (
      <p className="text-center text-sm text-slate-500 dark:text-slate-400">{t('notice.cat2.noRun')}</p>
    );
  }
  if (pages.length === 0) {
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
