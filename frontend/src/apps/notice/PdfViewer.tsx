import { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { NOTICE_MODELS } from './models';
import { requestPage, useRun } from './categoryRun';
// Side-effect import: configures the shared PDF.js worker (used here and by the
// off-screen categorize run).
import './pdfRender';

// Renders a PDF one page at a time onto a canvas, filling the container width
// (margins come from the narrow section the parent places this in). The header
// holds the page navigation.
export function PdfViewer({
  file,
  docId,
  onNumPages,
}: {
  file: Blob;
  docId: string;
  onNumPages?: (n: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const loadRef = useRef<PDFDocumentLoadingTask | null>(null);
  const taskRef = useRef<RenderTask | null>(null);
  const zoomCanvasRef = useRef<HTMLCanvasElement>(null);
  const zoomTaskRef = useRef<RenderTask | null>(null);
  const { t } = useLanguage();
  // Section segments detected by the categorize run, to overlay on the page.
  const { segments, requestedPage, disabledModels } = useRun(docId);
  const disabled = new Set(disabledModels);

  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);

  // Load (and reload on file change) the document.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNumPages(0);
    setPage(1);

    (async () => {
      try {
        const buf = await file.arrayBuffer();
        if (cancelled) return;
        const loadingTask = pdfjsLib.getDocument({ data: buf });
        const doc = await loadingTask.promise;
        if (cancelled) {
          void loadingTask.destroy();
          return;
        }
        loadRef.current = loadingTask;
        docRef.current = doc;
        setNumPages(doc.numPages);
      } catch {
        if (!cancelled) setError(t('notice.pdf.openError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      void loadRef.current?.destroy();
      loadRef.current = null;
      docRef.current = null;
    };
  }, [file]);

  // Track the available width and height so a page fits the viewport (and
  // re-renders crisply on resize).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setSize({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Render the current page whenever it, the document, or the size changes.
  useEffect(() => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas || numPages === 0 || size.w === 0 || size.h === 0) return;
    let cancelled = false;

    (async () => {
      try {
        const pdfPage = await doc.getPage(page);
        if (cancelled) return;
        const base = pdfPage.getViewport({ scale: 1 });
        // Fit the whole page inside the container (contain), so it never needs
        // scrolling: limited by width or height, whichever is tighter, with a
        // little breathing room. The container is wide, so a portrait page is
        // height-limited and leaves black side bands for the labels.
        const scale = Math.min(size.w / base.width, size.h / base.height) * 0.96;
        const viewport = pdfPage.getViewport({ scale });
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        taskRef.current?.cancel();
        const task = pdfPage.render({ canvas, canvasContext: ctx, viewport });
        taskRef.current = task;
        await task.promise;
      } catch {
        // RenderingCancelledException fires when pages switch quickly — ignore.
      }
    })();

    return () => {
      cancelled = true;
      taskRef.current?.cancel();
    };
  }, [page, numPages, size.w, size.h]);

  const go = useCallback(
    (delta: number) => setPage((p) => Math.min(numPages, Math.max(1, p + delta))),
    [numPages],
  );

  // Arrow keys page through the document; Escape closes the zoom modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'Escape') setZoomed(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  // Jump to a page requested from elsewhere (e.g. a category table row), then
  // clear the request so the same row can be clicked again.
  useEffect(() => {
    if (requestedPage == null || numPages === 0) return;
    setPage(Math.min(numPages, Math.max(1, requestedPage)));
    requestPage(docId, null);
  }, [requestedPage, numPages, docId]);

  // Report the page count.
  useEffect(() => {
    onNumPages?.(numPages);
  }, [numPages, onNumPages]);

  // When zoomed, render the current page large enough to fill the viewport.
  useEffect(() => {
    if (!zoomed) return;
    const doc = docRef.current;
    const canvas = zoomCanvasRef.current;
    if (!doc || !canvas) return;
    let cancelled = false;

    (async () => {
      try {
        const pdfPage = await doc.getPage(page);
        if (cancelled) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const scale = Math.min(
          (window.innerHeight * 0.92) / base.height,
          (window.innerWidth * 0.92) / base.width,
        );
        const viewport = pdfPage.getViewport({ scale });
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        zoomTaskRef.current?.cancel();
        const task = pdfPage.render({ canvas, canvasContext: ctx, viewport });
        zoomTaskRef.current = task;
        await task.promise;
      } catch {
        // Cancelled when closing or paging — ignore.
      }
    })();

    return () => {
      cancelled = true;
      zoomTaskRef.current?.cancel();
    };
  }, [zoomed, page]);

  // First / last segment category of a page for a model (the categories carried
  // in at the top and out at the bottom of that page).
  const firstCat = (modelId: string, p: number) => segments[modelId]?.[p]?.[0]?.category;
  const lastCat = (modelId: string, p: number) => {
    const s = segments[modelId]?.[p];
    return s && s.length ? s[s.length - 1].category : undefined;
  };

  // Dashed section-boundary lines to draw on the current page, per model. A page
  // is a list of segments; each boundary BETWEEN two segments gets a mid-page
  // line, and the page's top/bottom edges get a line when a section starts/ends
  // there. A page-break boundary draws "(début)" at the top of this page (the
  // matching "(fin)" sits at the bottom of the previous page). Models are placed
  // on opposite sides so labels stay legible.
  const fin = t('notice.cat.sectionEnd');
  const debut = t('notice.cat.sectionStart');
  const enCours = t('notice.cat.sectionOngoing');
  const boundaryLines = NOTICE_MODELS.flatMap((m, i) => {
    if (disabled.has(m.id)) return [];
    const segs = segments[m.id]?.[page];
    if (!segs || segs.length === 0) return [];
    const side = i === 0 ? 'left' : 'right';
    const out: { key: string; y: number; color: string; side: string; above?: string; below?: string }[] = [];
    const top = segs[0].category;
    const bottom = segs[segs.length - 1].category;
    const prev = page > 1 ? lastCat(m.id, page - 1) : undefined;
    const next = page < numPages ? firstCat(m.id, page + 1) : undefined;
    // A page wholly inside one section: a single segment carried in from the
    // previous page and out to the next. Only such a page is "en cours"; pages
    // holding a start or an end are not.
    const interior = segs.length === 1 && page > 1 && page < numPages && prev === top && next === bottom;

    // Top edge: first page, or a page-break where a new section starts here (only
    // "(début)"; that section's "(fin)" sits at the bottom of the previous page),
    // or — for an interior page — the carried-over section.
    if (page === 1 || (prev && prev !== top)) {
      out.push({ key: `${m.id}-top`, y: 0, color: m.color, side, below: `${top} (${debut})` });
    } else if (interior) {
      out.push({ key: `${m.id}-top`, y: 0, color: m.color, side, below: `${top} (${enCours})` });
    }

    // Mid-page boundaries: one line between each pair of consecutive segments.
    for (let s = 1; s < segs.length; s++) {
      out.push({
        key: `${m.id}-seg${s}`,
        y: segs[s].start,
        color: m.color,
        side,
        above: `${segs[s - 1].category} (${fin})`,
        below: `${segs[s].category} (${debut})`,
      });
    }

    // Bottom edge: the last page, a page-break where the next page starts a
    // different section (its "(fin)" shows here), or — for an interior page — the
    // carried-over section.
    if (page === numPages || (next && next !== bottom)) {
      out.push({ key: `${m.id}-bottom`, y: 1, color: m.color, side, above: `${bottom} (${fin})` });
    } else if (interior) {
      out.push({ key: `${m.id}-bottom`, y: 1, color: m.color, side, above: `${bottom} (${enCours})` });
    }

    // Nudge each model's lines by a pixel so two boundaries at the same height
    // don't overlap and hide one another.
    return out.map((o) => ({ ...o, offset: i }));
  });

  // The overlay (dashed lines + labels) drawn over a page canvas. Labels sit
  // OUTSIDE the image — first model to the left, second to the right — so they
  // never hide page content. Shared by the inline viewer and the zoom modal.
  const boundaryOverlay = boundaryLines.map((ln) => {
    const sideCls = ln.side === 'left' ? 'right-full mr-2' : 'left-full ml-2';
    const labelCls = `absolute z-10 ${sideCls} whitespace-nowrap rounded px-1 text-[12px] font-semibold text-white`;
    return (
      <div
        key={ln.key}
        className="pointer-events-none absolute inset-x-0"
        style={{
          top: `${Math.min(Math.max(ln.y, 0.01), 0.99) * 100}%`,
          borderTop: `2px dashed ${ln.color}`,
          transform: `translateY(${ln.offset}px)`,
        }}
      >
        {ln.above && (
          <span className={`${labelCls} bottom-0.5`} style={{ backgroundColor: ln.color }}>
            {ln.above}
          </span>
        )}
        {ln.below && (
          <span className={`${labelCls} top-0.5`} style={{ backgroundColor: ln.color }}>
            {ln.below}
          </span>
        )}
      </div>
    );
  });

  return (
    <div className="flex h-full flex-col">
      {/* Page canvas */}
      <div ref={containerRef} className="flex-1 overflow-auto bg-slate-50 px-4 pb-4 pt-12 dark:bg-slate-950/40">
        {loading && (
          <div className="flex h-full items-center justify-center text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
        {error && <p className="py-12 text-center text-sm text-red-600 dark:text-red-400">{error}</p>}
        {!error && (
          <div className={`relative mx-auto w-fit ${loading ? 'hidden' : ''}`}>
            <canvas
              ref={canvasRef}
              onClick={() => !loading && numPages > 0 && setZoomed(true)}
              title={t('notice.pdf.zoom')}
              className="block max-w-full cursor-zoom-in rounded-lg shadow-lg"
            />
            {/* Dashed section-boundary lines + labels (labels outside the image). */}
            {!loading && boundaryOverlay}
          </div>
        )}
      </div>

      {/* Footer: page navigation, under the page */}
      <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-800">
        <PageNav page={page} numPages={numPages} onGo={go} disabled={loading} />
      </div>

      {/* Zoom modal: click the backdrop (or Escape) to close. The backdrop shows
          a zoom-out cursor; the page itself keeps a normal cursor. */}
      {zoomed && (
        <div
          onClick={() => setZoomed(false)}
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/80 p-4"
        >
          <button
            type="button"
            onClick={() => setZoomed(false)}
            aria-label={t('notice.pdf.close')}
            className="absolute right-4 top-4 cursor-pointer rounded-lg border border-slate-600 bg-slate-800/80 p-2 text-slate-200 transition-colors hover:bg-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="relative max-h-full max-w-full cursor-default" onClick={(e) => e.stopPropagation()}>
            <canvas ref={zoomCanvasRef} className="block max-h-full max-w-full rounded-lg shadow-2xl" />
            {boundaryOverlay}
          </div>
          {/* Page count + navigation, floated at the bottom. The zoom overlay is
              always dark (forced via the `dark` class) regardless of app theme. */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="dark absolute bottom-4 left-1/2 -translate-x-1/2 cursor-default rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 backdrop-blur"
          >
            <PageNav page={page} numPages={numPages} onGo={go} disabled={loading} />
          </div>
        </div>
      )}
    </div>
  );
}

// Previous / "Page X of Y" / next control, shared by the toolbar and the zoom
// modal so both stay in sync.
function PageNav({
  page,
  numPages,
  onGo,
  disabled = false,
}: {
  page: number;
  numPages: number;
  onGo: (delta: number) => void;
  disabled?: boolean;
}) {
  const { t } = useLanguage();
  return (
    <div className="flex items-center justify-center gap-4">
      <button
        type="button"
        onClick={() => onGo(-1)}
        disabled={disabled || page <= 1}
        className="rounded-lg border border-slate-300 bg-white p-2 text-slate-700 transition-colors hover:border-emerald-500 hover:bg-emerald-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-emerald-500/10"
        aria-label={t('notice.pdf.prev')}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="min-w-[6rem] text-center text-sm text-slate-600 dark:text-slate-400">
        {numPages > 0 ? `${t('notice.pdf.page')} ${page} ${t('notice.pdf.of')} ${numPages}` : '—'}
      </span>
      <button
        type="button"
        onClick={() => onGo(1)}
        disabled={disabled || page >= numPages}
        className="rounded-lg border border-slate-300 bg-white p-2 text-slate-700 transition-colors hover:border-emerald-500 hover:bg-emerald-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-emerald-500/10"
        aria-label={t('notice.pdf.next')}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
