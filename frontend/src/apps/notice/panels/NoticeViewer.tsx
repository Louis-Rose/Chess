import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FileText, Loader2, Upload } from 'lucide-react';
import { PdfViewer } from '../PdfViewer';
import { CategoryTable } from '../CategoryTable';
import { MaterialStep } from '../MaterialStep';
import { RealImagesStep } from '../RealImagesStep';
import { EtapeSection } from '../EtapeSection';
import { SECTION_WIDTH } from '../sectionWidth';
import { getFile, type NoticeFile } from '../noticeStore';
import { useNoticeFiles } from '../useNoticeFiles';
import { useNoticeNotes } from '../useNoticeNotes';
import { useLanguage } from '../../../contexts/LanguageContext';

// The "Reader" sidebar tab links to /notice/view without an id, so returning to
// it would otherwise lose the open document. We remember the last opened id here
// and reopen it.
const LAST_DOC_KEY = 'notice.lastDocId';

// The Viewer page: upload a PDF (button or drag-and-drop) and read it page by
// page. When the route carries an :id, that stored document is shown.
export function NoticeViewer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { add } = useNoticeFiles();
  const { notes } = useNoticeNotes();
  const { t } = useLanguage();

  const [current, setCurrent] = useState<NoticeFile | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load the selected document from IndexedDB when the id changes. With no id in
  // the URL (the "Reader" tab), reopen the last document we still have, so
  // navigating away and back doesn't blank the reader.
  useEffect(() => {
    let cancelled = false;

    if (!id) {
      const last = localStorage.getItem(LAST_DOC_KEY);
      if (!last) {
        setCurrent(null);
        return;
      }
      setLoading(true);
      getFile(last).then((f) => {
        if (cancelled) return;
        if (f) {
          navigate(`/notice/view/${last}`, { replace: true });
        } else {
          localStorage.removeItem(LAST_DOC_KEY);
          setCurrent(null);
          setLoading(false);
        }
      });
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    getFile(id).then((f) => {
      if (cancelled) return;
      setCurrent(f ?? null);
      setLoading(false);
      if (f) localStorage.setItem(LAST_DOC_KEY, id);
    });
    return () => {
      cancelled = true;
    };
  }, [id, navigate]);

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
    <div className="flex min-h-[24rem] flex-col px-4 py-4 sm:px-6">
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
        // Open document: upload control, the manual centered, then the assembly
        // steps stacked top to bottom (Etape 1 holds the page categories; the
        // rest are placeholders for now).
        <div className="mx-auto flex w-full max-w-6xl flex-col">
          <div className="mb-3 flex justify-center">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:border-emerald-500 hover:bg-emerald-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:shadow-none dark:hover:bg-emerald-500/10"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {t('notice.upload')}
            </button>
          </div>

          {/* Current document name, under the upload control */}
          <div className="mb-4 flex items-center justify-center gap-2 text-slate-900 dark:text-slate-100">
            <FileText className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="truncate text-lg font-semibold">{current.name}</span>
          </div>

          {/* The manual, centered */}
          <div
            id="notice-pdf"
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`mx-auto h-[60vh] w-full max-w-5xl overflow-hidden rounded-2xl border shadow-sm dark:shadow-none md:h-[80vh] ${
              dragging
                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/5'
                : 'border-slate-300 bg-white dark:border-slate-800 dark:bg-slate-800/30'
            }`}
          >
            <PdfViewer
              key={current.id}
              file={current.data}
              docId={current.id}
              onNumPages={setNumPages}
            />
          </div>

          {/* Assembly steps, top to bottom. A closing border under the last step
              mirrors the rule above each step. */}
          <div className="mb-4 mt-10 flex flex-col gap-10 border-b border-slate-200 pb-10 dark:border-slate-800">
            <EtapeSection title={`${t('notice.step')} 1${t('notice.step.sep')}${t('notice.step1.title')}`} info={notes?.[0]}>
              {/* Page classification; the run also detects the brand (shown in
                  the controls), which Étape 3 reuses for the image search. */}
              <CategoryTable
                numPages={numPages}
                docId={current.id}
                file={current.data}
              />
            </EtapeSection>
            {/* Étapes 2 + 3 are merged: extract the supplied parts, then find a
                real photo of each. The tooltip joins both methodology notes. */}
            <EtapeSection
              title={`${t('notice.step')} 2${t('notice.step.sep')}${t('notice.step2.title')} & ${t('notice.step3.title')}`}
              info={[notes?.[1], notes?.[2]].filter(Boolean).join('\n\n')}
            >
              <div className="flex flex-col gap-10">
                {/* The "Matériel fourni" pages + extracted supplied-parts table */}
                <MaterialStep file={current.data} docId={current.id} />
                <hr className="border-slate-200 dark:border-slate-800" />
                {/* Real photos of each part via brand + reference image search */}
                <RealImagesStep file={current.data} docId={current.id} />
              </div>
            </EtapeSection>
            <EtapeSection title={`${t('notice.step')} 3`} info={notes?.[3]} />
          </div>
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
          className={`mt-12 aspect-square overflow-hidden rounded-2xl border shadow-sm transition-colors dark:shadow-none ${
            dragging
              ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/5'
              : 'border-slate-300 bg-white hover:border-emerald-500 hover:bg-emerald-50 dark:border-slate-800 dark:bg-slate-800/30 dark:hover:bg-emerald-500/5'
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
              className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center text-slate-500 transition-colors hover:bg-emerald-50 dark:hover:bg-emerald-500/5"
            >
              <FileText className="h-10 w-10" />
              <p>{t('notice.viewer.gone')}</p>
            </button>
          ) : (
            <div
              onClick={() => inputRef.current?.click()}
              className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-3 px-6 text-center"
            >
              {busy ? (
                <Loader2 className="h-10 w-10 animate-spin text-slate-400" />
              ) : (
                <Upload className="h-10 w-10 text-slate-400 dark:text-slate-600" />
              )}
              <div>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t('notice.upload')}</h3>
                <p className="mt-1 font-medium text-slate-700 dark:text-slate-300">{t('notice.viewer.dropHint')}</p>
                <p className="mt-1 text-sm text-slate-500">{t('notice.viewer.dropSub')}</p>
              </div>
              {rejected && <p className="text-sm text-red-600 dark:text-red-400">{t('notice.viewer.onlyPdf')}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
