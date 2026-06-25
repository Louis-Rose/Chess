import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Loader2, Sparkles } from 'lucide-react';
import { NOTICE_MODELS } from './models';

// model id -> page number -> value (category label, or thought summary)
type ByModelPage = Record<string, Record<number, string>>;

// Categories and thoughts are remembered per PDF in this browser, keyed by
// document id, so they survive reloads. Each (page, model) keeps only its most
// recent result.
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
  const [categories, setCategories] = useState<ByModelPage>({});
  const categoriesRef = useRef<ByModelPage>({});
  const [thoughts, setThoughts] = useState<ByModelPage>({});
  const thoughtsRef = useRef<ByModelPage>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
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

  // Load this PDF's remembered categories + thoughts when the document changes.
  useEffect(() => {
    const cats = loadMap('categories', docId);
    const ths = loadMap('thoughts', docId);
    categoriesRef.current = cats;
    thoughtsRef.current = ths;
    setCategories(cats);
    setThoughts(ths);
    setExpanded({});
    setError(null);
    setProgress(null);
  }, [docId]);

  // Record one (model, page) result (and its reasoning), keeping only the most
  // recent, and persist.
  const setResult = (modelId: string, pageNum: number, category: string, thought: string) => {
    const nextCats: ByModelPage = { ...categoriesRef.current };
    nextCats[modelId] = { ...(nextCats[modelId] || {}), [pageNum]: category };
    categoriesRef.current = nextCats;
    setCategories(nextCats);
    saveMap('categories', docId, nextCats);

    const nextThoughts: ByModelPage = { ...thoughtsRef.current };
    nextThoughts[modelId] = { ...(nextThoughts[modelId] || {}), [pageNum]: thought };
    thoughtsRef.current = nextThoughts;
    setThoughts(nextThoughts);
    saveMap('thoughts', docId, nextThoughts);
  };

  // Classify one page image across every model, storing results per (model, page).
  const classify = async (image: string, pageNum: number) => {
    await Promise.all(
      NOTICE_MODELS.map(async (m) => {
        try {
          const { data } = await axios.post<{ category: string; thoughts?: string }>(
            '/api/notice/categorize',
            { image, model: m.id },
          );
          setResult(m.id, pageNum, data.category, data.thoughts || '');
        } catch {
          setResult(m.id, pageNum, '—', '');
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

      <div className="mx-auto max-w-3xl overflow-hidden rounded-xl border border-slate-800">
        <table className="w-full text-center text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-white">
              <th className="px-4 py-2 font-medium">Model</th>
              <th className="px-4 py-2 font-medium">Category (page {page})</th>
              <th className="px-4 py-2 font-medium">API cost</th>
              <th className="px-4 py-2 font-medium">Time taken</th>
            </tr>
          </thead>
          <tbody>
            {NOTICE_MODELS.map((m) => {
              const cell = categories[m.id]?.[page];
              const thought = thoughts[m.id]?.[page];
              const canShowThinking = !!m.thinking && !!thought;
              const open = canShowThinking && !!expanded[m.id];
              return (
                <Fragment key={m.id}>
                  <tr className={open ? '' : 'border-b border-slate-800/60 last:border-0'}>
                    <td className="px-4 py-2.5 font-semibold text-slate-100">
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <span>{m.label}</span>
                        {canShowThinking && (
                          <button
                            type="button"
                            onClick={() => setExpanded((e) => ({ ...e, [m.id]: !e[m.id] }))}
                            className="text-xs font-medium text-emerald-400 transition-colors hover:text-emerald-300"
                          >
                            {open ? 'Hide thinking' : 'Show thinking'}
                          </button>
                        )}
                      </div>
                    </td>
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
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-300">
                      {times[m.id] ? `${times[m.id].toFixed(1)}s` : '—'}
                    </td>
                  </tr>
                  {open && (
                    <tr className="border-b border-slate-800/60 last:border-0">
                      <td colSpan={4} className="px-4 pb-3">
                        <textarea
                          readOnly
                          value={thought}
                          className="h-44 w-full resize-y rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-left text-xs leading-relaxed text-slate-300 focus:outline-none"
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
