import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2, Sparkles } from 'lucide-react';
import { NOTICE_MODELS } from './models';

// model id -> page number -> category label
type CatMap = Record<string, Record<number, string>>;

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
  const [categories, setCategories] = useState<CatMap>({});
  const [costs, setCosts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<null | 'this' | 'all'>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCosts = useCallback(async () => {
    try {
      const { data } = await axios.get<{ costs: Record<string, number> }>('/api/notice/costs');
      setCosts(data.costs || {});
    } catch {
      // non-fatal: leave the cost column at $0
    }
  }, []);

  useEffect(() => {
    void loadCosts();
  }, [loadCosts]);

  // Categories are per page; clear them when the document changes.
  useEffect(() => {
    setCategories({});
    setError(null);
    setProgress(null);
  }, [docId]);

  // Classify one page image across every model, storing results per (model, page).
  const classify = async (image: string, pageNum: number) => {
    await Promise.all(
      NOTICE_MODELS.map(async (m) => {
        try {
          const { data } = await axios.post<{ category: string }>('/api/notice/categorize', {
            image,
            model: m.id,
          });
          setCategories((c) => ({ ...c, [m.id]: { ...(c[m.id] || {}), [pageNum]: data.category } }));
        } catch {
          setCategories((c) => ({ ...c, [m.id]: { ...(c[m.id] || {}), [pageNum]: '—' } }));
        }
      }),
    );
  };

  const findThisPage = async () => {
    const image = getPageImage();
    if (!image) {
      setError('The page is still rendering. Try again in a moment.');
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
    'flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold transition-colors hover:border-emerald-500 hover:bg-emerald-500/10 disabled:opacity-50';

  return (
    <div className="mt-6">
      <div className="mb-3 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={findThisPage} disabled={!!busy} className={btnClass}>
          {busy === 'this' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Find Categories (this page)
        </button>
        <button type="button" onClick={findAllPages} disabled={!!busy} className={btnClass}>
          {busy === 'all' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Find Categories (all pages)
          {busy === 'all' && progress ? ` · ${progress.done}/${progress.total}` : ''}
        </button>
      </div>

      {error && <p className="mb-2 text-center text-sm text-rose-400">{error}</p>}

      <div className="mx-auto max-w-2xl overflow-hidden rounded-xl border border-slate-800">
        <table className="w-full text-center text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2 font-medium">Model</th>
              <th className="px-4 py-2 font-medium">Category (page {page})</th>
              <th className="px-4 py-2 font-medium">API cost</th>
            </tr>
          </thead>
          <tbody>
            {NOTICE_MODELS.map((m) => {
              const cell = categories[m.id]?.[page];
              return (
                <tr key={m.id} className="border-b border-slate-800/60 last:border-0">
                  <td className="px-4 py-2.5 font-semibold text-slate-100">{m.label}</td>
                  <td className="px-4 py-2.5 text-slate-300">
                    {cell ?? (busy ? (
                      <Loader2 className="mx-auto h-4 w-4 animate-spin text-slate-500" />
                    ) : (
                      '—'
                    ))}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-emerald-300">
                    ${(costs[m.id] ?? 0).toFixed(2)}
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
