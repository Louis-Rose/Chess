import { Loader2, PackageSearch, Square } from 'lucide-react';
import { CategoryViewer } from './CategoryViewer';
import { PartsTable } from './PartsTable';
import { useCategoryBands } from './categoryBands';
import { extractParts, stopParts, usePartsRun } from './partsRun';
import { runBtnClass, stopBtnClass } from './controls';
import { useLanguage } from '../../contexts/LanguageContext';

const CATEGORY = 'Matériel fourni';

// Étape 2: the filtered "Matériel fourni" viewer, plus a button that runs Gemini
// over those pages to extract the supplied-parts list (quantity, optional ref /
// bag, and a cropped image of each piece), shown in a table underneath. The run
// control mirrors Étape 1: a spinner + "done/total" page counter, plus a Stop
// button while busy.
export function MaterialStep({ file, docId }: { file: Blob; docId: string }) {
  const { t } = useLanguage();
  const bands = useCategoryBands(docId, CATEGORY);
  const { busy, progress, items, error } = usePartsRun(docId);

  const progressSuffix = busy && progress ? ` · ${progress.done}/${progress.total}` : '';

  return (
    <div className="flex flex-col gap-6">
      <CategoryViewer file={file} docId={docId} category={CATEGORY} />

      {bands.pages.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => void extractParts(docId, file, bands, t)}
            disabled={busy}
            className={runBtnClass}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageSearch className="h-4 w-4" />}
            {t('notice.parts.run')}
            {progressSuffix}
          </button>
          {busy && (
            <button type="button" onClick={() => stopParts(docId)} className={stopBtnClass}>
              <Square className="h-4 w-4" />
              {t('notice.cat.stop')}
            </button>
          )}
        </div>
      )}

      {error && <p className="text-center text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      {items.length > 0 && <PartsTable file={file} items={items} />}
    </div>
  );
}
