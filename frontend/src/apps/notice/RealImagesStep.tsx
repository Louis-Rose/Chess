import { useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2, Search, ZoomIn } from 'lucide-react';
import { usePartsRun, type PartItem } from './partsRun';
import { renderPartCrop } from './partCrop';
import { searchPartImages, filterPartImages, type ImageHit } from './realImages';
import { ImageLightbox } from './ImageLightbox';
import { useBrand } from './brandStore';
import { runBtnClass } from './controls';
import { useLanguage } from '../../contexts/LanguageContext';

// Étape 3: find a real photo of each supplied part. The brand is auto-detected
// from the cover; a dropdown lists the parts found in Étape 2 (those with a
// reference). Searching runs one part at a time, then Gemini Flash-Lite filters
// the candidates to real photos of the actual part: kept ones are framed green,
// discarded ones red. The user can click a candidate to flip its verdict, or use
// the corner button to zoom it.
export function RealImagesStep({ file, docId }: { file: Blob; docId: string }) {
  const { t } = useLanguage();
  const { items } = usePartsRun(docId);
  const parts = items.filter((p) => p.ref);
  const { brand } = useBrand(docId);

  const [selectedRef, setSelectedRef] = useState('');
  const [crop, setCrop] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [candidates, setCandidates] = useState<ImageHit[]>([]);
  const [kept, setKept] = useState<boolean[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  const selected = parts.find((p) => p.ref === selectedRef) ?? null;

  // Default the selected part to the first one once parts are available.
  useEffect(() => {
    if (!selectedRef && parts.length) setSelectedRef(parts[0].ref as string);
  }, [parts, selectedRef]);

  // Render the selected part's drawing for side-by-side comparison; clear the
  // previous search when the selection changes.
  useEffect(() => {
    let cancelled = false;
    setCrop(null);
    setCandidates([]);
    setKept([]);
    setError(null);
    if (!selected) return;
    renderPartCrop(file, selected).then((c) => {
      if (!cancelled) setCrop(c);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRef, file]);

  const search = async () => {
    if (!selected?.ref) return;
    setSearching(true);
    setError(null);
    setCandidates([]);
    setKept([]);
    try {
      const imgs = await searchPartImages(selected.ref, brand);
      setCandidates(imgs);
      setKept(imgs.map(() => true)); // provisional until the filter returns
      if (!imgs.length) {
        setError(t('notice.step3.noResults'));
        return;
      }
      // Ask Gemini which candidates are real photos of the actual part.
      setFiltering(true);
      try {
        const keep = await filterPartImages(
          imgs.map((c) => c.thumbnail),
          selected.ref as string,
          brand,
          crop,
        );
        if (keep.length === imgs.length) setKept(keep);
      } catch {
        // non-fatal: leave every candidate kept (the user can still toggle)
      } finally {
        setFiltering(false);
      }
    } catch (e) {
      setError(
        (axios.isAxiosError(e) && (e.response?.data as { error?: string })?.error) ||
          t('notice.err.generic'),
      );
    } finally {
      setSearching(false);
    }
  };

  const toggleKept = (i: number) => setKept((prev) => prev.map((k, j) => (j === i ? !k : k)));

  const label = (p: PartItem) =>
    `${p.ref}${p.bag ? ` (${p.bag}, ${t('notice.pdf.page')} ${p.page})` : ` (${t('notice.pdf.page')} ${p.page})`}`;

  if (!parts.length) {
    return (
      <p className="text-center text-sm text-slate-500 dark:text-slate-400">{t('notice.step3.noParts')}</p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Part picker + search */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <select
          value={selectedRef}
          onChange={(e) => setSelectedRef(e.target.value)}
          className="max-w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        >
          {parts.map((p, i) => (
            <option key={i} value={p.ref as string}>
              {label(p)}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => void search()} disabled={searching || !selected} className={runBtnClass}>
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {t('notice.step3.search')}
        </button>
      </div>

      {error && <p className="text-center text-sm text-rose-600 dark:text-rose-400">{error}</p>}

      {/* Drawing from the manual + candidate web images */}
      <div className="flex flex-col items-center gap-6 md:flex-row md:items-start md:justify-center">
        <div className="shrink-0 text-center">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t('notice.parts.piece')}
          </div>
          <div className="flex h-40 w-40 items-center justify-center rounded-lg border border-slate-300 bg-white p-2 dark:border-slate-700">
            {crop ? (
              <img src={crop} alt="" className="max-h-full max-w-full object-contain" />
            ) : (
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            )}
          </div>
        </div>

        {candidates.length > 0 && (
          <div className="flex flex-col items-center gap-3">
            <p className="flex items-center gap-2 text-center text-xs text-slate-400 dark:text-slate-500">
              {filtering && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {filtering ? t('notice.step3.filtering') : t('notice.step3.filterHint')}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {candidates.map((c, i) => (
                <div key={i} className="flex w-32 flex-col items-center gap-1">
                  <div className="group relative h-32 w-32">
                    <button
                      type="button"
                      onClick={() => toggleKept(i)}
                      title={c.title}
                      className={`flex h-full w-full items-center justify-center overflow-hidden rounded-lg border-2 bg-white p-1 transition-colors ${
                        filtering
                          ? 'border-slate-300 dark:border-slate-700'
                          : kept[i]
                            ? 'border-emerald-500'
                            : 'border-rose-500 opacity-60'
                      }`}
                    >
                      <img
                        src={c.thumbnail}
                        alt={c.title}
                        loading="lazy"
                        className="max-h-full max-w-full object-contain"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => setZoom(c.url)}
                      aria-label={t('notice.pdf.zoom')}
                      title={t('notice.pdf.zoom')}
                      className="absolute right-1 top-1 rounded-md bg-black/45 p-1 text-white opacity-70 transition-opacity hover:bg-black/70 hover:opacity-100"
                    >
                      <ZoomIn className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {c.source && (
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={c.source}
                      className="max-w-full truncate text-xs text-slate-400 hover:text-emerald-500 hover:underline dark:text-slate-500"
                    >
                      {c.source}
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <ImageLightbox src={zoom} alt={selected?.ref ?? undefined} onClose={() => setZoom(null)} />
    </div>
  );
}
