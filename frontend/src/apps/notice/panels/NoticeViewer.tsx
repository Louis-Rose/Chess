import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FileText, Loader2, Upload } from 'lucide-react';
import { PdfViewer } from '../PdfViewer';
import { PageQA } from '../PageQA';
import { CategoryTable } from '../CategoryTable';
import { SECTION_WIDTH } from '../sectionWidth';
import { getFile, type NoticeFile } from '../noticeStore';
import { useNoticeFiles } from '../useNoticeFiles';

// The Viewer page: upload a PDF (button or drag-and-drop) and read it page by
// page. When the route carries an :id, that stored document is shown.
export function NoticeViewer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { add } = useNoticeFiles();

  const [current, setCurrent] = useState<NoticeFile | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Getters handed up by PdfViewer: the current page as a PNG, and a renderer
  // for any page (used to categorize all pages).
  const getPageImage = useRef<(() => string | null) | null>(null);
  const renderPage = useRef<((n: number) => Promise<string | null>) | null>(null);

  // Load the selected document from IndexedDB when the id changes.
  useEffect(() => {
    let cancelled = false;
    if (!id) {
      setCurrent(null);
      return;
    }
    setLoading(true);
    getFile(id).then((f) => {
      if (cancelled) return;
      setCurrent(f ?? null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const onPick = useCallback(
    async (file: File | undefined) => {
      setRejected(false);
      if (!file) return;
      if (file.type !== 'application/pdf') {
        setRejected(true);
        return;
      }
      setBusy(true);
      try {
        const rec = await add(file);
        navigate(`/notice/view/${rec.id}`);
      } finally {
        setBusy(false);
      }
    },
    [add, navigate],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      void onPick(e.dataTransfer.files?.[0]);
    },
    [onPick],
  );

  return (
    <div className="flex min-h-[24rem] flex-1 flex-col px-4 py-4 sm:px-6">
      {/* Hidden picker, shared by the viewer's upload button and the drop zone */}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          void onPick(e.target.files?.[0]);
          e.target.value = ''; // allow re-picking the same file
        }}
      />

      {current ? (
        // Open document: Upload control, then two columns — document left,
        // asking window right (stacked on mobile).
        <div className="mx-auto flex w-full max-w-6xl flex-col">
          <div className="mb-3 flex justify-center">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:border-emerald-500 hover:bg-emerald-50 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload PDF
            </button>
          </div>

          {/* Current document name, under the upload control */}
          <div className="mb-4 flex items-center justify-center gap-2 text-slate-900">
            <FileText className="h-4 w-4 shrink-0 text-emerald-600" />
            <span className="truncate text-lg font-semibold">{current.name}</span>
          </div>

          <div className="flex flex-col gap-6 md:h-[75vh] md:flex-row">
            {/* Document */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`h-[60vh] overflow-hidden rounded-2xl border shadow-sm md:h-auto md:min-h-0 md:min-w-0 md:flex-1 ${
                dragging ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 bg-white'
              }`}
            >
              <PdfViewer
                key={current.id}
                file={current.data}
                onPageImage={(fn) => {
                  getPageImage.current = fn;
                }}
                onPage={setPageNum}
                onNumPages={setNumPages}
                onRenderPage={(fn) => {
                  renderPage.current = fn;
                }}
              />
            </div>

            {/* Asking window */}
            <div className="h-[34rem] md:h-auto md:min-h-0 md:min-w-0 md:flex-1">
              <PageQA getPageImage={() => getPageImage.current?.() ?? null} />
            </div>
          </div>

          {/* Per-model page categories + Gemini cost */}
          <CategoryTable
            getPageImage={() => getPageImage.current?.() ?? null}
            renderPage={(n) => renderPage.current?.(n) ?? Promise.resolve(null)}
            numPages={numPages}
            page={pageNum}
            docId={current.id}
          />
        </div>
      ) : (
        // No document: a square drop zone (loading / not-found / empty).
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`mt-12 aspect-square overflow-hidden rounded-2xl border shadow-sm transition-colors ${
            dragging
              ? 'border-emerald-500 bg-emerald-50'
              : 'border-slate-300 bg-white hover:border-emerald-500 hover:bg-emerald-50'
          } ${SECTION_WIDTH}`}
        >
          {loading ? (
            <div className="flex h-full items-center justify-center text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : id ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center text-slate-500 transition-colors hover:bg-emerald-50"
            >
              <FileText className="h-10 w-10" />
              <p>This document is no longer in your library. Click to upload a new one.</p>
            </button>
          ) : (
            <div
              onClick={() => inputRef.current?.click()}
              className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-3 px-6 text-center"
            >
              {busy ? (
                <Loader2 className="h-10 w-10 animate-spin text-slate-400" />
              ) : (
                <Upload className="h-10 w-10 text-slate-400" />
              )}
              <div>
                <h3 className="text-xl font-semibold text-slate-900">Upload PDF</h3>
                <p className="mt-1 font-medium text-slate-700">Drop a PDF here, or click to upload.</p>
                <p className="mt-1 text-sm text-slate-500">It's saved in this browser and added to your library.</p>
              </div>
              {rejected && <p className="text-sm text-red-600">Only PDF files are supported for now.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
