import { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import PdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { ChevronLeft, ChevronRight, FileText, Loader2, Upload } from 'lucide-react';

// PDF.js renders pages off the main thread. Let Vite bundle and instantiate the
// worker (?worker) rather than pointing workerSrc at a raw .mjs URL: the latter
// is served as application/octet-stream by static hosts (nginx) and rejected by
// strict module-script MIME checks. A single shared worker serves all documents.
pdfjsLib.GlobalWorkerOptions.workerPort = new PdfjsWorker();

// Renders a PDF one page at a time onto a canvas, filling the container width
// (margins come from the narrow section the parent places this in). The header
// shows the file name and an upload control above the page navigation.
export function PdfViewer({
  file,
  name,
  onUpload,
  uploading = false,
}: {
  file: Blob;
  name?: string;
  onUpload?: () => void;
  uploading?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const loadRef = useRef<PDFDocumentLoadingTask | null>(null);
  const taskRef = useRef<RenderTask | null>(null);

  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [width, setWidth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        if (!cancelled) setError('Could not open this PDF.');
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
        const scale = width / base.width;
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

  // Arrow keys page through the document.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  return (
    <div className="flex h-full flex-col">
      {/* Header: file name + upload control, then page navigation */}
      <div className="border-b border-slate-800 px-4 py-3">
        {name && (
          <div className="mb-3 flex flex-col items-center gap-2">
            <div className="flex max-w-full items-center gap-2 text-slate-100">
              <FileText className="h-5 w-5 shrink-0 text-emerald-400" />
              <span className="truncate text-xl font-semibold">{name}</span>
            </div>
            {onUpload && (
              <button
                type="button"
                onClick={onUpload}
                disabled={uploading}
                className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm font-semibold transition-colors hover:border-emerald-500 hover:bg-emerald-500/10 disabled:opacity-50"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Upload PDF
              </button>
            )}
          </div>
        )}
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={page <= 1 || loading}
            className="rounded-lg border border-slate-700 bg-slate-800 p-2 transition-colors hover:border-emerald-500 hover:bg-emerald-500/10 disabled:opacity-40"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[6rem] text-center text-sm text-slate-400">
            {numPages > 0 ? `Page ${page} of ${numPages}` : '—'}
          </span>
          <button
            type="button"
            onClick={() => go(1)}
            disabled={page >= numPages || loading}
            className="rounded-lg border border-slate-700 bg-slate-800 p-2 transition-colors hover:border-emerald-500 hover:bg-emerald-500/10 disabled:opacity-40"
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Page canvas */}
      <div ref={containerRef} className="flex-1 overflow-auto bg-slate-950/40 p-4">
        {loading && (
          <div className="flex h-full items-center justify-center text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
        {error && <p className="py-12 text-center text-sm text-red-400">{error}</p>}
        {!error && (
          <canvas
            ref={canvasRef}
            className={`mx-auto max-w-full rounded-lg shadow-lg ${loading ? 'hidden' : ''}`}
          />
        )}
      </div>
    </div>
  );
}
