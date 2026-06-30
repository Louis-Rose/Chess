import { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
// Side-effect import: configures the shared PDF.js worker (used here and by the
// off-screen categorize run).
import './pdfRender';

// Renders a PDF one page at a time onto a canvas, filling the container width
// (margins come from the narrow section the parent places this in). The header
// holds the page navigation.
export function PdfViewer({
  file,
  onNumPages,
}: {
  file: Blob;
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

  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [width, setWidth] = useState(0);
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

  // Track the available width so pages re-render crisply on resize.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Render the current page whenever it, the document, or the width changes.
  useEffect(() => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas || numPages === 0 || width === 0) return;
    let cancelled = false;

    (async () => {
      try {
        const pdfPage = await doc.getPage(page);
        if (cancelled) return;
        const base = pdfPage.getViewport({ scale: 1 });
        // Render at 80% of the column width, leaving padding around the page.
        const scale = (width * 0.8) / base.width;
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
  }, [page, numPages, width]);

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

  return (
    <div className="flex h-full flex-col">
      {/* Page canvas */}
      <div ref={containerRef} className="flex-1 overflow-auto bg-slate-50 p-4 dark:bg-slate-950/40">
        {loading && (
          <div className="flex h-full items-center justify-center text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
        {error && <p className="py-12 text-center text-sm text-red-600 dark:text-red-400">{error}</p>}
        {!error && (
          <canvas
            ref={canvasRef}
            onClick={() => !loading && numPages > 0 && setZoomed(true)}
            title={t('notice.pdf.zoom')}
            className={`mx-auto max-w-full cursor-zoom-in rounded-lg shadow-lg ${loading ? 'hidden' : ''}`}
          />
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
          <div
            className="max-h-full max-w-full cursor-default overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <canvas ref={zoomCanvasRef} className="rounded-lg shadow-2xl" />
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
