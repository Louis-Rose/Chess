import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2, Sparkles } from 'lucide-react';
import { NOTICE_MODELS } from './models';

// A table with one row per Gemini model: the model name, the category it assigns
// to the page currently shown (filled by "Find Categories"), and the running
// Gemini spend for that model in the Notice.ai feature. `getPageImage` captures
// the current page as a PNG; `page`/`docId` reset the categories on navigation.
export function CategoryTable({
  getPageImage,
  page,
  docId,
}: {
  getPageImage: () => string | null;
  page: number;
  docId: string;
}) {
  const [categories, setCategories] = useState<Record<string, string>>({});
  const [costs, setCosts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCosts = useCallback(async () => {
    try {
      const { data } = await axios.get<{ costs: Record<string, number> }>('/api/notice/costs');
      setCosts(data.costs || {});
    } catch {
      // non-fatal: leave the cost column blank
    }
  }, []);

  // Costs on mount; categories are page-specific, so clear them on page/doc change.
  useEffect(() => {
    void loadCosts();
  }, [loadCosts]);

  useEffect(() => {
    setCategories({});
    setError(null);
  }, [page, docId]);

  const findCategories = async () => {
    const image = getPageImage();
    if (!image) {
      setError('The page is still rendering. Try again in a moment.');
      return;
    }
    setError(null);
    setBusy(true);
    setCategories({});
    try {
      // Ask every model in parallel; fill each row as its answer lands.
      await Promise.all(
        NOTICE_MODELS.map(async (m) => {
          try {
            const { data } = await axios.post<{ category: string }>('/api/notice/categorize', {
              image,
              model: m.id,
            });
            setCategories((c) => ({ ...c, [m.id]: data.category }));
          } catch {
            setCategories((c) => ({ ...c, [m.id]: '—' }));
          }
        }),
      );
    } finally {
      setBusy(false);
      void loadCosts(); // classification calls added cost
    }
  };

  return (
    <div className="mt-6">
      <div className="mb-3 flex justify-center">
        <button
          type="button"
          onClick={findCategories}
          disabled={busy}
          className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold transition-colors hover:border-emerald-500 hover:bg-emerald-500/10 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Find Categories
        </button>
      </div>

      {error && <p className="mb-2 text-center text-sm text-rose-400">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-slate-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2 font-medium">Model</th>
              <th className="px-4 py-2 font-medium">Category</th>
              <th className="px-4 py-2 text-right font-medium">API cost</th>
            </tr>
          </thead>
          <tbody>
            {NOTICE_MODELS.map((m) => (
              <tr key={m.id} className="border-b border-slate-800/60 last:border-0">
                <td className="px-4 py-2.5 font-semibold text-slate-100">{m.label}</td>
                <td className="px-4 py-2.5 text-slate-300">
                  {busy && !categories[m.id] ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                  ) : (
                    categories[m.id] ?? '—'
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right text-emerald-300">
                  ${(costs[m.id] ?? 0).toFixed(4)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
