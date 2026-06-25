import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { ExternalLink, Loader2, Search, X } from 'lucide-react';

// An agent that hunts for an item across the configured store sites. The web app
// only enqueues the request; a worker on the owner's own machine (real Chrome,
// residential IP) actually browses the stores and posts results back, so even
// bot-protected sites like Octobre work. We enqueue, then poll for the result.
const SOURCES_KEY = 'clothing.sources';
const DEFAULT_SOURCES = ['octobre-editions.com'];
const POLL_MS = 2000;
const MAX_POLLS = 90; // ~3 min ceiling

type Item = {
  name: string;
  price: string | null;
  url: string | null;
  image: string | null;
  source: string | null;
};

function loadSources(): string[] {
  try {
    const raw = localStorage.getItem(SOURCES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.every((s) => typeof s === 'string')) return parsed;
    }
  } catch {
    /* fall through to default */
  }
  return DEFAULT_SOURCES;
}

function cleanDomain(raw: string): string {
  return raw.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].trim();
}

export function AgentSearch() {
  const [sources, setSources] = useState<string[]>(loadSources);
  const [newSource, setNewSource] = useState('');
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const cancelled = useRef(false);

  useEffect(() => () => {
    cancelled.current = true;
  }, []);

  const persist = (next: string[]) => {
    setSources(next);
    localStorage.setItem(SOURCES_KEY, JSON.stringify(next));
  };

  const addSource = () => {
    const d = cleanDomain(newSource);
    if (d && !sources.includes(d)) persist([...sources, d]);
    setNewSource('');
  };

  const removeSource = (d: string) => persist(sources.filter((s) => s !== d));

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const run = async () => {
    const q = prompt.trim();
    if (!q || loading) return;
    if (sources.length === 0) {
      setError('Add at least one source site first.');
      return;
    }
    cancelled.current = false;
    setError(null);
    setSummary(null);
    setItems(null);
    setLoading(true);
    try {
      const { data } = await axios.post<{ job_id: number }>('/api/clothing/search', {
        prompt: q,
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
        }>(`/api/clothing/jobs/${jobId}`);
        if (job.status === 'done') {
          setSummary(job.result?.summary || null);
          setItems(job.result?.items || []);
          return;
        }
        if (job.status === 'error') {
          setError(job.error || 'The search failed.');
          return;
        }
      }
      setError('The search is taking too long. Try again.');
    } catch (err) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error : null;
      setError(msg || 'Something went wrong. Please try again.');
    } finally {
      if (!cancelled.current) setLoading(false);
    }
  };

  return (
    <div className="mb-8 rounded-2xl border border-slate-800 bg-slate-800/30 p-4 sm:p-5">
      <h2 className="mb-1 text-sm font-semibold">Find it for me</h2>
      <p className="mb-3 text-xs text-slate-400">
        Describe what you want. Your agent browses the sites below and brings back what it finds.
      </p>

      {/* Sources */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {sources.map((s) => (
          <span
            key={s}
            className="flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800/60 py-1 pl-3 pr-1 text-xs text-slate-300"
          >
            {s}
            <button
              type="button"
              onClick={() => removeSource(s)}
              className="rounded-full p-0.5 text-slate-500 hover:bg-slate-700 hover:text-slate-200"
              aria-label={`Remove ${s}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={newSource}
          onChange={(e) => setNewSource(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSource())}
          placeholder="add a site…"
          className="w-32 rounded-full border border-dashed border-slate-700 bg-transparent px-3 py-1 text-xs text-slate-200 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
        />
      </div>

      {/* Prompt */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              run();
            }
          }}
          rows={2}
          placeholder="e.g. a light linen shirt for summer, under 90€"
          className="flex-1 resize-none rounded-xl border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={run}
          disabled={loading || !prompt.trim()}
          className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 transition-colors hover:border-emerald-500 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40 sm:w-32"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {loading ? 'Searching' : 'Search'}
        </button>
      </div>

      {loading && (
        <p className="mt-3 text-xs text-slate-500">
          Your agent is browsing the stores. This can take up to a minute.
        </p>
      )}
      {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}

      {/* Results */}
      {summary && <p className="mt-4 text-sm text-slate-300">{summary}</p>}
      {items && items.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {items.map((it, i) => (
            <ResultCard key={i} item={it} />
          ))}
        </div>
      )}
      {items && items.length === 0 && (
        <p className="mt-4 text-sm text-slate-400">Nothing found. Try rewording or adding a site.</p>
      )}
    </div>
  );
}

function ResultCard({ item }: { item: Item }) {
  const body = (
    <>
      {item.image && (
        <img
          src={item.image}
          alt=""
          loading="lazy"
          className="mb-2 aspect-[3/4] w-full rounded-lg object-cover"
        />
      )}
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-slate-100">{item.name}</p>
        {item.price && <span className="whitespace-nowrap text-xs text-emerald-300">{item.price}</span>}
      </div>
      {item.source && <p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-500">{item.source}</p>}
      {item.url && (
        <span className="mt-1.5 flex items-center gap-1 text-xs font-medium text-emerald-400">
          View <ExternalLink className="h-3 w-3" />
        </span>
      )}
    </>
  );

  const cls =
    'block rounded-xl border border-slate-800 bg-slate-800/40 p-2.5 text-left transition-colors hover:border-emerald-500/60';

  return item.url ? (
    <a href={item.url} target="_blank" rel="noreferrer" className={cls}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}
