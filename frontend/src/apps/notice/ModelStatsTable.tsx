import { Brain, Info } from 'lucide-react';
import { NOTICE_MODELS, type NoticeModel } from './models';
import { useLanguage } from '../../contexts/LanguageContext';

// Per-model run economics for the Notice.ai categorize feature: cost, average
// time, number of calls and token usage (input / output / thinking). These are
// totals across the whole api_usage history, not just the current document. The
// table is read-only and lives in the standalone Pricing & Quotas tab; the model
// on/off control for runs lives in PageCategoriesTable (Étape 1).
export function ModelStatsTable({
  costs,
  times,
  calls,
  tokens,
  pricing,
  models = NOTICE_MODELS,
}: {
  costs: Record<string, number>;
  times: Record<string, number>;
  calls: Record<string, number>;
  tokens: Record<string, { input: number; output: number; thinking: number }>;
  pricing: Record<string, { input: number; output: number }>;
  // Which models to show as rows (defaults to the user-facing run models).
  models?: NoticeModel[];
}) {
  const { t } = useLanguage();

  return (
    <div className="mx-auto max-w-3xl overflow-hidden rounded-xl border-2 border-slate-300 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:shadow-lg">
      <table className="w-full text-center text-sm">
        <thead>
          <tr className="border-b-2 border-slate-300 text-xs uppercase tracking-wide text-slate-900 [&>th]:border-r-2 [&>th]:border-slate-300 [&>th:last-child]:border-r-0 dark:border-slate-600 dark:text-white dark:[&>th]:border-slate-700">
            <th className="w-56 px-4 py-2 font-medium">{t('notice.cat.model')}</th>
            <th className="px-4 py-2 font-medium">{t('notice.cat.cost')}</th>
            <th className="px-4 py-2 font-medium">{t('notice.cat.time')}</th>
            <th className="px-4 py-2 font-medium">{t('notice.cat.calls')}</th>
            <th className="px-4 py-2 font-medium">
              {t('notice.cat.tokens')}
              <br />
              {t('notice.cat.tokensUnits')}
            </th>
          </tr>
        </thead>
        <tbody>
          {models.map((m) => {
            const price = pricing[m.id];
            return (
              <tr
                key={m.id}
                className="border-b-2 border-slate-300 last:border-0 [&>td]:border-r-2 [&>td]:border-slate-300 [&>td:last-child]:border-r-0 dark:border-slate-700 dark:[&>td]:border-slate-700"
              >
                <td className="w-56 px-4 py-2.5 text-center font-semibold text-slate-900 dark:text-slate-100">
                  <span className="inline-flex items-center justify-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: m.color }}
                      aria-hidden
                    />
                    <span>{m.label}</span>
                    {price && (
                      <span className="group relative inline-flex">
                        <Info className="h-3.5 w-3.5 text-slate-400 transition-colors group-hover:text-emerald-600 dark:text-slate-500 dark:group-hover:text-emerald-400" />
                        <span
                          role="tooltip"
                          className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-max -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs font-normal leading-relaxed text-slate-700 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          {t('notice.cat.priceIn')}: ${price.input.toFixed(2)} / 1M
                          <br />
                          {t('notice.cat.priceOut')}: ${price.output.toFixed(2)} / 1M
                        </span>
                      </span>
                    )}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-emerald-600 dark:text-emerald-300">
                  ${(costs[m.id] ?? 0).toFixed(2)}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-slate-700 dark:text-slate-300">
                  {times[m.id] ? `${times[m.id].toFixed(1)}s` : '—'}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-slate-700 dark:text-slate-300">
                  {calls[m.id] ?? 0}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-slate-700 dark:text-slate-300">
                  {(tokens[m.id]?.input ?? 0).toLocaleString()}
                  <span className="text-slate-400 dark:text-slate-500"> ↓ / </span>
                  {(tokens[m.id]?.output ?? 0).toLocaleString()}
                  <span className="text-slate-400 dark:text-slate-500"> ↑ / </span>
                  {(tokens[m.id]?.thinking ?? 0).toLocaleString()}
                  <Brain
                    className="ml-1 inline h-3.5 w-3.5 align-text-bottom text-slate-400 dark:text-slate-500"
                    aria-label={t('notice.cat.thinking')}
                  />
                  <span className="sr-only"> {t('notice.cat.thinking')}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
