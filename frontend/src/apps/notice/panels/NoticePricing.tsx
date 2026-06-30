import { useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2, Wallet } from 'lucide-react';
import { ModelStatsTable } from '../ModelStatsTable';
import { useLanguage } from '../../../contexts/LanguageContext';

// Per-phase economics keyed by model id (cost / avg time / call count / tokens).
type PhaseStats = {
  costs: Record<string, number>;
  times: Record<string, number>;
  calls: Record<string, number>;
  tokens: Record<string, { input: number; output: number; thinking: number }>;
};
const EMPTY: PhaseStats = { costs: {}, times: {}, calls: {}, tokens: {} };

// The backend tags each Gemini call with a phase; map each one to its assembly
// step so the tab shows one table per Étape, in order.
const ETAPES = [{ phase: 'categorize', n: 1 }, { phase: 'parts', n: 2 }, { phase: 'brand', n: 3 }];

// Pricing & Quotas: a read-only view of the per-model run economics (cost, average
// time, number of calls, token usage), one table per assembly step. The figures
// are global (across all documents), so they live in their own tab rather than
// inside the reader. The model on/off control for runs stays in Étape 1.
export function NoticePricing() {
  const { t } = useLanguage();
  const [phases, setPhases] = useState<Record<string, PhaseStats>>({});
  const [pricing, setPricing] = useState<Record<string, { input: number; output: number }>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await axios.get<{
          phases: Record<string, PhaseStats>;
          pricing: Record<string, { input: number; output: number }>;
        }>('/api/notice/costs');
        if (cancelled) return;
        setPhases(data.phases || {});
        setPricing(data.pricing || {});
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
        <div className="flex flex-col gap-10">
          {ETAPES.map(({ phase, n }) => {
            const stats = phases[phase] || EMPTY;
            return (
              <section key={phase}>
                <h2 className="mb-3 text-center text-lg font-semibold text-slate-800 dark:text-slate-200">
                  {t('notice.step')} {n}
                  {t('notice.step.sep')}
                  {t(`notice.step${n}.title`)}
                </h2>
                <ModelStatsTable
                  costs={stats.costs}
                  times={stats.times}
                  calls={stats.calls}
                  tokens={stats.tokens}
                  pricing={pricing}
                />
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
