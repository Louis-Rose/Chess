import { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useChessData } from '../contexts/ChessDataContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { CardPageLayout } from '../components/CardPageLayout';
import { useTimePeriod } from '../hooks/useTimePeriod';
import { ChessCard } from '../components/ChessCard';
import type { DayOfWeekStats } from '../utils/types';
import { filterGameLog, computeDowStats } from '../utils/helpers';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';

const DAY_NAMES_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_NAMES_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function DaysChart({ stats }: { stats: DayOfWeekStats[] }) {
  const { t, language } = useLanguage();
  const dayNames = language === 'fr' ? DAY_NAMES_FR : DAY_NAMES_EN;

  const { chartData, baseline, best, worst } = useMemo(() => {
    const filtered = stats.filter(d => d.sample_size >= 5);
    if (filtered.length === 0) return { chartData: [], baseline: 50, best: null, worst: null };

    const totalGames = filtered.reduce((s, d) => s + d.sample_size, 0);
    const weightedWr = filtered.reduce((s, d) => s + d.win_rate * d.sample_size, 0) / totalGames;

    const data = filtered.map(d => ({
      ...d,
      label: dayNames[d.day],
      delta: d.win_rate - weightedWr,
    }));

    const bestItem = data.reduce((a, b) => a.win_rate > b.win_rate ? a : b);
    const worstItem = data.reduce((a, b) => a.win_rate < b.win_rate ? a : b);

    return { chartData: data, baseline: Math.round(weightedWr * 10) / 10, best: bestItem, worst: worstItem };
  }, [stats, dayNames]);

  if (chartData.length === 0) return <p className="text-slate-500 text-center py-8">{t('chess.noData')}</p>;

  return (
    <div>
      <div className="h-[300px] sm:h-[350px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
            <ReferenceLine y={baseline} stroke="#f1f5f9" strokeWidth={2} strokeOpacity={0.5} strokeDasharray="6 3" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 16, fill: '#ffffff', fontWeight: 700 }}
              interval={0}
            />
            <YAxis
              tick={{ fontSize: 16, fill: '#ffffff', fontWeight: 700 }}
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
                    <p style={{ color: '#f1f5f9', fontWeight: 700, marginBottom: 4 }}>{d.label}</p>
                    <p style={{ color: d.win_rate >= baseline ? '#4ade80' : '#f87171' }}>Win rate: {d.win_rate}%</p>
                    <p style={{ color: '#94a3b8', fontSize: 12 }}>{d.sample_size} games</p>
                  </div>
                );
              }}
            />
            <Bar dataKey="win_rate" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.win_rate >= baseline ? '#16a34a' : '#dc2626'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="text-center mt-2 text-sm text-slate-400">
        Baseline: {baseline}%
      </div>
      {best && worst && best.day !== worst.day && (
        <div className="flex flex-wrap justify-center gap-4 mt-3">
          <div className="bg-green-900/30 border border-green-700/50 rounded-lg px-4 py-2 text-center">
            <p className="text-green-400 font-bold text-lg">{best.label}</p>
            <p className="text-green-300 text-sm">{best.win_rate}% ({best.sample_size} games)</p>
          </div>
          <div className="bg-red-900/30 border border-red-700/50 rounded-lg px-4 py-2 text-center">
            <p className="text-red-400 font-bold text-lg">{worst.label}</p>
            <p className="text-red-300 text-sm">{worst.win_rate}% ({worst.sample_size} games)</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function BestDaysPage() {
  const { t } = useLanguage();
  const { data, loading } = useChessData();
  const { period, toggle } = useTimePeriod();

  const stats = useMemo(() => {
    if (!data) return undefined;
    if (period === 'ALL' || !data.game_log?.length) return data.dow_stats;
    return computeDowStats(filterGameLog(data.game_log, period));
  }, [data, period]);

  if (!data && !loading) return <p className="text-slate-400 text-center mt-16">{t('chess.noData')}</p>;

  return (
    <CardPageLayout>
      {loading && !data ? (
        <div className="flex justify-center py-20"><Loader2 className="w-12 h-12 text-slate-400 animate-spin" /></div>
      ) : stats && stats.length > 0 ? (
        <ChessCard title={t('chess.bestDaysTitle')} action={toggle}>
          <DaysChart stats={stats} />
        </ChessCard>
      ) : (
        data && <p className="text-slate-500 text-center py-8">{t('chess.noData')}</p>
      )}
    </CardPageLayout>
  );
}
