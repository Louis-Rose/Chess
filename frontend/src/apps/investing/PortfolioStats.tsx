import { type ReactNode } from 'react';
import { type CorrelationResponse, effectiveNumber, pct, solidColor } from './shared';

function StatBlock({
  label,
  symbol,
  value,
  color,
  children,
}: {
  label: string;
  symbol?: string;
  value: string;
  color: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-3 border-t border-slate-700 pt-6 text-center first:border-t-0 first:pt-0 sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0 sm:first:border-l-0 sm:first:pl-0">
      <div className="flex items-baseline justify-center gap-2">
        <span className="text-sm font-semibold text-slate-300">{label}</span>
        {symbol && <span className="text-slate-400">({symbol})</span>}
      </div>
      <span className="text-5xl font-bold" style={{ color }}>
        {value}
      </span>
      <p className="text-sm leading-relaxed text-slate-400">{children}</p>
    </div>
  );
}

const VOL_BLUE = 'rgb(56, 189, 248)'; // sky-400

// Row 1: each selected stock's annualised volatility, then the portfolio average.
function VolatilityRow({ data }: { data: CorrelationResponse }) {
  return (
    <div className="flex w-full flex-col items-center gap-4 rounded-2xl border border-slate-700 bg-slate-800/50 p-6 text-center">
      <div className="flex items-baseline justify-center gap-2">
        <span className="text-sm font-semibold text-slate-300">Volatilité annualisée</span>
        <span className="text-slate-400">(σ̄)</span>
      </div>

      <div className="flex flex-wrap items-end justify-center gap-x-8 gap-y-4">
        {data.tickers.map((t) => (
          <div key={t} className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t}</span>
            <span className="text-2xl font-bold text-sky-300">{pct(data.volatilities[t])}</span>
          </div>
        ))}

        <div className="h-12 w-px self-center bg-slate-700" />

        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">Moyenne</span>
          <span className="text-4xl font-bold" style={{ color: VOL_BLUE }}>
            {pct(data.avg_volatility)}
          </span>
        </div>
      </div>

      <p className="text-sm leading-relaxed text-slate-400">
        Écart-type annualisé des rendements quotidiens de chaque action, et leur moyenne. C'est
        l'amplitude typique des variations sur un an.
      </p>
    </div>
  );
}

// Row 3: the irreducible volatility floor. Pure diversification within a single
// universe can never push volatility below avg_volatility * sqrt(rho-bar).
function RiskFloor({ rho, volatility }: { rho: number; volatility: number }) {
  if (rho <= 0) return null; // floor only meaningful for a positive average correlation
  const sqrtRho = Math.sqrt(rho);
  const floor = volatility * sqrtRho;
  const savings = volatility - floor;
  return (
    <div className="flex w-full flex-col items-center gap-4 rounded-2xl border border-slate-700 bg-slate-800/50 p-6 text-center">
      <span className="text-center text-sm font-semibold text-slate-300">
        Volatilité minimale absolue (plancher de risque)
      </span>

      <span className="text-5xl font-bold" style={{ color: 'rgb(251, 191, 36)' }}>
        {pct(floor)}
      </span>

      <div className="text-sm text-slate-300">
        Plancher = σ̄ × √ρ̄ = {pct(volatility)} × √{rho.toFixed(3)} = {pct(volatility)} ×{' '}
        {sqrtRho.toFixed(3)}
      </div>

      <p className="text-sm leading-relaxed text-slate-400">
        La diversification pure au sein de cet univers ne peut faire économiser au maximum que{' '}
        {pct(savings)} de volatilité (passer de {pct(volatility)} à {pct(floor)}). Ce plancher reste
        incompressible tant que la corrélation moyenne ρ̄ ne baisse pas, par exemple en intégrant des
        actifs d'autres secteurs.
      </p>
    </div>
  );
}

// Row 4: simplified VaR. Under a normal distribution, ~95% of yearly outcomes
// fall within +/-2 sigma and ~99.7% within +/-3 sigma of the mean.
function DeviationScenarios({ data, rho }: { data: CorrelationResponse; rho: number }) {
  const sigma = data.avg_volatility;
  const n = data.tickers.length;
  const effective = effectiveNumber(rho, n);

  // The single most volatile name drives much of the portfolio's tail risk.
  const topTicker = data.tickers.reduce((a, b) =>
    data.volatilities[b] > data.volatilities[a] ? b : a,
  );

  const bands = [
    { label: 'Zone de fluctuation normale', conf: '2 écarts-types · confiance 95 %', mult: 2 },
  ];

  return (
    <div className="flex w-full flex-col items-center gap-4 rounded-2xl border border-slate-700 bg-slate-800/50 p-6 text-center">
      <span className="text-center text-sm font-semibold text-slate-300">
        Scénarios de déviation (VaR simplifiée)
      </span>

      <div className="flex flex-col gap-4 sm:flex-row sm:justify-center sm:gap-8">
        {bands.map(({ label, conf, mult }) => (
          <div key={mult} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-sm font-semibold text-slate-200">{label}</span>
            <span className="text-xs text-slate-400">{conf}</span>
            <span className="mt-1 text-4xl font-bold" style={{ color: 'rgb(248, 113, 113)' }}>
              ±{pct(mult * sigma)}
            </span>
            <span className="text-xs text-slate-500">
              ±{mult} × {pct(sigma)}
            </span>
          </div>
        ))}
      </div>

      <p className="text-sm leading-relaxed text-slate-400">
        La forte volatilité moyenne (portée par {topTicker} à {pct(data.volatilities[topTicker])})
        combinée au faible nombre effectif d'actions ({effective !== null ? effective.toFixed(2) : '—'})
        expose le portefeuille à des déviations annuelles massives : à 95 % de confiance, les
        rendements s'étirent sur ±{pct(2 * sigma)} autour de la tendance moyenne.
      </p>
    </div>
  );
}

// Row 5: inverse-volatility (risk parity) allocation. Each stock gets a weight
// proportional to 1/sigma^2, so every name contributes equally to risk. The
// resulting weighted average volatility sits below the equal-weighted one.
function WeightOptimization({ data }: { data: CorrelationResponse }) {
  const { tickers, volatilities } = data;
  const n = tickers.length;
  const equalW = 1 / n;
  const invVar = (t: string) => 1 / volatilities[t] ** 2;
  const sumInv = tickers.reduce((s, t) => s + invVar(t), 0);
  const weight = (t: string) => invVar(t) / sumInv;
  const weightedVol = tickers.reduce((s, t) => s + weight(t) * volatilities[t], 0);
  const equalVol = data.avg_volatility;

  const minTicker = tickers.reduce((a, b) => (volatilities[b] < volatilities[a] ? b : a));
  const maxTicker = tickers.reduce((a, b) => (volatilities[b] > volatilities[a] ? b : a));

  return (
    <div className="flex w-full flex-col items-center gap-4 rounded-2xl border border-slate-700 bg-slate-800/50 p-6 text-center">
      <span className="text-center text-sm font-semibold text-slate-300">
        Optimisation des poids (volatilité inverse · risk parity)
      </span>

      <p className="text-sm leading-relaxed text-slate-400">
        La volatilité moyenne de {pct(equalVol)} suppose un portefeuille équipondéré ({pct(equalW)}{' '}
        par action). En pondérant chaque action par l'inverse de sa variance, chacune contribue de
        manière égale au risque global : on surpondère les plus stables ({minTicker}) au détriment des
        plus nerveuses ({maxTicker}).
      </p>

      <div className="text-sm text-slate-300">wᵢ = (1/σᵢ²) / Σ(1/σⱼ²)</div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[28rem] border-separate border-spacing-y-1 text-left text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-1 pr-4 font-semibold">Action</th>
              <th className="py-1 pr-4 text-right font-semibold">σ</th>
              <th className="py-1 pr-4 text-right font-semibold">Équipondéré</th>
              <th className="py-1 text-right font-semibold">Optimisé</th>
            </tr>
          </thead>
          <tbody>
            {tickers.map((t) => (
              <tr key={t} className="text-slate-200">
                <td className="py-1 pr-4 font-medium">{t}</td>
                <td className="py-1 pr-4 text-right text-slate-400">{pct(volatilities[t])}</td>
                <td className="py-1 pr-4 text-right text-slate-400">{pct(equalW)}</td>
                <td className="py-1 text-right font-semibold text-emerald-300">{pct(weight(t))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex w-full flex-col items-center gap-1 border-t border-slate-700 pt-4">
        <span className="text-sm font-semibold text-slate-300">
          Volatilité moyenne pondérée (risk parity)
        </span>
        <div className="flex items-baseline justify-center gap-3">
          <span className="text-4xl font-bold" style={{ color: 'rgb(52, 211, 153)' }}>
            {pct(weightedVol)}
          </span>
          <span className="text-sm text-slate-400">
            vs {pct(equalVol)} équipondéré · −{pct(equalVol - weightedVol)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function PortfolioStats({ data, rho }: { data: CorrelationResponse; rho: number }) {
  const n = data.tickers.length;
  const effective = effectiveNumber(rho, n);
  return (
    <div className="flex w-full flex-col gap-6">
      <VolatilityRow data={data} />

      <div className="flex w-full flex-col gap-6 rounded-2xl border border-slate-700 bg-slate-800/50 p-6 sm:flex-row sm:gap-8">
        <StatBlock
          label="Corrélation moyenne"
          symbol="ρ̄"
          value={rho.toFixed(3)}
          color={solidColor(rho)}
        >
          Moyenne des corrélations entre toutes les paires d'actions sélectionnées. Elle fixe le
          plancher de risque du portefeuille : la volatilité ne peut pas descendre sous la volatilité
          moyenne des actions multipliée par √ρ̄.
        </StatBlock>

        <StatBlock
          label="Nombre effectif d'actions"
          value={effective !== null ? effective.toFixed(2) : '—'}
          color="rgb(52, 211, 153)"
        >
          N / (1 + ρ̄(N−1)) : le nombre d'actions totalement décorrélées auquel équivaut réellement ce
          panier de {n}. Plus il est bas, moins la diversification est efficace.
        </StatBlock>
      </div>

      <RiskFloor rho={rho} volatility={data.avg_volatility} />

      <DeviationScenarios data={data} rho={rho} />

      <WeightOptimization data={data} />
    </div>
  );
}
