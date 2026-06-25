import { useEffect, useState } from 'react';
import axios from 'axios';
import { Lightbulb, Loader2 } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';

// The MVP Notes page: a simple, readable list of the key points that frame the
// first version of Notice.ai. The points are stored in the backend
// (GET /api/notice/notes) so the copy can be edited without a frontend rebuild.
// The backend serves the English copy for `?lang=en`, French otherwise.
export function NoticeNotes() {
  const { language, t } = useLanguage();
  const [notes, setNotes] = useState<string[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setNotes(null);
    setError(false);
    axios
      .get<{ notes: string[] }>('/api/notice/notes', { params: { lang: language } })
      .then(({ data }) => {
        if (active) setNotes(data.notes ?? []);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [language]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-center gap-3">
        <Lightbulb className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t('notice.nav.notes')}</h1>
      </div>

      {error ? (
        <p className="text-center text-sm text-slate-500">{t('notice.err.generic')}</p>
      ) : notes === null ? (
        <div className="flex justify-center py-8 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : notes.length === 0 ? (
        <p className="text-center text-sm text-slate-500">No notes yet.</p>
      ) : (
        <ol className="space-y-4">
          {notes.map((point, i) => (
            <li
              key={i}
              className="flex gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-800/40 dark:shadow-none"
            >
              <span className="text-sm font-bold text-emerald-500">{i + 1}.</span>
              <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{point}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
