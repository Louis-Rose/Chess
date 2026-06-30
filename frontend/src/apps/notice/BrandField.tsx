import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { ensureBrand, runDetect, setBrand, useBrand } from './brandStore';
import { useLanguage } from '../../contexts/LanguageContext';

// The manual's brand: auto-detected from the cover (Étape 1), editable, and
// reused by Étape 3's part image search. Shown as "Marque : [field] Détecter".
export function BrandField({ file, docId }: { file: Blob; docId: string }) {
  const { t } = useLanguage();
  const { brand, detecting } = useBrand(docId);

  useEffect(() => {
    ensureBrand(docId, file);
  }, [docId, file]);

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <span className="text-sm text-slate-600 dark:text-slate-300">{t('notice.step3.brand')}</span>
      <input
        value={brand}
        onChange={(e) => setBrand(docId, e.target.value)}
        className="w-48 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
      />
      <button
        type="button"
        onClick={() => void runDetect(docId, file)}
        disabled={detecting}
        className="text-sm font-medium text-emerald-600 hover:underline disabled:opacity-50 dark:text-emerald-400"
      >
        {detecting ? <Loader2 className="inline h-4 w-4 animate-spin" /> : t('notice.step3.detect')}
      </button>
    </div>
  );
}
