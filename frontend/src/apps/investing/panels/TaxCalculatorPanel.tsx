// Tax Calculator Panel - Compare CTO (unrealized gains tax) vs French Holding scenarios

import { useState, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useLanguage } from '../../../contexts/LanguageContext';

interface YearlyData {
  year: number;
  dutchPortfolio: number;
  dutchTax: number;
  dutchCumulativeTax: number;
  frenchPortfolio: number;
  frenchCosts: number;
  frenchCumulativeCosts: number;
}

interface SimulationResult {
  yearly: YearlyData[];
  dutchNetFinal: number;
  frenchNetFinal: number;
}

// CTO with 31.4% tax on unrealized gains each year
function simulateCTO(years: number, growthRate: number, v0: number): { yearly: { portfolio: number; tax: number; cumulativeTax: number }[] } {
  const yearly: { portfolio: number; tax: number; cumulativeTax: number }[] = [];
  let portfolio = v0;
  let cumulativeTax = 0;

  for (let y = 1; y <= years; y++) {
    const startValue = portfolio;
    const endValue = startValue * (1 + growthRate / 100);
    const unrealizedGains = endValue - startValue;
    const tax = Math.max(0, unrealizedGains * 0.314);
    portfolio = endValue - tax;
    cumulativeTax += tax;
    yearly.push({ portfolio, tax, cumulativeTax });
  }

  return { yearly };
}

// French Holding: no yearly tax on gains, IS at 15% then flat tax 31.4% on dividends at exit
function simulateHolding(years: number, growthRate: number, v0: number): {
  yearly: { portfolio: number; costs: number; cumulativeCosts: number }[];
  netInPocket: number;
} {
  const yearly: { portfolio: number; costs: number; cumulativeCosts: number }[] = [];
  let portfolio = v0;
  let cumulativeCosts = 0;

  for (let y = 1; y <= years; y++) {
    portfolio = portfolio * (1 + growthRate / 100);
    yearly.push({ portfolio, costs: 0, cumulativeCosts });
  }

  // Exit: corporate tax (IS) at 15% on gains, then flat tax 31.4% on dividends
  const finalValue = portfolio;
  const totalGain = Math.max(0, finalValue - v0);

  // IS at 15%
  const corporateTax = totalGain * 0.15;
  const afterIS = finalValue - corporateTax;

  // Distributable dividend = afterIS - v0 (return of capital is tax-free)
  const dividend = Math.max(0, afterIS - v0);
  const flatTax = dividend * 0.314;
  const netInPocket = afterIS - flatTax;

  return { yearly, netInPocket };
}

function formatEuro(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `€${(value / 1_000_000).toFixed(2)}M`;
  }
  return `€${value.toLocaleString('en', { maximumFractionDigits: 0 })}`;
}

export function TaxCalculatorPanel() {
  const { t, language } = useLanguage();

  const [years, setYears] = useState(10);
  const [growthRate, setGrowthRate] = useState(7);
  const [initialValue, setInitialValue] = useState(100000);

  const simulation = useMemo<SimulationResult>(() => {
    const cto = simulateCTO(years, growthRate, initialValue);
    const holding = simulateHolding(years, growthRate, initialValue);

    const yearly: YearlyData[] = [];
    for (let i = 0; i < years; i++) {
      yearly.push({
        year: i + 1,
        dutchPortfolio: cto.yearly[i].portfolio,
        dutchTax: cto.yearly[i].tax,
        dutchCumulativeTax: cto.yearly[i].cumulativeTax,
        frenchPortfolio: holding.yearly[i].portfolio,
        frenchCosts: holding.yearly[i].costs,
        frenchCumulativeCosts: holding.yearly[i].cumulativeCosts,
      });
    }

    // CTO net = final portfolio (taxes already deducted yearly)
    const dutchNetFinal = cto.yearly[years - 1].portfolio;
    const frenchNetFinal = holding.netInPocket;

    return { yearly, dutchNetFinal, frenchNetFinal };
  }, [years, growthRate, initialValue]);

  const difference = simulation.frenchNetFinal - simulation.dutchNetFinal;
  const differencePercent = simulation.dutchNetFinal !== 0
    ? ((difference / simulation.dutchNetFinal) * 100)
    : 0;
  const frenchWins = difference > 0;

  const chartData = simulation.yearly.map((d) => ({
    year: d.year,
    cto: Math.round(d.dutchPortfolio),
    holding: Math.round(d.frenchPortfolio),
  }));

  const ctoLabel = language === 'fr' ? 'CTO (31.4% gains latents)' : 'CTO (31.4% unrealized gains)';
  const holdingLabel = language === 'fr' ? 'Holding (IS 15% + PFU 31.4%)' : 'Holding (IS 15% + flat tax 31.4%)';

  return (
    <div className="md:animate-in md:fade-in md:slide-in-from-bottom-4 md:duration-700 mt-8 flex flex-col">
      {/* Title */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white">
          {t('taxCalc.title')}
        </h2>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          {t('taxCalc.subtitle')}
        </p>
      </div>

      {/* Inputs Card */}
      <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none mb-6">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">
          {t('taxCalc.parameters')}
        </h3>
        <div className="flex flex-col gap-6 mx-auto w-1/2">
          {/* Years */}
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">
              {t('taxCalc.years')}: <span className="font-bold text-slate-800 dark:text-white">{years}</span>
            </label>
            <input
              type="range"
              min={1}
              max={30}
              value={years}
              onChange={(e) => setYears(Number(e.target.value))}
              className="w-full accent-green-600"
            />
            <div className="flex justify-between text-xs text-slate-400">
              <span>1</span>
              <span>30</span>
            </div>
          </div>

          {/* Growth Rate */}
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">
              {t('taxCalc.growthRate')}: <span className="font-bold text-slate-800 dark:text-white">{growthRate}%</span>
            </label>
            <input
              type="range"
              min={1}
              max={20}
              value={growthRate}
              onChange={(e) => setGrowthRate(Number(e.target.value))}
              className="w-full accent-green-600"
            />
            <div className="flex justify-between text-xs text-slate-400">
              <span>1%</span>
              <span>20%</span>
            </div>
          </div>

          {/* Initial Value */}
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">
              {t('taxCalc.initialValue')}
            </label>
            <input
              type="number"
              value={initialValue}
              onChange={(e) => setInitialValue(Math.max(0, Number(e.target.value)))}
              className="w-full bg-slate-100 dark:bg-slate-600 border border-slate-300 dark:border-slate-500 rounded-lg px-3 py-2 text-slate-800 dark:text-white"
              step={10000}
            />
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none mb-6">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">
          {t('taxCalc.chartTitle')}
        </h3>
        <div className="h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
              <XAxis
                dataKey="year"
                tick={{ fill: '#94a3b8', fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: '#475569' }}
                label={{ value: language === 'fr' ? 'Année' : 'Year', position: 'insideBottomRight', offset: -5, fill: '#94a3b8', fontSize: 12 }}
              />
              <YAxis
                tick={{ fill: '#94a3b8', fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: '#475569' }}
                tickFormatter={(v: number) => formatEuro(v)}
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                labelStyle={{ color: '#94a3b8' }}
                formatter={(value?: number, name?: string) => [
                  formatEuro(value ?? 0),
                  (name ?? '') === 'cto' ? ctoLabel : holdingLabel,
                ]}
                labelFormatter={(label: number) => `${language === 'fr' ? 'Année' : 'Year'} ${label}`}
              />
              <Area
                type="monotone"
                dataKey="cto"
                stroke="#f97316"
                fill="#f97316"
                fillOpacity={0.15}
                strokeWidth={2}
                name="cto"
              />
              <Area
                type="monotone"
                dataKey="holding"
                stroke="#22c55e"
                fill="#22c55e"
                fillOpacity={0.15}
                strokeWidth={2}
                name="holding"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center justify-center gap-6 mt-3 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-orange-500" />
            <span className="text-slate-600 dark:text-slate-300">{ctoLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-slate-600 dark:text-slate-300">{holdingLabel}</span>
          </div>
        </div>
      </div>

      {/* Year-by-year Table */}
      <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none mb-6 overflow-x-auto">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">
          {t('taxCalc.tableTitle')}
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-600">
              <th className="text-left py-2 px-3 text-slate-500 dark:text-slate-400 font-medium">{t('taxCalc.yearCol')}</th>
              <th className="text-right py-2 px-3 text-orange-500 font-medium">{t('taxCalc.ctoPortfolio')}</th>
              <th className="text-right py-2 px-3 text-orange-500 font-medium">{t('taxCalc.ctoTax')}</th>
              <th className="text-right py-2 px-3 text-green-500 font-medium">{t('taxCalc.holdingPortfolio')}</th>
              <th className="text-right py-2 px-3 text-green-500 font-medium">{t('taxCalc.holdingCosts')}</th>
              <th className="text-right py-2 px-3 text-slate-500 dark:text-slate-400 font-medium">{t('taxCalc.difference')}</th>
            </tr>
          </thead>
          <tbody>
            {simulation.yearly.map((row) => (
              <tr key={row.year} className="border-b border-slate-100 dark:border-slate-600/50 hover:bg-slate-100 dark:hover:bg-slate-600/30 transition-colors">
                <td className="py-2 px-3 text-slate-700 dark:text-slate-300 font-medium">{row.year}</td>
                <td className="py-2 px-3 text-right text-slate-700 dark:text-slate-300">{formatEuro(row.dutchPortfolio)}</td>
                <td className="py-2 px-3 text-right text-orange-600 dark:text-orange-400">{formatEuro(row.dutchTax)}</td>
                <td className="py-2 px-3 text-right text-slate-700 dark:text-slate-300">{formatEuro(row.frenchPortfolio)}</td>
                <td className="py-2 px-3 text-right text-green-600 dark:text-green-400">{formatEuro(row.frenchCosts)}</td>
                <td className={`py-2 px-3 text-right font-medium ${row.frenchPortfolio > row.dutchPortfolio ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}`}>
                  {row.frenchPortfolio > row.dutchPortfolio ? '+' : ''}{formatEuro(row.frenchPortfolio - row.dutchPortfolio)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary / Verdict */}
      <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none mb-8">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">
          {t('taxCalc.verdict')}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
            <p className="text-sm text-orange-600 dark:text-orange-400 font-medium">{ctoLabel}</p>
            <p className="text-2xl font-bold text-orange-700 dark:text-orange-300 mt-1">{formatEuro(simulation.dutchNetFinal)}</p>
            <p className="text-xs text-orange-500 dark:text-orange-400 mt-1">
              {t('taxCalc.totalTaxPaid')}: {formatEuro(simulation.yearly[simulation.yearly.length - 1]?.dutchCumulativeTax ?? 0)}
            </p>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
            <p className="text-sm text-green-600 dark:text-green-400 font-medium">{holdingLabel}</p>
            <p className="text-2xl font-bold text-green-700 dark:text-green-300 mt-1">{formatEuro(simulation.frenchNetFinal)}</p>
            <p className="text-xs text-green-500 dark:text-green-400 mt-1">
              {t('taxCalc.totalCosts')}: {formatEuro(simulation.yearly[simulation.yearly.length - 1]?.frenchCumulativeCosts ?? 0)}
            </p>
          </div>
        </div>
        <div className={`rounded-lg p-4 text-center ${frenchWins ? 'bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700' : 'bg-orange-100 dark:bg-orange-900/30 border border-orange-300 dark:border-orange-700'}`}>
          <p className={`text-lg font-bold ${frenchWins ? 'text-green-700 dark:text-green-300' : 'text-orange-700 dark:text-orange-300'}`}>
            {frenchWins
              ? (language === 'fr' ? 'La Holding gagne' : 'Holding wins')
              : (language === 'fr' ? 'Le CTO gagne' : 'CTO wins')
            }
          </p>
          <p className={`text-sm mt-1 ${frenchWins ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}`}>
            {t('taxCalc.differenceLabel')}: {difference > 0 ? '+' : ''}{formatEuro(Math.abs(difference))} ({differencePercent > 0 ? '+' : ''}{differencePercent.toFixed(1)}%)
          </p>
        </div>
      </div>
    </div>
  );
}
