import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Check, Circle, Loader2, Search } from 'lucide-react';
import { useStores } from './StoresContext';
import { useLanguage } from '../../contexts/LanguageContext';

// An agent that hunts for an item across the configured store sites. The web app
// only enqueues the request; a worker on the owner's own machine (real Chrome,
// residential IP) actually browses the stores and posts results back, so even
// bot-protected sites like Octobre work. We enqueue, then poll for the result.
// The list of stores is shared with the Stores tab via StoresContext.
const POLL_MS = 2000;
const MAX_POLLS = 90; // ~3 min ceiling

// Clothing types the user can narrow the search to (a second toggle row). Folded
// into the agent prompt as a natural-language hint.
const CATEGORIES = [
  'shirts',
  'tshirts',
  'polos',
  'sweatshirts',
  'sweaters',
  'trousers',
  'shorts',
  'jackets',
  'coats',
  'suits',
  'shoes',
] as const;

type Item = {
  name: string;
  price: string | null;
  url: string | null;
  image: string | null;
  source: string | null;
};

// Live per-store progress reported by the browsing worker.
type Progress = { current: string | null; done: number; total: number };

export function AgentSearch() {
  const { stores } = useStores();
  const { t } = useLanguage();
  // Stores excluded from this search. Everything not in here is included, so
  // newly added stores are searched by default.
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  // Clothing types to narrow the search to (none selected = no type filter).
  const [types, setTypes] = useState<Set<string>>(() => new Set());
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  // Which backend stage the job is in while loading: 'queued' (waiting for the
  // worker to claim it) or 'browsing' (worker is on it). Drives the step list.
  const [stage, setStage] = useState<'queued' | 'browsing'>('queued');
  // The stores this search is browsing (captured at launch) and the worker's
  // live per-store progress, for the nested step list.
  const [searchStores, setSearchStores] = useState<{ domain: string; name: string }[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const cancelled = useRef(false);

  useEffect(() => () => {
    cancelled.current = true;
  }, []);

  const toggleStore = (domain: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  };

  const toggleType = (type: string) => {
    setTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const run = async () => {
    if (loading) return;
    const q = prompt.trim();
    const selectedTypes = CATEGORIES.filter((c) => types.has(c)).map((c) => t(`clothing.type.${c}`));
    const selectedStores = stores.filter((s) => !excluded.has(s.domain));
    const sources = selectedStores.map((s) => s.domain);
    if (sources.length === 0) {
      setError(t('clothing.find.selectStore'));
      return;
    }
    // Fold the chosen types into the prompt the browsing agent receives, as
    // plain keywords (no punctuation — the worker searches the store with this
    // text verbatim).
    const fullPrompt = [q, ...selectedTypes].filter(Boolean).join(' ').trim();
    cancelled.current = false;
    setError(null);
    setSummary(null);
    setItems(null);
    setStage('queued');
    setProgress(null);
    setSearchStores(selectedStores.map((s) => ({ domain: s.domain, name: s.name })));
    setLoading(true);
    try {
      const { data } = await axios.post<{ job_id: number }>('/api/clothing/search', {
        prompt: fullPrompt,
        sources,
      });
      const jobId = data.job_id;

      for (let i = 0; i < MAX_POLLS; i++) {
        await sleep(POLL_MS);
        if (cancelled.current) return;
        const { data: job } = await axios.get<{
          status: string;
          result?: { summary: string; items: Item[] };
          error?: string;
          progress?: Progress;
        }>(`/api/clothing/jobs/${jobId}`);
        if (job.status === 'running') setStage('browsing');
        if (job.progress) setProgress(job.progress);
        if (job.status === 'done') {
          setSummary(job.result?.summary || null);
          setItems(job.result?.items || []);
          return;
        }
        if (job.status === 'error') {
          setError(job.error || t('clothing.find.failed'));
          return;
        }
      }
      setError(t('clothing.find.tooLong'));
    } catch (err) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error : null;
      setError(msg || t('clothing.find.genericError'));
    } finally {
      if (!cancelled.current) setLoading(false);
    }
  };

  return (
    <div className="mb-8 rounded-2xl border border-slate-800 bg-slate-800/30 p-4 sm:p-5">
      <h2 className="mb-4 text-center text-xl font-semibold">{t('clothing.find.title')}</h2>

      {/* Two distinct categories of filters, separated by a divider:
          the stores to browse, then the clothing types to narrow to. */}
      {/* Store toggles — shared with the Stores tab. Tap to include/exclude. */}
      <div className="flex flex-wrap items-center justify-center gap-2 pb-4">
        {stores.map((s) => {
          const on = !excluded.has(s.domain);
          return (
            <button
              key={s.domain}
              type="button"
              onClick={() => toggleStore(s.domain)}
              aria-pressed={on}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                on
                  ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
                  : 'border-slate-700 bg-slate-800/40 text-slate-500 hover:text-slate-300'
              }`}
            >
              {s.name}
            </button>
          );
        })}
      </div>

      <div className="border-t border-slate-700/60" />

      {/* Clothing type toggles — narrow the search to specific types. */}
      <div className="flex flex-wrap items-center justify-center gap-2 pb-4 pt-4">
        {CATEGORIES.map((c) => {
          const on = types.has(c);
          return (
            <button
              key={c}
              type="button"
              onClick={() => toggleType(c)}
              aria-pressed={on}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                on
                  ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
                  : 'border-slate-700 bg-slate-800/40 text-slate-400 hover:text-slate-200'
              }`}
            >
              {t(`clothing.type.${c}`)}
            </button>
          );
        })}
      </div>

      {/* Prompt (optional) — press Enter to search (Shift+Enter for a new line) */}
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            run();
          }
        }}
        rows={2}
        placeholder={t('clothing.find.placeholder')}
        className="w-full resize-none rounded-xl border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
      />

      {/* Launch button — works even with no prompt typed (a vanilla search). */}
      <div className="mt-3 flex justify-center">
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-emerald-500/10 px-5 py-2 text-sm font-semibold text-emerald-300 transition-colors hover:border-emerald-500 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {t('clothing.find.run')}
        </button>
      </div>

      {loading && <SearchSteps stage={stage} stores={searchStores} progress={progress} />}
      {error && <p className="mt-3 text-center text-sm text-rose-400">{error}</p>}

      {/* Results — a table of model name and price. The summary only adds value
          alongside results; on zero results the localized line below says it. */}
      {summary && items && items.length > 0 && (
        <p className="mt-4 text-center text-sm text-slate-300">{summary}</p>
      )}
      {items && items.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 font-medium">{t('clothing.find.colName')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('clothing.find.colPrice')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr
                  key={i}
                  className="border-b border-slate-800/60 transition-colors last:border-0 hover:bg-slate-800/30"
                >
                  <td className="px-3 py-2">
                    {it.url ? (
                      <a
                        href={it.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-slate-100 hover:text-emerald-300"
                      >
                        {it.name}
                      </a>
                    ) : (
                      <span className="font-medium text-slate-100">{it.name}</span>
                    )}
                    {it.source && (
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-500">
                        {it.source}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-emerald-300">
                    {it.price || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {items && items.length === 0 && (
        <p className="mt-4 text-center text-sm text-slate-400">{t('clothing.find.nothing')}</p>
      )}
    </div>
  );
}

type StepState = 'done' | 'active' | 'pending';

function StepIcon({ state }: { state: StepState }) {
  if (state === 'done') return <Check className="h-4 w-4 flex-shrink-0 text-emerald-400" />;
  if (state === 'active')
    return <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-emerald-400" />;
  return <Circle className="h-3.5 w-3.5 flex-shrink-0 text-slate-600" />;
}

// Progress steps shown while a search runs. The first two map to real backend
// stages (queued -> the worker claimed the job and is browsing); the last is the
// list being assembled once the agent returns. While browsing, if the worker
// reports per-store progress, each searched store gets its own sub-step.
function SearchSteps({
  stage,
  stores,
  progress,
}: {
  stage: 'queued' | 'browsing';
  stores: { domain: string; name: string }[];
  progress: Progress | null;
}) {
  const { t } = useLanguage();
  const order = stage === 'queued' ? 0 : 1;
  const sentState: StepState = order > 0 ? 'done' : 'active';
  const browsingState: StepState = order === 1 ? 'active' : 'pending';

  // Per-store sub-step state: stores before the done count are done, the one
  // the worker names is active, the rest pending. Only shown once browsing and
  // the worker has actually reported progress.
  const storeState = (i: number, s: { domain: string }): StepState => {
    if (!progress) return 'pending';
    if (s.domain === progress.current) return 'active';
    if (i < progress.done) return 'done';
    return 'pending';
  };
  const showStores = stage === 'browsing' && !!progress && stores.length > 0;

  return (
    <ul className="mx-auto mt-4 w-fit space-y-2 text-sm">
      <li className="flex items-center gap-2">
        <StepIcon state={sentState} />
        <span className="text-slate-200">{t('clothing.find.step.sent')}</span>
      </li>

      <li>
        <div className="flex items-center gap-2">
          <StepIcon state={browsingState} />
          <span className={browsingState === 'pending' ? 'text-slate-500' : 'text-slate-200'}>
            {t('clothing.find.step.browsing')}
            {showStores && progress && progress.total > 0 && (
              <span className="ml-1 text-xs text-slate-500">
                {Math.min(progress.done, progress.total)}/{progress.total}
              </span>
            )}
          </span>
        </div>
        {showStores && (
          <ul className="ml-6 mt-2 space-y-1.5">
            {stores.map((s, i) => {
              const st = storeState(i, s);
              return (
                <li key={s.domain} className="flex items-center gap-2">
                  <StepIcon state={st} />
                  <span className={st === 'pending' ? 'text-slate-500' : 'text-slate-300'}>
                    {s.name}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </li>

      <li className="flex items-center gap-2">
        <StepIcon state="pending" />
        <span className="text-slate-500">{t('clothing.find.step.results')}</span>
      </li>
    </ul>
  );
}
