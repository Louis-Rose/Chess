import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Loader2, Sparkles } from 'lucide-react';
import { NOTICE_MODELS } from './models';
import { useLanguage } from '../../contexts/LanguageContext';

// model id -> page number -> category label
type ByModelPage = Record<string, Record<number, string>>;

// Categories are remembered per PDF in this browser, keyed by document id, so
// they survive reloads. Each (page, model) keeps only its most recent result.
const mapKey = (kind: string, docId: string) => `notice.${kind}.${docId}`;

function loadMap(kind: string, docId: string): ByModelPage {
  try {
    const raw = localStorage.getItem(mapKey(kind, docId));
    return raw ? (JSON.parse(raw) as ByModelPage) : {};
  } catch {
    return {};
  }
}

function saveMap(kind: string, docId: string, value: ByModelPage) {
  try {
    localStorage.setItem(mapKey(kind, docId), JSON.stringify(value));
  } catch {
    // ignore quota / serialization errors
  }
}

// A table with one row per Gemini model: the model name, the category it assigns
// to the page currently shown, and the running Gemini spend for that model in
// the Notice.ai feature. Two actions: classify just the current page, or every
// page (cached per page, so the column fills in as you navigate).
export function CategoryTable({
  getPageImage,
  renderPage,
  numPages,
  page,
  docId,
}: {
  getPageImage: () => string | null;
  renderPage: (n: number) => Promise<string | null>;
  numPages: number;
  page: number;
  docId: string;
}) {
  const { t } = useLanguage();
  const [categories, setCategories] = useState<ByModelPage>({});
  const categoriesRef = useRef<ByModelPage>({});
  const [costs, setCosts] = useState<Record<string, number>>({});
  const [times, setTimes] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<null | 'this' | 'all'>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCosts = useCallback(async () => {
    try {
      const { data } = await axios.get<{
        costs: Record<string, number>;
        times: Record<string, number>;
      }>('/api/notice/costs');
      setCosts(data.costs || {});
      setTimes(data.times || {});
    } catch {
      // non-fatal: leave the cost/time columns empty
    }
  }, []);

  useEffect(() => {
    void loadCosts();
  }, [loadCosts]);

  // Load this PDF's remembered categories when the document changes.
  useEffect(() => {
    const cats = loadMap('categories', docId);
    categoriesRef.current = cats;
    setCategories(cats);
    setError(null);
    setProgress(null);
  }, [docId]);

  // Record one (model, page) result, keeping only the most recent, and persist.
  const setResult = (modelId: string, pageNum: number, category: string) => {
    const nextCats: ByModelPage = { ...categoriesRef.current };
    nextCats[modelId] = { ...(nextCats[modelId] || {}), [pageNum]: category };
    categoriesRef.current = nextCats;
    setCategories(nextCats);
    saveMap('categories', docId, nextCats);
  };

  // Classify one page image across every model, storing results per (model, page).
  const classify = async (image: string, pageNum: number) => {
    await Promise.all(
      NOTICE_MODELS.map(async (m) => {
        try {
          const { data } = await axios.post<{ category: string }>(
            '/api/notice/categorize',
            { image, model: m.id },
          );
          setResult(m.id, pageNum, data.category);
        } catch {
          setResult(m.id, pageNum, '—');
        }
      }),
    );
  };

  const findThisPage = async () => {
    const image = getPageImage();
    if (!image) {
      setError(t('notice.err.rendering'));
      return;
    }
    setError(null);
    setBusy('this');
    try {
      await classify(image, page);
    } finally {
      setBusy(null);
      void loadCosts();
    }
  };

  const findAllPages = async () => {
    if (numPages < 1) return;
    setError(null);
    setBusy('all');
    setProgress({ done: 0, total: numPages });
    try {
      for (let n = 1; n <= numPages; n++) {
        const image = await renderPage(n);
        if (image) await classify(image, n);
        setProgress({ done: n, total: numPages });
      }
    } finally {
      setBusy(null);
      setProgress(null);
      void loadCosts();
    }
  };

  const btnClass =
    'flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:border-emerald-500 hover:bg-emerald-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-emerald-500/10';

  return (
    <div className="mt-6">
      <div className="mb-3 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={findThisPage} disabled={!!busy} className={btnClass}>
          {busy === 'this' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {t('notice.cat.thisPage')}
        </button>
        <button type="button" onClick={findAllPages} disabled={!!busy} className={btnClass}>
          {busy === 'all' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {t('notice.cat.allPages')}
          {busy === 'all' && progress ? ` · ${progress.done}/${progress.total}` : ''}
        </button>
      </div>

      {error && <p className="mb-2 text-center text-sm text-rose-600 dark:text-rose-400">{error}</p>}

      <div className="mx-auto max-w-3xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-lg">
        <table className="w-full text-center text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-900 [&>th]:border-r [&>th]:border-slate-200 [&>th:last-child]:border-r-0 dark:border-slate-800 dark:text-white dark:[&>th]:border-slate-800/60">
              <th className="px-4 py-2 font-medium">{t('notice.cat.model')}</th>
              <th className="px-4 py-2 font-medium">
                {t('notice.cat.category')} ({t('notice.pdf.page')} {page})
              </th>
              <th className="px-4 py-2 font-medium">{t('notice.cat.cost')}</th>
              <th className="px-4 py-2 font-medium">{t('notice.cat.time')}</th>
            </tr>
          </thead>
          <tbody>
            {NOTICE_MODELS.map((m) => {
              const cell = categories[m.id]?.[page];
              return (
                <tr
                  key={m.id}
                  className="border-b border-slate-200 last:border-0 [&>td]:border-r [&>td]:border-slate-200 [&>td:last-child]:border-r-0 dark:border-slate-800/60 dark:[&>td]:border-slate-800/60"
                >
                  <td className="px-4 py-2.5 text-center font-semibold text-slate-900 dark:text-slate-100">
                    {m.label}
                  </td>
                  <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">
                    {cell ?? (busy ? (
                      <Loader2 className="mx-auto h-4 w-4 animate-spin text-slate-500" />
                    ) : (
                      '—'
                    ))}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-emerald-600 dark:text-emerald-300">
                    ${(costs[m.id] ?? 0).toFixed(2)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-700 dark:text-slate-300">
                    {times[m.id] ? `${times[m.id].toFixed(1)}s` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
