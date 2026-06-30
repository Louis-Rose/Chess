import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { usePartsRun } from './partsRun';
import { renderPartCrops } from './partCrop';
import { searchPartImages, filterPartImages, loadResult, saveResult, type ImageHit } from './realImages';
import { ImageLightbox } from './ImageLightbox';
import { useSelectedPart, setSelectedPart } from './selectionStore';
import { useBrand } from './brandStore';
import { useLanguage } from '../../contexts/LanguageContext';

// Étape 2 (real images): show a real photo of the part selected in the parts
// table above. On entry the search + Gemini Flash-Lite triage auto-run for every
// part; kept candidates are framed green, discarded red. Click a candidate to
// zoom it; drag it between the kept/discarded zones to change its status.
export function RealImagesStep({ file, docId }: { file: Blob; docId: string }) {
  const { t } = useLanguage();
  const { items } = usePartsRun(docId);
  const parts = items.filter((p) => p.ref);
  const { brand } = useBrand(docId);

  const selectedRef = useSelectedPart(docId);
  const [crops, setCrops] = useState<(string | null)[]>([]);
  // Whether the selected part has a result (even an empty one), to tell "not
  // searched yet" from "searched, no photos".
  const [searched, setSearched] = useState(false);
  const [candidates, setCandidates] = useState<ImageHit[]>([]);
  const [kept, setKept] = useState<boolean[]>([]);
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  const selIdx = parts.findIndex((p) => p.ref === selectedRef);
  const selected = selIdx >= 0 ? parts[selIdx] : null;

  // Latest brand / selection, read inside the long-running batch without making
  // it a dependency (which would restart it).
  const brandRef = useRef(brand);
  brandRef.current = brand;
  const selectedRefRef = useRef(selectedRef);
  selectedRefRef.current = selectedRef;
  const cropsRef = useRef(crops);
  cropsRef.current = crops;

  // Default the selection to the first part once parts are available.
  useEffect(() => {
    if (!selectedRef && parts.length) setSelectedPart(docId, parts[0].ref as string);
  }, [parts, selectedRef, docId]);

  // Render every part's drawing once (one PDF load, cached pages) for the large
  // preview and as the batch filter reference.
  useEffect(() => {
    let cancelled = false;
    setCrops([]);
    renderPartCrops(file, parts).then((cs) => {
      if (!cancelled) setCrops(cs);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, parts.length]);

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
    const todo = parts
      .map((p, idx) => ({ p, idx }))
      .filter(({ p }) => p.ref && !loadResult(docId, p.ref as string));
    if (!todo.length) return;
    void (async () => {
      setBatch({ done: 0, total: todo.length });
      for (let i = 0; i < todo.length; i++) {
        if (!mountedRef.current || batchDocRef.current !== docId) return;
        try {
          // Send the part's drawing (rendered for the strip) as the filter
          // reference so the model can reject mismatched parts.
          await processPart(todo[i].p.ref as string, cropsRef.current[todo[i].idx] ?? null);
        } catch {
          // skip this part; the user can search it manually
        }
        if (mountedRef.current) setBatch({ done: i + 1, total: todo.length });
      }
      if (mountedRef.current) setBatch(null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts.length, docId]);

  // On selection change, restore any saved search results for that part (so
  // switching parts and coming back keeps them).
  useEffect(() => {
    const saved = selected ? loadResult(docId, selected.ref as string) : undefined;
    setCandidates(saved?.candidates ?? []);
    setKept(saved?.kept ?? []);
    setSearched(saved !== undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRef]);

  // The candidate currently being dragged between the kept/discarded zones.
  const dragIndexRef = useRef<number | null>(null);

  // Set a candidate's kept/discarded status (on drop into a zone) and persist.
  const setStatus = (i: number | null, keep: boolean) => {
    dragIndexRef.current = null;
    if (i == null || kept[i] === keep) return;
    const next = kept.map((k, j) => (j === i ? keep : k));
    setKept(next);
    if (selected?.ref) saveResult(docId, selected.ref as string, { candidates, kept: next });
  };

  // One candidate tile: click anywhere zooms; drag it into the other zone to
  // change its kept/discarded status. The source site links below.
  const tile = (c: ImageHit, i: number) => (
    <div key={i} className="flex w-44 flex-col items-center gap-1">
      <button
        type="button"
        draggable
        onDragStart={(e) => {
          dragIndexRef.current = i;
          e.dataTransfer.effectAllowed = 'move';
        }}
        onClick={() => setZoom(c.url)}
        title={c.title}
        className={`flex h-44 w-44 items-center justify-center overflow-hidden rounded-lg border-2 bg-white p-1 transition-colors ${
          kept[i] ? 'border-emerald-500' : 'border-rose-500 opacity-60'
        }`}
      >
        <img
          src={c.thumbnail}
          alt={c.title}
          loading="lazy"
          draggable={false}
          className="max-h-full max-w-full cursor-zoom-in object-contain"
        />
      </button>
      <div className="flex w-full flex-col items-center">
        {/* The listing page where the image was found (first), then the raw image. */}
        {c.context && (
          <a
            href={c.context}
            target="_blank"
            rel="noopener noreferrer"
            title={c.title || c.context}
            className="max-w-full truncate text-xs text-slate-500 hover:text-emerald-500 hover:underline dark:text-slate-400"
          >
            {t('notice.step3.listing')}
          </a>
        )}
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
    </div>
  );

  // A drop zone (kept or discarded): dropping a dragged candidate here sets its
  // status. Always shown so there's a target even when the zone is empty.
  const zone = (
    list: { c: ImageHit; i: number }[],
    keep: boolean,
    labelKey: string,
    accent: string,
  ) => (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => setStatus(dragIndexRef.current, keep)}
      className="w-full"
    >
      <div className={`mb-2 text-center text-xs font-semibold uppercase tracking-wide ${accent}`}>
        {t(labelKey)}
      </div>
      <div className="flex min-h-[3.5rem] flex-wrap justify-center gap-3 rounded-lg border border-dashed border-slate-200 p-3 dark:border-slate-700">
        {list.length > 0 ? (
          list.map(({ c, i }) => tile(c, i))
        ) : (
          <span className="self-center text-xs text-slate-300 dark:text-slate-600">—</span>
        )}
      </div>
    </div>
  );

  if (!parts.length) {
    return (
      <p className="text-center text-sm text-slate-500 dark:text-slate-400">{t('notice.step3.noParts')}</p>
    );
  }

  // The selected part is "busy" until the auto-run batch reaches it. Candidates
  // are revealed only once the kept/discarded verdicts are in, split into a kept
  // zone over a discarded zone.
  const busy = !searched && !!batch;
  const keptList = candidates.map((c, i) => ({ c, i })).filter(({ i }) => kept[i]);
  const discardedList = candidates.map((c, i) => ({ c, i })).filter(({ i }) => !kept[i]);

  return (
    <div className="flex flex-col gap-5">
      {/* Auto-run progress across all parts. */}
      {batch && (
        <p className="flex items-center justify-center gap-2 text-xs text-slate-400 dark:text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t('notice.step3.batch')} {batch.done}/{batch.total}
        </p>
      )}

      {/* Candidates appear only once the kept/discarded verdicts are decided, so
          nothing reflows: a kept zone over a discarded zone. Drag a tile into the
          other zone to change its status. */}
      {busy ? (
        <p className="flex items-center justify-center gap-2 text-sm text-slate-400 dark:text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('notice.step3.filtering')}
        </p>
      ) : candidates.length > 0 ? (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
          {zone(keptList, true, 'notice.step3.kept', 'text-emerald-600 dark:text-emerald-400')}
          {zone(discardedList, false, 'notice.step3.discarded', 'text-rose-600 dark:text-rose-400')}
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
