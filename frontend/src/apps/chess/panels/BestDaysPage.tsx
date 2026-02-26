import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useChessData } from '../contexts/ChessDataContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { TimeClassToggle } from '../components/TimeClassToggle';
import type { DayOfWeekStats } from '../utils/types';
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
              tick={{ fontSize: 14, fill: '#f1f5f9', fontWeight: 700 }}
              interval={0}
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
              content={({ active, payload }: { active?: boolean; payload?: Array<{ payload: typeof chartData[number] }> }) => {
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
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { data, loading, selectedTimeClass, handleTimeClassChange } = useChessData();

  if (!data && !loading) return <p className="text-slate-400 text-center mt-16">{t('chess.noData')}</p>;

  const stats = data?.dow_stats;

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
          <TimeClassToggle selected={selectedTimeClass} onChange={handleTimeClassChange} disabled={loading} />
        </div>
        <div className="border-t border-slate-700" />
        {loading && !data ? (
          <div className="flex justify-center py-20"><Loader2 className="w-12 h-12 text-slate-400 animate-spin" /></div>
        ) : stats && stats.length > 0 ? (
          <div className="bg-slate-700 rounded-xl p-0.5 sm:p-4 select-text">
            <h2 className="text-2xl font-bold text-slate-100 text-center select-text py-3">{t('chess.bestDaysTitle')}</h2>
            <DaysChart stats={stats} />
          </div>
        ) : (
          data && <p className="text-slate-500 text-center py-8">{t('chess.noData')}</p>
        )}
      </div>
    </div>
  );
}
