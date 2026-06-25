import { Link } from 'react-router-dom';
import { FileText, Trash2 } from 'lucide-react';
import { useNoticeFiles } from '../useNoticeFiles';
import { useLanguage } from '../../../contexts/LanguageContext';

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
  const { t } = useLanguage();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-center gap-3">
        <FileText className="h-6 w-6 text-emerald-600" />
        <h1 className="text-2xl font-bold text-slate-900">{t('notice.nav.library')}</h1>
      </div>

      {files === null ? (
        <p className="text-center text-sm text-slate-500">{t('common.loading')}</p>
      ) : files.length === 0 ? (
        <p className="text-center text-sm text-slate-500">{t('notice.lib.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-colors hover:border-emerald-500"
            >
              <Link to={`/notice/view/${f.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <FileText className="h-5 w-5 shrink-0 text-emerald-600" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{f.name}</p>
                  <p className="text-xs text-slate-500">
                    {formatSize(f.size)} · {formatDate(f.addedAt)}
                  </p>
                </div>
              </Link>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(t('notice.lib.removeConfirm').replace('{name}', f.name)))
                    void remove(f.id);
                }}
                aria-label={`${t('notice.lib.remove')} ${f.name}`}
                className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-red-600"
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
