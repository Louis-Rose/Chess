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
// (long-shots clamped up). K is the value that best fits the whole clamped model
// cote = clamp(K / p, C_min, C_max) by least squares, so points sitting on the
// floor or ceiling no longer drag the estimate (a plain median of p*cote does).
function fit(points: Point[]) {
  const cotes = points.map((d) => d.cote);
  const cMin = Math.min(...cotes);
  const cMax = Math.max(...cotes);
  let k = 1;
  let bestSse = Infinity;
  for (let cand = 1; cand <= 300; cand++) {
    let sse = 0;
    for (const d of points) {
      const e = clamp(cand / d.p, cMin, cMax) - d.cote;
      sse += e * e;
    }
    if (sse < bestSse) {
      bestSse = sse;
      k = cand;
    }
  }
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
    const curve = Array.from({ length: 200 }, (_, i) => {
      const p = (i + 1) / 200;
      return { p, fit: clamp(k / p, cMin, cMax) };
    });
    const scatter = points.map((d) => ({ p: d.p, cote: d.cote, fit: clamp(k / d.p, cMin, cMax) }));
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
            <ResponsiveContainer width="100%" height={440}>
              <ComposedChart data={model.chart} margin={{ top: 8, right: 20, bottom: 32, left: 8 }}>
                <CartesianGrid stroke="#1e293b" />
                <XAxis
                  dataKey="p"
                  type="number"
                  domain={[0, 1]}
                  stroke="#64748b"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                  label={{ value: t('mpp.tests.probability'), position: 'insideBottom', offset: -18, fill: '#94a3b8', fontSize: 12 }}
                />
                <YAxis
                  stroke="#64748b"
                  tick={{ fontSize: 12 }}
                  label={{ value: t('mpp.tests.odds'), angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 12 }}
                />
                <Tooltip cursor={{ stroke: '#334155' }} content={<ChartTooltip />} />
                <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 12 }} />
                <Line
                  name={t('mpp.algo.fit')}
                  dataKey="fit"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  type="monotone"
                  isAnimationActive={false}
                />
                <Scatter name={t('mpp.algo.observed')} dataKey="cote" fill="#10b981" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}

// Hover read-out: the probability plus whatever series sit at this x (the
// observed cote and/or the fitted value).
interface TooltipEntry { name?: string; value?: number; color?: string }
function ChartTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: number;
  payload?: TooltipEntry[];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 text-slate-400">p = {Math.round((label ?? 0) * 100)}%</div>
      {payload.map((e) => (
        <div key={e.name} style={{ color: e.color }}>
          {e.name}: {Math.round(e.value ?? 0)}
        </div>
      ))}
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
