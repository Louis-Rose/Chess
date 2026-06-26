import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { MppPageTitle } from './MppPageTitle';
import { useLanguage } from '../../contexts/LanguageContext';
import type { MppTests } from './types';

// Algorithme tab: reverse-engineer MPP's point engine from the live data
// pulled by Matchs - Tout. Every (probability p, cote) pair across all matches
// and snapshots is collected, the floor/ceiling/scaling constants are estimated,
// and the fitted curve cote = clamp(round(K / p), C_min, C_max) is drawn over
// the observed scatter. See the point-algorithm reference for the model.

interface Point {
  p: number; // community vote share, 0..1
  cote: number; // points awarded
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

// Pull every (p, cote) pair from all matches/snapshots; dedupe identical pairs
// so repeated snapshots of stable odds don't overplot the scatter.
function collectPoints(data: MppTests): Point[] {
  const seen = new Map<string, Point>();
  for (const m of data.matches) {
    for (const c of data.columns) {
      const cell = m.cells[c];
      if (!cell) continue;
      const outcomes: [number | null, number | null][] = [
        [cell.prono.home, cell.cote.home],
        [cell.prono.draw, cell.cote.draw],
        [cell.prono.away, cell.cote.away],
      ];
      for (const [p, cote] of outcomes) {
        if (p == null || cote == null || p <= 0 || cote <= 0) continue;
        seen.set(`${p}|${cote}`, { p, cote });
      }
    }
  }
  return [...seen.values()];
}

// Floor = lowest cote (favorites clamped down), ceiling = highest cote
// (long-shots clamped up). K from the unclamped middle band, where cote = K / p
// so p * cote = K; the median is robust to the rounding noise.
function fit(points: Point[]) {
  const cotes = points.map((d) => d.cote);
  const cMin = Math.min(...cotes);
  const cMax = Math.max(...cotes);
  const middle = points.filter((d) => d.cote > cMin && d.cote < cMax);
  const k = Math.round(median((middle.length ? middle : points).map((d) => d.p * d.cote)));
  return { cMin, cMax, k };
}

export function MppAlgorithm() {
  const { t } = useLanguage();
  const [data, setData] = useState<MppTests | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    axios
      .get<MppTests>('/api/mpp/tests')
      .then((r) => active && setData(r.data))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, []);

  const model = useMemo(() => {
    if (!data) return null;
    const points = collectPoints(data);
    if (!points.length) return null;
    const { cMin, cMax, k } = fit(points);
    // One series for the chart: dense fitted curve + observed scatter, sorted by
    // p. `fit` is set only on curve rows, `cote` only on observed rows.
    const curve = Array.from({ length: 100 }, (_, i) => {
      const p = (i + 1) / 100;
      return { p, fit: clamp(Math.round(k / p), cMin, cMax) };
    });
    const scatter = points.map((d) => ({ p: d.p, cote: d.cote }));
    const chart = [...curve, ...scatter].sort((a, b) => a.p - b.p);
    return { cMin, cMax, k, n: points.length, chart };
  }, [data]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <div className="mb-5">
        <MppPageTitle />
      </div>

      {error || (data && !model) ? (
        <p className="py-12 text-center text-sm text-slate-500">{t('mpp.tests.empty')}</p>
      ) : !model ? (
        <Spinner />
      ) : (
        <>
          <p className="mb-4 text-sm text-slate-400">{t('mpp.algo.intro')}</p>

          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={t('mpp.algo.floor')} value={model.cMin} />
            <Stat label={t('mpp.algo.ceiling')} value={model.cMax} />
            <Stat label={t('mpp.algo.scaling')} value={model.k} />
            <Stat label={t('mpp.algo.dataPoints')} value={model.n} />
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-4">
            <ResponsiveContainer width="100%" height={420}>
              <ComposedChart data={model.chart} margin={{ top: 8, right: 16, bottom: 24, left: 4 }}>
                <CartesianGrid stroke="#1e293b" />
                <XAxis
                  dataKey="p"
                  type="number"
                  domain={[0, 1]}
                  stroke="#64748b"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                  label={{ value: t('mpp.tests.probability'), position: 'insideBottom', offset: -12, fill: '#94a3b8', fontSize: 12 }}
                />
                <YAxis
                  stroke="#64748b"
                  tick={{ fontSize: 12 }}
                  label={{ value: t('mpp.tests.odds'), angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 12 }}
                />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }}
                  labelFormatter={(v: number) => `p = ${Math.round(v * 100)}%`}
                  formatter={(value, name) => [Math.round(Number(value)), name]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Scatter name={t('mpp.algo.observed')} dataKey="cote" fill="#10b981" />
                <Line
                  name={t('mpp.algo.fit')}
                  dataKey="fit"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  type="monotone"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-center">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 font-mono text-2xl font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex h-40 items-center justify-center">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-700 border-t-emerald-500" />
    </div>
  );
}
