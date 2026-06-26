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
import { countryName } from './mppLocale';
import type { MppTests } from './types';

// Algorithme tab: reverse-engineer MPP's point engine from the live data
// pulled by Matchs - Tout. Every (probability p, cote) pair across all matches
// and snapshots is collected, the floor/ceiling/scaling constants are estimated,
// and the fitted curve cote = clamp(round(K / p), C_min, C_max) is drawn over
// the observed scatter. See the point-algorithm reference for the model.

interface Point {
  p: number; // community vote share, 0..1
  cote: number; // points awarded
  teams: string; // "Home vs Away"
  pick: string; // predicted outcome: home team, "N" (draw) or away team
  matchId: string; // groups the outcomes belonging to one match
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Pull every (p, cote) outcome from all matches/snapshots, tagged with its match
// and predicted outcome. Dedupe identical readings of the same match-outcome so
// repeated snapshots of stable odds don't overplot the scatter.
function collectPoints(data: MppTests, language: string): Point[] {
  const seen = new Map<string, Point>();
  for (const m of data.matches) {
    const home = m.home ? countryName(m.home, language) : '?';
    const away = m.away ? countryName(m.away, language) : '?';
    const teams = `${home} vs ${away}`;
    for (const c of data.columns) {
      const cell = m.cells[c];
      if (!cell) continue;
      const outcomes: [number | null, number | null, string][] = [
        [cell.prono.home, cell.cote.home, home],
        [cell.prono.draw, cell.cote.draw, 'N'],
        [cell.prono.away, cell.cote.away, away],
      ];
      for (const [p, cote, pick] of outcomes) {
        if (p == null || cote == null || p <= 0 || cote <= 0) continue;
        seen.set(`${m.match_id}|${pick}|${p}|${cote}`, { p, cote, teams, pick, matchId: m.match_id });
      }
    }
  }
  return [...seen.values()];
}

// Floor = lowest cote (favorites clamped down), ceiling = highest cote
// (long-shots clamped up). The observed espérance (p*cote) is NOT constant, so
// the pure reciprocal cote = K/p is wrong; the engine follows a power law
// cote = K / p^alpha with alpha < 1 (cote falls slower than 1/p). K and alpha
// are grid-searched to least-squares-fit the whole clamped model, and R²
// reports how much of the cote variance that fit explains.
function fit(points: Point[]) {
  const cotes = points.map((d) => d.cote);
  const ps = points.map((d) => d.p);
  const cMin = Math.min(...cotes);
  const cMax = Math.max(...cotes);

  let best = { k: 1, alpha: 1, sse: Infinity };
  for (let a = 10; a <= 150; a += 2) {
    const alpha = a / 100; // 0.10 .. 1.50
    const xs = ps.map((p) => Math.pow(p, alpha)); // reused across all K
    for (let k = 1; k <= 400; k++) {
      let sse = 0;
      for (let i = 0; i < cotes.length; i++) {
        const e = clamp(k / xs[i], cMin, cMax) - cotes[i];
        sse += e * e;
      }
      if (sse < best.sse) best = { k, alpha, sse };
    }
  }

  const r2 = best.sse ? 1 - best.sse / totalVar(cotes) : 1;
  return { cMin, cMax, k: best.k, alpha: best.alpha, r2 };
}

// Best integer K for one match's points at a fixed alpha (clamped model).
function bestKForGroup(grp: Point[], alpha: number, cMin: number, cMax: number) {
  const xs = grp.map((d) => Math.pow(d.p, alpha));
  let bestK = 1;
  let bestSse = Infinity;
  for (let k = 1; k <= 400; k++) {
    let sse = 0;
    for (let i = 0; i < grp.length; i++) {
      const e = clamp(k / xs[i], cMin, cMax) - grp[i].cote;
      sse += e * e;
    }
    if (sse < bestSse) {
      bestSse = sse;
      bestK = k;
    }
  }
  return { k: bestK, sse: bestSse };
}

// One K per match, a single alpha shared across all matches: grid the shared
// alpha, fit each match's own K at that alpha, keep the alpha with the lowest
// total error. If a single match's K explains the cote spread that the global
// fit misses, K is a per-match constant.
function fitPerMatch(groups: Point[][], cMin: number, cMax: number) {
  let best = { alpha: 1, ks: [] as number[], sse: Infinity };
  for (let a = 10; a <= 150; a += 2) {
    const alpha = a / 100;
    let totalSse = 0;
    const ks: number[] = [];
    for (const grp of groups) {
      const { k, sse } = bestKForGroup(grp, alpha, cMin, cMax);
      ks.push(k);
      totalSse += sse;
    }
    if (totalSse < best.sse) best = { alpha, ks, sse: totalSse };
  }
  const allCotes = groups.flat().map((d) => d.cote);
  const r2 = best.sse ? 1 - best.sse / totalVar(allCotes) : 1;
  const sorted = [...best.ks].sort((a, b) => a - b);
  return {
    alpha: best.alpha,
    r2,
    kMin: sorted[0],
    kMed: sorted[Math.floor(sorted.length / 2)],
    kMax: sorted[sorted.length - 1],
    nMatches: groups.length,
  };
}

function totalVar(xs: number[]): number {
  const mean = xs.reduce((s, v) => s + v, 0) / xs.length;
  return xs.reduce((s, v) => s + (v - mean) ** 2, 0);
}

export function MppAlgorithm() {
  const { t, language } = useLanguage();
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
    const points = collectPoints(data, language);
    if (!points.length) return null;
    const { cMin, cMax, k, alpha, r2 } = fit(points);
    // One series for the chart: dense fitted curve + observed scatter, sorted by
    // p. `fit` is set only on curve rows, `cote`/`teams`/`pick` only on observed.
    const model = (p: number) => clamp(k / Math.pow(p, alpha), cMin, cMax);
    const curve = Array.from({ length: 200 }, (_, i) => {
      const p = (i + 1) / 200;
      return { p, fit: model(p) };
    });
    const scatter = points.map((d) => ({ ...d, fit: model(d.p) }));
    const chart = [...curve, ...scatter].sort((a, b) => a.p - b.p);

    // Per-match fit: group outcomes by match, fit one K each (shared alpha).
    const byMatch = new Map<string, Point[]>();
    for (const pt of points) {
      (byMatch.get(pt.matchId) ?? byMatch.set(pt.matchId, []).get(pt.matchId)!).push(pt);
    }
    const perMatch = fitPerMatch([...byMatch.values()], cMin, cMax);

    return { cMin, cMax, k, alpha, r2, n: points.length, chart, perMatch };
  }, [data, language]);

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

          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label={t('mpp.algo.floor')} value={model.cMin} />
            <Stat label={t('mpp.algo.ceiling')} value={model.cMax} />
            <Stat label={t('mpp.algo.scaling')} value={model.k} />
            <Stat label={t('mpp.algo.alpha')} value={model.alpha.toFixed(2)} />
            <Stat label={t('mpp.algo.r2')} value={model.r2.toFixed(2)} />
            <Stat label={t('mpp.algo.dataPoints')} value={model.n} />
          </div>

          <p className="mb-2 text-sm font-medium text-slate-300">{t('mpp.algo.perMatchTitle')}</p>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={t('mpp.algo.alpha')} value={model.perMatch.alpha.toFixed(2)} />
            <Stat label={t('mpp.algo.r2')} value={model.perMatch.r2.toFixed(2)} />
            <Stat
              label={t('mpp.algo.kMedian')}
              value={model.perMatch.kMed}
              sub={`${model.perMatch.kMin}–${model.perMatch.kMax}`}
            />
            <Stat label={t('mpp.algo.matches')} value={model.perMatch.nMatches} />
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
                <Scatter
                  name={t('mpp.algo.observed')}
                  dataKey="cote"
                  fill="#10b981"
                  shape={<DotShape />}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}

// A visible dot wrapped in a larger transparent circle, so the whole area
// around the point is a hover target (not just the small dot).
function DotShape(props: { cx?: number; cy?: number }) {
  const { cx, cy } = props;
  if (cx == null || cy == null) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={14} fill="transparent" />
      <circle cx={cx} cy={cy} r={5} fill="#10b981" />
    </g>
  );
}

// Hover read-out. Over a data point it shows the match, the predicted outcome
// and its numbers; over the bare fitted curve it just shows p and the fit.
interface Row { p: number; cote?: number; fit?: number; teams?: string; pick?: string }
interface TooltipEntry { dataKey?: string; payload?: Row }
function ChartTooltip({ active, payload }: { active?: boolean; payload?: TooltipEntry[] }) {
  const { t } = useLanguage();
  if (!active || !payload?.length) return null;
  const obs = payload.find((e) => e.dataKey === 'cote')?.payload;
  const row = obs ?? payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-lg">
      {obs ? (
        <>
          <div className="mb-1 font-semibold text-slate-100">{row.teams}</div>
          <div className="text-slate-300">
            {t('mpp.algo.pick')}: <span className="font-medium">{row.pick}</span>
          </div>
          <div className="text-emerald-400">
            {t('mpp.tests.odds')}: {row.cote}
          </div>
          <div className="text-slate-400">
            {t('mpp.tests.probability')}: {Math.round(row.p * 100)}%
          </div>
        </>
      ) : (
        <>
          <div className="mb-1 text-slate-400">p = {Math.round(row.p * 100)}%</div>
          <div className="text-amber-400">
            {t('mpp.algo.fit')}: {Math.round(row.fit ?? 0)}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-center">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 font-mono text-2xl font-semibold text-slate-100">{value}</div>
      {sub && <div className="mt-0.5 font-mono text-xs text-slate-500">{sub}</div>}
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
