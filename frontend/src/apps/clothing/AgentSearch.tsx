import { useState } from 'react';
import axios from 'axios';
import { ExternalLink, Loader2, Search, X } from 'lucide-react';

// An agent that hunts for an item across the configured store sites. The user
// types what they want, the backend hands it to Gemini with web search, and we
// render the products it finds. Sources are editable and persisted locally.
const SOURCES_KEY = 'clothing.sources';
const DEFAULT_SOURCES = ['octobre-editions.com'];

type Item = {
  name: string;
  price: string | null;
  url: string | null;
  note: string;
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

  const run = async () => {
    const q = prompt.trim();
    if (!q || loading) return;
    if (sources.length === 0) {
      setError('Add at least one source site first.');
      return;
    }
    setError(null);
    setSummary(null);
    setItems(null);
    setLoading(true);
    try {
      const { data } = await axios.post<{ summary: string; items: Item[] }>(
        '/api/clothing/search',
        { prompt: q, sources },
      );
      setSummary(data.summary || null);
      setItems(data.items || []);
    } catch (err) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error : null;
      setError(msg || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-8 rounded-2xl border border-slate-800 bg-slate-800/30 p-4 sm:p-5">
      <h2 className="mb-1 text-sm font-semibold">Find it for me</h2>
      <p className="mb-3 text-xs text-slate-400">
        Describe what you want. The agent searches the sites below and brings back what it finds.
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

      {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}

      {/* Results */}
      {summary && <p className="mt-4 text-sm text-slate-300">{summary}</p>}
      {items && items.length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {items.map((it, i) => (
            <ResultCard key={i} item={it} />
          ))}
        </div>
      )}
      {items && items.length === 0 && !summary && (
        <p className="mt-4 text-sm text-slate-400">Nothing found. Try rewording or adding a site.</p>
      )}
    </div>
  );
}

function ResultCard({ item }: { item: Item }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-slate-100">{item.name}</p>
        {item.price && <span className="whitespace-nowrap text-sm text-emerald-300">{item.price}</span>}
      </div>
      {item.note && <p className="mt-1 text-xs text-slate-400">{item.note}</p>}
      {item.url && (
        <span className="mt-2 flex items-center gap-1 text-xs font-medium text-emerald-400">
          View <ExternalLink className="h-3 w-3" />
        </span>
      )}
    </>
  );

  const cls =
    'block rounded-xl border border-slate-800 bg-slate-800/40 p-3 text-left transition-colors hover:border-emerald-500/60';

  return item.url ? (
    <a href={item.url} target="_blank" rel="noreferrer" className={cls}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}
