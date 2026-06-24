import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FileText, Loader2, Upload } from 'lucide-react';
import { PdfViewer } from '../PdfViewer';
import { getFile, type NoticeFile } from '../noticeStore';
import { useNoticeFiles } from '../useNoticeFiles';

// The Viewer page: upload a PDF (button or drag-and-drop) and read it page by
// page. When the route carries an :id, that stored document is shown.
export function NoticeViewer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { add } = useNoticeFiles();

  const [current, setCurrent] = useState<NoticeFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
      {/* Top bar (only when a document is open): name + control to swap files,
          centered as a stack. */}
      {current && (
        <div className="mb-3 flex flex-col items-center gap-2">
          <div className="flex max-w-full items-center gap-2 text-slate-100">
            <FileText className="h-5 w-5 shrink-0 text-emerald-400" />
            <span className="truncate text-xl font-semibold">{current.name}</span>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm font-semibold transition-colors hover:border-emerald-500 hover:bg-emerald-500/10 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload PDF
          </button>
        </div>
      )}

      {/* Hidden picker, shared by the top-bar button and the clickable drop zone */}
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

      {/* Body: the open document, or a drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`min-h-0 flex-1 overflow-hidden rounded-2xl border ${
          dragging ? 'border-emerald-500 bg-emerald-500/5' : 'border-slate-800 bg-slate-800/30'
        }`}
      >
        {loading ? (
          <div className="flex h-full items-center justify-center text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : current ? (
          <PdfViewer key={current.id} file={current.data} />
        ) : id ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center text-slate-500 transition-colors hover:bg-emerald-500/5"
          >
            <FileText className="h-10 w-10" />
            <p>This document is no longer in your library. Click to upload a new one.</p>
          </button>
        ) : (
          <div
            onClick={() => inputRef.current?.click()}
            className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-4 px-6 text-center"
          >
            {busy ? (
              <Loader2 className="h-10 w-10 animate-spin text-slate-500" />
            ) : (
              <Upload className="h-10 w-10 text-slate-600" />
            )}
            <div>
              <p className="font-medium text-slate-300">Drop a PDF here, or click to upload.</p>
              <p className="mt-1 text-sm text-slate-500">It's saved in this browser and added to your library.</p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                inputRef.current?.click();
              }}
              disabled={busy}
              className="flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-5 py-2.5 text-sm font-semibold text-slate-100 transition-colors hover:border-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-300 disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              Upload PDF
            </button>
            {rejected && <p className="text-sm text-red-400">Only PDF files are supported for now.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
