import { Loader2, PackageSearch, Square } from 'lucide-react';
import { CategoryViewer } from './CategoryViewer';
import { PartsTable } from './PartsTable';
import { useCategoryBands } from './categoryBands';
import { extractParts, stopParts, usePartsRun } from './partsRun';
import { useLanguage } from '../../contexts/LanguageContext';

const CATEGORY = 'Matériel fourni';

// Étape 2: the filtered "Matériel fourni" viewer, plus a button that runs Gemini
// over those pages to extract the supplied-parts list (quantity, optional ref /
// bag, and a cropped image of each piece), shown in a table underneath.
export function MaterialStep({ file, docId }: { file: Blob; docId: string }) {
  const { t } = useLanguage();
  const bands = useCategoryBands(docId, CATEGORY);
  const { busy, items, error } = usePartsRun(docId);

  const btnClass =
    'flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:border-emerald-500 hover:bg-emerald-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-emerald-500/10';
  const stopBtnClass =
    'flex items-center gap-2 rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 shadow-sm transition-colors hover:border-rose-500 hover:bg-rose-50 dark:border-rose-500/40 dark:bg-slate-800 dark:text-rose-300 dark:hover:bg-rose-500/10';

  return (
    <div className="flex flex-col gap-6">
      <CategoryViewer file={file} docId={docId} category={CATEGORY} />

      {bands.pages.length > 0 && (
        <div className="flex justify-center">
          {busy ? (
            <button type="button" onClick={() => stopParts(docId)} className={stopBtnClass}>
              <Square className="h-4 w-4" />
              {t('notice.cat.stop')}
            </button>
          ) : (
            <button type="button" onClick={() => void extractParts(docId, file, bands, t)} className={btnClass}>
              <PackageSearch className="h-4 w-4" />
              {t('notice.parts.run')}
            </button>
          )}
          {busy && <Loader2 className="ml-2 h-5 w-5 animate-spin self-center text-emerald-600 dark:text-emerald-400" />}
        </div>
      )}

      {error && <p className="text-center text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      {items.length > 0 && <PartsTable file={file} items={items} />}
    </div>
  );
}
