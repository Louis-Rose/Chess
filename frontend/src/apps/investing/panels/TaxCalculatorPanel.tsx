// Tax Calculator Panel - Compare CTO (unrealized gains tax) vs French Holding scenarios

import { useState, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useLanguage } from '../../../contexts/LanguageContext';

interface YearlyRow {
  year: number;
  // CTO
  ctoBrut: number;
  ctoTax: number;
  ctoNet: number;
  // Holding (assuming full liquidation + dividend distribution at year N)
  holdingBrut: number;
  holdingIS: number;
  holdingDividendTax: number;
  holdingNet: number;
  holdingDividends: number;
}

function simulate(years: number, growthRate: number, v0: number): YearlyRow[] {
  const rows: YearlyRow[] = [];
  let ctoNet = v0;

  for (let y = 1; y <= years; y++) {
    // CTO: grow then tax unrealized gains at 31.4%
    const ctoBrut = ctoNet * (1 + growthRate / 100);
    const ctoTax = Math.max(0, (ctoBrut - ctoNet) * 0.314);
    ctoNet = ctoBrut - ctoTax;

    // Holding: grows untaxed, then simulate full exit at year N
    const holdingBrut = v0 * Math.pow(1 + growthRate / 100, y);
    const holdingGain = Math.max(0, holdingBrut - v0);
    const holdingIS = holdingGain * 0.15;
    const afterIS = holdingBrut - holdingIS;
    const dividend = Math.max(0, afterIS - v0);
    const holdingDividendTax = dividend * 0.314;
    const holdingNet = afterIS - holdingDividendTax;
    const holdingDividends = dividend - holdingDividendTax;

    rows.push({
      year: y,
      ctoBrut,
      ctoTax,
      ctoNet,
      holdingBrut,
      holdingIS,
      holdingDividendTax,
      holdingNet,
      holdingDividends,
    });
  }

  return rows;
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

  const rows = useMemo(() => simulate(years, growthRate, initialValue), [years, growthRate, initialValue]);

  const finalRow = rows[rows.length - 1];
  const difference = finalRow.holdingNet - finalRow.ctoNet;
  const differencePercent = finalRow.ctoNet !== 0 ? (difference / finalRow.ctoNet) * 100 : 0;
  const holdingWins = difference > 0;

  const chartData = rows.map((d) => ({
    year: d.year,
    cto: Math.round(d.ctoNet),
    holding: Math.round(d.holdingNet),
  }));

  const ctoLabel = language === 'fr' ? 'CTO (31.4% gains latents)' : 'CTO (31.4% unrealized gains)';
  const holdingLabel = language === 'fr' ? 'Holding (IS 15% + PFU 31.4%)' : 'Holding (IS 15% + flat tax 31.4%)';

  const th = "py-2 px-3 text-center font-medium text-xs border border-slate-200 dark:border-slate-600";
  const td = "py-2 px-3 text-center text-sm border border-slate-200 dark:border-slate-600";

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
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">
              {t('taxCalc.years')}: <span className="font-bold text-slate-800 dark:text-white">{years}</span>
            </label>
            <input type="range" min={1} max={30} value={years} onChange={(e) => setYears(Number(e.target.value))} className="w-full accent-green-600" />
            <div className="flex justify-between text-xs text-slate-400"><span>1</span><span>30</span></div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">
              {t('taxCalc.growthRate')}: <span className="font-bold text-slate-800 dark:text-white">{growthRate}%</span>
            </label>
            <input type="range" min={1} max={20} value={growthRate} onChange={(e) => setGrowthRate(Number(e.target.value))} className="w-full accent-green-600" />
            <div className="flex justify-between text-xs text-slate-400"><span>1%</span><span>20%</span></div>
          </div>
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
              <XAxis dataKey="year" tick={{ fill: '#94a3b8', fontSize: 12 }} tickLine={false} axisLine={{ stroke: '#475569' }} label={{ value: language === 'fr' ? 'Année' : 'Year', position: 'insideBottomRight', offset: -5, fill: '#94a3b8', fontSize: 12 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} tickLine={false} axisLine={{ stroke: '#475569' }} tickFormatter={(v: number) => formatEuro(v)} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                labelStyle={{ color: '#94a3b8' }}
                formatter={(value?: number, name?: string) => [formatEuro(value ?? 0), (name ?? '') === 'cto' ? ctoLabel : holdingLabel]}
                labelFormatter={(label: number) => `${language === 'fr' ? 'Année' : 'Year'} ${label}`}
              />
              <Area type="monotone" dataKey="cto" stroke="#f97316" fill="#f97316" fillOpacity={0.15} strokeWidth={2} name="cto" />
              <Area type="monotone" dataKey="holding" stroke="#22c55e" fill="#22c55e" fillOpacity={0.15} strokeWidth={2} name="holding" />
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
        <table className="w-full text-sm border-collapse border border-slate-200 dark:border-slate-600">
          <thead>
            {/* Group headers */}
            <tr>
              <th rowSpan={2} className={`${th} text-slate-500 dark:text-slate-400`}>{t('taxCalc.yearCol')}</th>
              <th colSpan={3} className={`${th} text-orange-500 bg-orange-50 dark:bg-orange-900/10`}>CTO</th>
              <th rowSpan={2} className="w-1 bg-slate-300 dark:bg-slate-500 border border-slate-200 dark:border-slate-600" />
              <th colSpan={5} className={`${th} text-green-500 bg-green-50 dark:bg-green-900/10`}>Holding</th>
            </tr>
            {/* Sub headers */}
            <tr>
              <th className={`${th} text-orange-500`}>{language === 'fr' ? 'Brut' : 'Gross'}</th>
              <th className={`${th} text-orange-500`}>{language === 'fr' ? 'Impôts' : 'Tax'}</th>
              <th className={`${th} text-orange-500`}>Net</th>
              <th className={`${th} text-green-500`}>{language === 'fr' ? 'Brut' : 'Gross'}</th>
              <th className={`${th} text-green-500`}>{language === 'fr' ? 'Impôts (IS)' : 'Tax (IS)'}</th>
              <th className={`${th} text-green-500`}>{language === 'fr' ? 'Impôts div.' : 'Div. tax'}</th>
              <th className={`${th} text-green-500`}>Net</th>
              <th className={`${th} text-green-500`}>{language === 'fr' ? 'Dividendes' : 'Dividends'}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.year} className="hover:bg-slate-100 dark:hover:bg-slate-600/30 transition-colors">
                <td className={`${td} text-slate-700 dark:text-slate-300 font-medium`}>{row.year}</td>
                <td className={`${td} text-slate-700 dark:text-slate-300`}>{formatEuro(row.ctoBrut)}</td>
                <td className={`${td} text-orange-600 dark:text-orange-400`}>{formatEuro(row.ctoTax)}</td>
                <td className={`${td} text-slate-700 dark:text-slate-300 font-medium`}>{formatEuro(row.ctoNet)}</td>
                <td className="w-1 bg-slate-300 dark:bg-slate-500 border border-slate-200 dark:border-slate-600" />
                <td className={`${td} text-slate-700 dark:text-slate-300`}>{formatEuro(row.holdingBrut)}</td>
                <td className={`${td} text-green-600 dark:text-green-400`}>{formatEuro(row.holdingIS)}</td>
                <td className={`${td} text-green-600 dark:text-green-400`}>{formatEuro(row.holdingDividendTax)}</td>
                <td className={`${td} text-slate-700 dark:text-slate-300 font-medium`}>{formatEuro(row.holdingNet)}</td>
                <td className={`${td} text-green-700 dark:text-green-300 font-medium`}>{formatEuro(row.holdingDividends)}</td>
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
            <p className="text-2xl font-bold text-orange-700 dark:text-orange-300 mt-1">{formatEuro(finalRow.ctoNet)}</p>
            <p className="text-xs text-orange-500 dark:text-orange-400 mt-1">
              {t('taxCalc.totalTaxPaid')}: {formatEuro(rows.reduce((sum, r) => sum + r.ctoTax, 0))}
            </p>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
            <p className="text-sm text-green-600 dark:text-green-400 font-medium">{holdingLabel}</p>
            <p className="text-2xl font-bold text-green-700 dark:text-green-300 mt-1">{formatEuro(finalRow.holdingNet)}</p>
            <p className="text-xs text-green-500 dark:text-green-400 mt-1">
              {t('taxCalc.totalTaxPaid')}: {formatEuro(finalRow.holdingIS + finalRow.holdingDividendTax)}
            </p>
          </div>
        </div>
        <div className={`rounded-lg p-4 text-center ${holdingWins ? 'bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700' : 'bg-orange-100 dark:bg-orange-900/30 border border-orange-300 dark:border-orange-700'}`}>
          <p className={`text-lg font-bold ${holdingWins ? 'text-green-700 dark:text-green-300' : 'text-orange-700 dark:text-orange-300'}`}>
            {holdingWins
              ? (language === 'fr' ? 'La Holding gagne' : 'Holding wins')
              : (language === 'fr' ? 'Le CTO gagne' : 'CTO wins')
            }
          </p>
          <p className={`text-sm mt-1 ${holdingWins ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}`}>
            {t('taxCalc.differenceLabel')}: {difference > 0 ? '+' : ''}{formatEuro(Math.abs(difference))} ({differencePercent > 0 ? '+' : ''}{differencePercent.toFixed(1)}%)
          </p>
        </div>
      </div>
    </div>
  );
}
