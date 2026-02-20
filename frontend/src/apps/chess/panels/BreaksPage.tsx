import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useChessData } from '../contexts/ChessDataContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { TimeClassToggle } from '../components/TimeClassToggle';
import type { BreaksStats } from '../utils/types';
import {
  Scatter, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, ComposedChart,
} from 'recharts';

// Simple linear regression: y = slope * x + intercept
function linearRegression(points: { x: number; y: number }[]) {
  const n = points.length;
  if (n < 2) return null;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // R² calculation
  const meanY = sumY / n;
  const ssTot = points.reduce((s, p) => s + (p.y - meanY) ** 2, 0);
  const ssRes = points.reduce((s, p) => s + (p.y - (slope * p.x + intercept)) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return { slope, intercept, r2 };
}

function formatGapLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  if (minutes < 1440) return `${minutes / 60}h`;
  return '24h';
}

function BreaksChart({ stats }: { stats: BreaksStats[] }) {
  const { t } = useLanguage();
  const filtered = stats.filter(d => d.sample_size >= 10);
  if (filtered.length < 2) return <p className="text-slate-500 text-center py-8">{t('chess.noData')}</p>;

  const points = filtered.map(d => ({ x: d.gap_minutes, y: d.win_rate }));
  const reg = linearRegression(points);

  // Build regression line data: two endpoints spanning the x range
  const xMin = Math.min(...points.map(p => p.x));
  const xMax = Math.max(...points.map(p => p.x));
  const regLineData = reg ? [
    { gap_minutes: xMin, regression: reg.slope * xMin + reg.intercept },
    { gap_minutes: xMax, regression: reg.slope * xMax + reg.intercept },
  ] : [];

  // Merge scatter + regression data for ComposedChart
  const chartData = filtered.map(d => ({
    gap_minutes: d.gap_minutes,
    win_rate: d.win_rate,
    sample_size: d.sample_size,
    label: formatGapLabel(d.gap_minutes),
  }));

  return (
    <div>
      <div className="text-center mb-3">
        <h4 className="text-white font-semibold">{t('chess.winRate')}</h4>
      </div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
            <ReferenceLine y={50} stroke="#f1f5f9" strokeWidth={2} strokeOpacity={0.5} />
            <XAxis
              dataKey="gap_minutes"
              type="number"
              scale="log"
              domain={[xMin, xMax]}
              ticks={filtered.map(d => d.gap_minutes)}
              tickFormatter={formatGapLabel}
              tick={{ fontSize: 12, fill: '#f1f5f9', fontWeight: 700 }}
              label={{ value: t('chess.breakGap'), position: 'insideBottom', offset: -15, fill: '#f1f5f9', fontSize: 14, fontWeight: 700 }}
            />
            <YAxis
              tick={{ fontSize: 14, fill: '#f1f5f9', fontWeight: 700 }}
              domain={[
                (min: number) => Math.max(0, Math.floor(min / 5) * 5 - 5),
                (max: number) => Math.min(100, Math.ceil(max / 5) * 5 + 5),
              ]}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              content={({ active, payload }: any) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload;
                if (!d) return null;
                return (
                  <div style={{ backgroundColor: '#1e293b', borderRadius: '8px', border: '1px solid #334155', padding: '8px 12px' }}>
                    <p style={{ color: '#f1f5f9', fontWeight: 700, marginBottom: 4 }}>≤ {formatGapLabel(d.gap_minutes)} {t('chess.breakBetweenGames')}</p>
                    <p style={{ color: '#f1f5f9' }}>{t('chess.winRate')}: {d.win_rate}%</p>
                    <p style={{ color: '#94a3b8', fontSize: 12 }}>{d.sample_size} {t('chess.games')}</p>
                  </div>
                );
              }}
            />
            <Scatter dataKey="win_rate" fill="#3b82f6" r={6} />
            {reg && regLineData.length === 2 && (
              <Line
                data={regLineData}
                dataKey="regression"
                stroke="#f59e0b"
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={false}
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {reg && (
        <div className="text-center mt-3 space-y-1">
          <p className="text-slate-400 text-sm">
            {t('chess.breakRegression')}: y = {reg.slope >= 0 ? '+' : ''}{reg.slope.toFixed(3)}x + {reg.intercept.toFixed(1)}% — R² = {reg.r2.toFixed(3)}
          </p>
        </div>
      )}
    </div>
  );
}

function BreaksTable({ stats }: { stats: BreaksStats[] }) {
  const { t } = useLanguage();
  const filtered = stats.filter(d => d.sample_size >= 10);
  if (filtered.length === 0) return null;

  return (
    <table className="w-full border-collapse border border-slate-600">
      <thead>
        <tr className="border border-slate-600 bg-slate-800">
          <th className="text-center text-white text-sm font-semibold py-3 px-4 border border-slate-600">{t('chess.breakGap')}</th>
          <th className="text-center text-white text-sm font-semibold py-3 px-4 border border-slate-600">{t('chess.winRate')}</th>
        </tr>
      </thead>
      <tbody>
        {filtered.map(d => (
          <tr key={d.gap_minutes} className="border border-slate-600">
            <td className="text-center text-white text-sm py-3 px-4 border border-slate-600">≤ {formatGapLabel(d.gap_minutes)}</td>
            <td className="text-center text-sm font-semibold py-3 px-4 border border-slate-600">
              <span className={d.win_rate >= 50 ? 'text-green-400' : 'text-red-400'}>{d.win_rate.toFixed(1)}%</span>
              <span className="text-slate-500 font-normal ml-2 text-xs">({d.sample_size} {t('chess.games')})</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function BreaksPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { data, loading, selectedTimeClass, handleTimeClassChange } = useChessData();

  if (!data && !loading) return <p className="text-slate-400 text-center mt-16">{t('chess.noData')}</p>;

  const stats = data?.breaks_stats;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="max-w-4xl mx-auto mt-2 space-y-2">
        <div className="relative flex items-center justify-center">
          <button
            onClick={() => navigate('/chess')}
            className="absolute left-2 md:left-4 flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors text-base"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Previous</span>
          </button>
          <TimeClassToggle selected={selectedTimeClass} onChange={handleTimeClassChange} />
        </div>
        <div className="border-t border-slate-700" />
        {loading && !data ? (
          <div className="flex justify-center py-20"><Loader2 className="w-12 h-12 text-slate-400 animate-spin" /></div>
        ) : stats && stats.length > 0 ? (
          <>
            <div className="bg-slate-700 rounded-xl p-0.5 sm:p-4 select-text">
              <h2 className="text-2xl font-bold text-slate-100 text-center select-text py-3">{t('chess.breaksCardTitle')}</h2>
              <BreaksChart stats={stats} />
            </div>
            <div className="bg-slate-700 rounded-xl p-0.5 sm:p-4 select-text">
              <BreaksTable stats={stats} />
            </div>
          </>
        ) : (
          data && <p className="text-slate-500 text-center py-8">{t('chess.noData')}</p>
        )}
      </div>
    </div>
  );
}
