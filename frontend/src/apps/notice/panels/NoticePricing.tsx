import { useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2, Wallet } from 'lucide-react';
import { ModelStatsTable } from '../ModelStatsTable';
import { useLanguage } from '../../../contexts/LanguageContext';

// Pricing & Quotas: a read-only view of the per-model run economics (cost, average
// time, number of calls, token usage) totalled across the whole api_usage history.
// The figures are global (not per-document), so they live in their own tab rather
// than inside the reader. The model on/off control for runs stays in Étape 1.
export function NoticePricing() {
  const { t } = useLanguage();
  const [costs, setCosts] = useState<Record<string, number>>({});
  const [times, setTimes] = useState<Record<string, number>>({});
  const [calls, setCalls] = useState<Record<string, number>>({});
  const [tokens, setTokens] = useState<
    Record<string, { input: number; output: number; thinking: number }>
  >({});
  const [pricing, setPricing] = useState<Record<string, { input: number; output: number }>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await axios.get<{
          costs: Record<string, number>;
          times: Record<string, number>;
          calls: Record<string, number>;
          tokens: Record<string, { input: number; output: number; thinking: number }>;
          pricing: Record<string, { input: number; output: number }>;
        }>('/api/notice/costs');
        if (cancelled) return;
        setCosts(data.costs || {});
        setTimes(data.times || {});
        setCalls(data.calls || {});
        setTokens(data.tokens || {});
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
      <div className="mb-6 flex items-center justify-center gap-3">
        <Wallet className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t('notice.nav.pricing')}</h1>
      </div>

      {!loaded ? (
        <div className="flex justify-center py-8 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <ModelStatsTable costs={costs} times={times} calls={calls} tokens={tokens} pricing={pricing} />
      )}
    </div>
  );
}
