import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { ExternalLink } from 'lucide-react';
import { useStores } from './StoresContext';
import { useLanguage } from '../../contexts/LanguageContext';

// An agent that hunts for an item across the configured store sites. The web app
// only enqueues the request; a worker on the owner's own machine (real Chrome,
// residential IP) actually browses the stores and posts results back, so even
// bot-protected sites like Octobre work. We enqueue, then poll for the result.
// The list of stores is shared with the Stores tab via StoresContext.
const POLL_MS = 2000;
const MAX_POLLS = 90; // ~3 min ceiling

type Item = {
  name: string;
  price: string | null;
  url: string | null;
  image: string | null;
  source: string | null;
};

export function AgentSearch() {
  const { stores } = useStores();
  const { t } = useLanguage();
  // Stores excluded from this search. Everything not in here is included, so
  // newly added stores are searched by default.
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
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

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const run = async () => {
    const q = prompt.trim();
    if (!q || loading) return;
    const sources = stores.filter((s) => !excluded.has(s.domain)).map((s) => s.domain);
    if (sources.length === 0) {
      setError(t('clothing.find.selectStore'));
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

      {/* Store toggles — shared with the Stores tab. Tap to include/exclude. */}
      <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
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

      {/* Prompt — press Enter to search (Shift+Enter for a new line) */}
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

      {loading && (
        <p className="mt-3 text-xs text-slate-500">{t('clothing.find.searching')}</p>
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
        <p className="mt-4 text-sm text-slate-400">{t('clothing.find.nothing')}</p>
      )}
    </div>
  );
}

function ResultCard({ item }: { item: Item }) {
  const { t } = useLanguage();
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
          {t('clothing.find.view')} <ExternalLink className="h-3 w-3" />
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
