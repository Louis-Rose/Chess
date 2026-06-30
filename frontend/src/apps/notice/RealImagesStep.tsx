import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Loader2, Search, ZoomIn } from 'lucide-react';
import { usePartsRun, type PartItem } from './partsRun';
import { renderPartCrop } from './partCrop';
import { searchPartImages, filterPartImages, loadResult, loadResults, saveResult, type ImageHit } from './realImages';
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
  // Whether the selected part has a result (even an empty one), to tell "not
  // searched yet" from "searched, no photos".
  const [searched, setSearched] = useState(false);
  const [candidates, setCandidates] = useState<ImageHit[]>([]);
  const [kept, setKept] = useState<boolean[]>([]);
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  const selected = parts.find((p) => p.ref === selectedRef) ?? null;

  // Latest brand / selection, read inside the long-running batch without making
  // it a dependency (which would restart it).
  const brandRef = useRef(brand);
  brandRef.current = brand;
  const selectedRefRef = useRef(selectedRef);
  selectedRefRef.current = selectedRef;

  // Default the selected part to the first one once parts are available.
  useEffect(() => {
    if (!selectedRef && parts.length) setSelectedRef(parts[0].ref as string);
  }, [parts, selectedRef]);

  // Search + triage one part and persist it. No UI state, so it's shared by the
  // manual search and the auto-run batch. `refImage` (the part drawing) is sent
  // only when readily available (the selected part) to keep the batch light.
  const processPart = async (ref: string, refImage: string | null): Promise<void> => {
    const imgs = await searchPartImages(ref, brandRef.current);
    let keptArr = imgs.map(() => true);
    if (imgs.length) {
      try {
        const keep = await filterPartImages(imgs.map((c) => c.thumbnail), ref, brandRef.current, refImage);
        keptArr = keep.length === imgs.length ? keep : imgs.map(() => false);
      } catch {
        // discard-on-failure: keep only what the model confirmed
        keptArr = imgs.map(() => false);
      }
    }
    saveResult(docId, ref, { candidates: imgs, kept: keptArr });
    // Reflect into the view if this is the part on screen.
    if (ref === selectedRefRef.current) {
      setCandidates(imgs);
      setKept(keptArr);
      setSearched(true);
    }
  };

  // Track mount so the long-running batch can stop on unmount without a
  // cleanup-based cancel (which StrictMode / re-renders would trip).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // On entering Étape 3, auto-run the search + triage for every part that has no
  // saved result yet (the filter LLM is cheap). Latched once per document; cached
  // parts are skipped. Sequential, to stay under the search/LLM rate limits.
  const batchDocRef = useRef('');
  useEffect(() => {
    if (!parts.length || batchDocRef.current === docId) return;
    batchDocRef.current = docId;
    const todo = parts.filter((p) => p.ref && !loadResult(docId, p.ref as string));
    if (!todo.length) return;
    void (async () => {
      setBatch({ done: 0, total: todo.length });
      for (let i = 0; i < todo.length; i++) {
        if (!mountedRef.current || batchDocRef.current !== docId) return;
        try {
          await processPart(todo[i].ref as string, null);
        } catch {
          // skip this part; the user can search it manually
        }
        if (mountedRef.current) setBatch({ done: i + 1, total: todo.length });
      }
      if (mountedRef.current) setBatch(null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts.length, docId]);

  // On selection change, render the part's drawing and restore any saved search
  // results for that part (so switching parts and coming back keeps them).
  useEffect(() => {
    let cancelled = false;
    setCrop(null);
    setError(null);
    const saved = selected ? loadResult(docId, selected.ref as string) : undefined;
    setCandidates(saved?.candidates ?? []);
    setKept(saved?.kept ?? []);
    setSearched(saved !== undefined);
    if (!selected) return;
    renderPartCrop(file, selected).then((c) => {
      if (!cancelled) setCrop(c);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRef, file]);

  // Manual (re-)search of the selected part, sending its rendered drawing as the
  // filter reference. Shows the spinner until the kept/discarded verdicts are in.
  const search = async () => {
    if (!selected?.ref) return;
    setSearching(true);
    setError(null);
    setCandidates([]);
    setKept([]);
    try {
      await processPart(selected.ref as string, crop);
    } catch (e) {
      setError(
        (axios.isAxiosError(e) && (e.response?.data as { error?: string })?.error) ||
          t('notice.err.generic'),
      );
    } finally {
      setSearching(false);
    }
  };

  const toggleKept = (i: number) => {
    const next = kept.map((k, j) => (j === i ? !k : k));
    setKept(next);
    if (selected?.ref) saveResult(docId, selected.ref as string, { candidates, kept: next });
  };

  const label = (p: PartItem) =>
    `${p.ref}${p.bag ? ` (${p.bag}, ${t('notice.pdf.page')} ${p.page})` : ` (${t('notice.pdf.page')} ${p.page})`}`;

  // One candidate tile: click toggles kept/discarded (which moves it between the
  // two rows), the corner button zooms, and the source site links below.
  const tile = (c: ImageHit, i: number) => (
    <div key={i} className="flex w-32 flex-col items-center gap-1">
      <div className="group relative h-32 w-32">
        <button
          type="button"
          onClick={() => toggleKept(i)}
          title={c.title}
          className={`flex h-full w-full items-center justify-center overflow-hidden rounded-lg border-2 bg-white p-1 transition-colors ${
            kept[i] ? 'border-emerald-500' : 'border-rose-500 opacity-60'
          }`}
        >
          <img src={c.thumbnail} alt={c.title} loading="lazy" className="max-h-full max-w-full object-contain" />
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
  );

  if (!parts.length) {
    return (
      <p className="text-center text-sm text-slate-500 dark:text-slate-400">{t('notice.step3.noParts')}</p>
    );
  }

  // The selected part is "busy" while it's being searched manually, or while the
  // auto-run batch hasn't reached it yet. Candidates are revealed only once the
  // kept/discarded verdicts are in, split into a kept row over a discarded row.
  const busy = searching || (!searched && !!batch);
  const keptList = candidates.map((c, i) => ({ c, i })).filter(({ i }) => kept[i]);
  const discardedList = candidates.map((c, i) => ({ c, i })).filter(({ i }) => !kept[i]);
  // Which parts already have a result, so the picker can grey out the rest. Recomputed
  // each render, so options un-grey as the batch progresses (it bumps `batch`).
  const done = loadResults(docId);

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
            <option
              key={i}
              value={p.ref as string}
              style={(p.ref as string) in done ? undefined : { color: '#94a3b8' }}
            >
              {label(p)}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => void search()} disabled={searching || !selected} className={runBtnClass}>
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {t('notice.step3.search')}
        </button>
      </div>

      {/* Auto-run progress across all parts. */}
      {batch && (
        <p className="flex items-center justify-center gap-2 text-xs text-slate-400 dark:text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t('notice.step3.batch')} {batch.done}/{batch.total}
        </p>
      )}

      {error && <p className="text-center text-sm text-rose-600 dark:text-rose-400">{error}</p>}

      {/* The manual's drawing, centered */}
      <div className="flex flex-col items-center gap-1">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {t('notice.parts.piece')}
        </div>
        {crop ? (
          <button
            type="button"
            onClick={() => setZoom(crop)}
            title={t('notice.pdf.zoom')}
            className="flex h-40 w-40 items-center justify-center rounded-lg border border-slate-300 bg-white p-2 dark:border-slate-700"
          >
            <img src={crop} alt="" className="max-h-full max-w-full cursor-zoom-in object-contain" />
          </button>
        ) : (
          <div className="flex h-40 w-40 items-center justify-center rounded-lg border border-slate-300 bg-white p-2 dark:border-slate-700">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        )}
      </div>

      {/* Candidates appear only once the kept/discarded verdicts are decided, so
          nothing reflows: a kept row on top, a discarded row below. */}
      {busy ? (
        <p className="flex items-center justify-center gap-2 text-sm text-slate-400 dark:text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('notice.step3.filtering')}
        </p>
      ) : candidates.length > 0 ? (
        <div className="flex flex-col items-center gap-4">
          <p className="text-center text-xs text-slate-400 dark:text-slate-500">
            {t('notice.step3.filterHint')}
          </p>
          {keptList.length > 0 && (
            <div className="flex flex-wrap justify-center gap-3">
              {keptList.map(({ c, i }) => tile(c, i))}
            </div>
          )}
          {keptList.length > 0 && discardedList.length > 0 && (
            <hr className="w-full max-w-sm border-slate-200 dark:border-slate-700" />
          )}
          {discardedList.length > 0 && (
            <div className="flex flex-wrap justify-center gap-3">
              {discardedList.map(({ c, i }) => tile(c, i))}
            </div>
          )}
        </div>
      ) : (
        searched && (
          <p className="text-center text-sm text-slate-400 dark:text-slate-500">
            {t('notice.step3.noResults')}
          </p>
        )
      )}

      <ImageLightbox src={zoom} alt={selected?.ref ?? undefined} onClose={() => setZoom(null)} />
    </div>
  );
}
