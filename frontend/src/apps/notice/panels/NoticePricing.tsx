import { useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2, Wallet } from 'lucide-react';
import { ModelStatsTable } from '../ModelStatsTable';
import { NOTICE_MODELS } from '../models';
import { useLanguage } from '../../../contexts/LanguageContext';

// A thin used/total progress bar; turns rose once the limit is reached.
function Bar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const over = total > 0 && used >= total;
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
      <div
        className={`h-full rounded-full transition-[width] ${over ? 'bg-rose-500' : 'bg-emerald-500'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// Per-phase economics keyed by model id (cost / avg time / call count / tokens).
type PhaseStats = {
  costs: Record<string, number>;
  times: Record<string, number>;
  calls: Record<string, number>;
  tokens: Record<string, { input: number; output: number; thinking: number }>;
};
const EMPTY: PhaseStats = { costs: {}, times: {}, calls: {}, tokens: {} };

// The two top-level dividers: Tarifs (cost tables) and Quotas (usage bars).
const sectionHeaderCls =
  'border-b border-slate-200 pb-2 text-center text-xl font-bold text-slate-900 dark:border-slate-700 dark:text-slate-100';

// Each assembly step maps to the backend phase(s) whose Gemini usage it covers.
// Étape 1 runs both the page classification and the brand detection (fired in
// parallel by Lancer). Étape 3's real-image search runs on Serper, which is
// billed in credits rather than Gemini tokens, so it has no Gemini phase.
const ETAPES: { n: number; phases: string[]; serper?: boolean }[] = [
  { n: 1, phases: ['categorize', 'brand'] },
  { n: 2, phases: ['parts'] },
  { n: 3, phases: [], serper: true },
];

// Sum several phase buckets into one. Cost / calls / tokens add up; the average
// time is recombined as a call-weighted mean (averaging averages would be wrong).
function mergePhases(buckets: PhaseStats[]): PhaseStats {
  const out: PhaseStats = { costs: {}, times: {}, calls: {}, tokens: {} };
  const weightedTime: Record<string, number> = {};
  for (const b of buckets) {
    for (const [m, n] of Object.entries(b.calls)) out.calls[m] = (out.calls[m] || 0) + n;
    for (const [m, c] of Object.entries(b.costs)) out.costs[m] = (out.costs[m] || 0) + c;
    for (const [m, tk] of Object.entries(b.tokens)) {
      const cur = out.tokens[m] || { input: 0, output: 0, thinking: 0 };
      out.tokens[m] = {
        input: cur.input + tk.input,
        output: cur.output + tk.output,
        thinking: cur.thinking + tk.thinking,
      };
    }
    for (const [m, avg] of Object.entries(b.times)) {
      weightedTime[m] = (weightedTime[m] || 0) + avg * (b.calls[m] || 0);
    }
  }
  for (const [m, total] of Object.entries(weightedTime)) {
    const c = out.calls[m] || 0;
    out.times[m] = c > 0 ? total / c : 0;
  }
  return out;
}

// Pricing & Quotas: a read-only view of the per-model run economics (cost, average
// time, number of calls, token usage), one table per assembly step. The figures
// are global (across all documents), so they live in their own tab rather than
// inside the reader. The model on/off control for runs stays in Étape 1.
export function NoticePricing() {
  const { t } = useLanguage();
  const [phases, setPhases] = useState<Record<string, PhaseStats>>({});
  const [pricing, setPricing] = useState<Record<string, { input: number; output: number }>>({});
  const [serper, setSerper] = useState<{ used: number; total: number } | null>(null);
  const [freeQuota, setFreeQuota] = useState<Record<string, { used: number; limit: number }>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [costs, quota, free] = await Promise.all([
          axios.get<{
            phases: Record<string, PhaseStats>;
            pricing: Record<string, { input: number; output: number }>;
          }>('/api/notice/costs'),
          axios.get<{ used: number; total: number }>('/api/notice/serper-quota'),
          axios.get<Record<string, { used: number; limit: number }>>('/api/notice/free-quota'),
        ]);
        if (cancelled) return;
        setPhases(costs.data.phases || {});
        setPricing(costs.data.pricing || {});
        setSerper(quota.data);
        setFreeQuota(free.data || {});
      } catch {
        // non-fatal: leave the figures empty
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex items-center justify-center gap-3">
        <Wallet className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t('notice.nav.pricing')}</h1>
      </div>

      {!loaded ? (
        <div className="flex justify-center py-8 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col gap-14">
          {/* Tarifs: per-étape Gemini cost tables (Étape 3 runs on Serper). */}
          <div className="flex flex-col gap-10">
            <h2 className={sectionHeaderCls}>{t('notice.pricing.tarifs')}</h2>
            {ETAPES.map(({ n, phases: keys, serper: serperPhase }) => {
              const stats = mergePhases(keys.map((k) => phases[k] || EMPTY));
              return (
                <section key={n}>
                  <h3 className="mb-3 text-center text-lg font-semibold text-slate-800 dark:text-slate-200">
                    {t('notice.step')} {n}
                    {t('notice.step.sep')}
                    {t(`notice.step${n}.title`)}
                  </h3>
                  {serperPhase ? (
                    <p className="mx-auto max-w-md text-center text-sm text-slate-500 dark:text-slate-400">
                      {t('notice.pricing.serper')}
                    </p>
                  ) : (
                    <ModelStatsTable
                      costs={stats.costs}
                      times={stats.times}
                      calls={stats.calls}
                      tokens={stats.tokens}
                      pricing={pricing}
                    />
                  )}
                </section>
              );
            })}
          </div>

          {/* Quotas: Serper credits + Gemini free-tier usage today. */}
          <div className="flex flex-col gap-8">
            <h2 className={sectionHeaderCls}>{t('notice.pricing.quotas')}</h2>

            {serper && (
              <div className="mx-auto w-full max-w-md">
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {t('notice.pricing.serperCredits')}
                  </span>
                  <span className="tabular-nums text-slate-600 dark:text-slate-400">
                    {serper.used.toLocaleString()} / {serper.total.toLocaleString()}
                  </span>
                </div>
                <Bar used={serper.used} total={serper.total} />
              </div>
            )}

            <div>
              <h3 className="mb-3 text-center text-lg font-semibold text-slate-800 dark:text-slate-200">
                {t('notice.pricing.freeTier')}
              </h3>
              <div className="mx-auto flex max-w-md flex-col gap-4">
                {NOTICE_MODELS.map((m) => {
                  const q = freeQuota[m.id] || { used: 0, limit: 0 };
                  return (
                    <div key={m.id}>
                      <div className="mb-1.5 flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: m.color }} aria-hidden />
                          {m.label}
                        </span>
                        <span className="tabular-nums text-slate-600 dark:text-slate-400">
                          {q.used.toLocaleString()} / {q.limit.toLocaleString()}
                        </span>
                      </div>
                      <Bar used={q.used} total={q.limit} />
                    </div>
                  );
                })}
              </div>
              <p className="mx-auto mt-3 max-w-md text-center text-xs text-slate-400 dark:text-slate-500">
                {t('notice.pricing.freeNote')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
