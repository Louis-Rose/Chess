import { Link } from 'react-router-dom';
import { FileText, Trash2 } from 'lucide-react';
import { useNoticeFiles } from '../useNoticeFiles';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// The Library page: every document ever uploaded on this device, newest first.
// Open one to read it, or remove it from the browser store.
export function NoticeLibrary() {
  const { files, remove } = useNoticeFiles();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-center gap-3">
        <FileText className="h-6 w-6 text-emerald-400" />
        <h1 className="text-2xl font-bold text-slate-100">Library</h1>
      </div>

      {files === null ? (
        <p className="text-center text-sm text-slate-500">Loading…</p>
      ) : files.length === 0 ? (
        <p className="text-center text-sm text-slate-500">
          No documents yet. Upload a PDF in the Viewer and it'll show up here.
        </p>
      ) : (
        <ul className="space-y-2">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-800/40 p-3 transition-colors hover:border-slate-700"
            >
              <Link to={`/notice/view/${f.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <FileText className="h-5 w-5 shrink-0 text-emerald-400" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-200">{f.name}</p>
                  <p className="text-xs text-slate-500">
                    {formatSize(f.size)} · {formatDate(f.addedAt)}
                  </p>
                </div>
              </Link>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Remove "${f.name}" from this device?`)) void remove(f.id);
                }}
                aria-label={`Remove ${f.name}`}
                className="shrink-0 rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-700 hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
