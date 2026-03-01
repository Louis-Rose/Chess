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
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';

const DAY_NAMES_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_NAMES_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const MIN_SAMPLE = 30;

function DaysChart({ stats }: { stats: DayOfWeekStats[] }) {
  const { t, language } = useLanguage();
  const dayNames = language === 'fr' ? DAY_NAMES_FR : DAY_NAMES_EN;

  const { chartData, baseline } = useMemo(() => {
    const statsMap = new Map(stats.map(d => [d.day, d]));
    // Always show all 7 days
    const data = Array.from({ length: 7 }, (_, day) => {
      const d = statsMap.get(day);
      const sufficient = d && d.sample_size >= MIN_SAMPLE;
      return {
        day,
        win_rate: sufficient ? d.win_rate : null,
        sample_size: d?.sample_size ?? 0,
        label: dayNames[day],
      };
    });

    return { chartData: data, baseline: 50 };
  }, [stats, dayNames]);

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const AXIS_PAD = isMobile ? 34 : 48;
  const winRateLabel = language === 'fr' ? 'Taux de victoire' : 'Win Rate';
  const gamesLabel = language === 'fr' ? 'Parties jouées' : 'Games played';
  const dayLabel = language === 'fr' ? 'Jour' : 'Day';

  const getDotColor = (wr: number) => wr >= baseline ? '#4ade80' : '#f87171';

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <p className="text-[12px] md:text-[14px] text-white font-semibold whitespace-nowrap">{winRateLabel}</p>
        <p className="text-[12px] md:text-[14px] text-slate-400 font-semibold whitespace-nowrap pr-6 md:pr-10">{gamesLabel}</p>
      </div>
      <div className="h-[300px] sm:h-[350px] [&_svg]:overflow-visible">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 12, right: AXIS_PAD, left: 0, bottom: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
            <ReferenceLine yAxisId="left" y={baseline} stroke="#f1f5f9" strokeWidth={2} strokeOpacity={0.5} strokeDasharray="6 3" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: isMobile ? 13 : 15, fill: '#f1f5f9', fontWeight: 600 }}
              interval={0}
              label={{ value: dayLabel, position: 'insideBottom', offset: -5, fill: '#f1f5f9', fontSize: isMobile ? 13 : 14, fontWeight: 600 }}
              height={50}
            />
            {/* Left Y-axis: Win Rate */}
            <YAxis
              yAxisId="left"
              tick={{ fontSize: isMobile ? 11 : 13, fill: '#f1f5f9', fontWeight: 600 }}
              domain={[20, 80]}
              ticks={[20, 30, 40, 50, 60, 70, 80]}
              tickFormatter={(v) => `${v}%`}
              tickLine={false}
              width={AXIS_PAD}
            />
            {/* Right Y-axis: Game count */}
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: isMobile ? 11 : 13, fill: '#94a3b8', fontWeight: 600 }}
              tickLine={false}
              width={AXIS_PAD}
            />
            <Tooltip
              cursor={false}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              content={({ active, payload }: any) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload;
                if (!d) return null;
                return (
                  <div style={{ backgroundColor: '#1e293b', borderRadius: '8px', border: '1px solid #334155', padding: isMobile ? '6px 8px' : '8px 12px' }}>
                    <p style={{ color: '#f1f5f9', fontWeight: 700, marginBottom: 4, fontSize: isMobile ? 11 : 14 }}>{d.label}</p>
                    {d.win_rate != null ? (
                      <p style={{ color: getDotColor(d.win_rate), fontWeight: 600, fontSize: isMobile ? 11 : 14 }}>Win rate: {d.win_rate}%</p>
                    ) : (
                      <p style={{ color: '#64748b', fontSize: isMobile ? 11 : 14 }}>{t('chess.insufficientData')}</p>
                    )}
                    <p style={{ color: '#94a3b8', fontSize: isMobile ? 10 : 12 }}>{d.sample_size} games</p>
                  </div>
                );
              }}
            />
            {/* Volume bars on right axis */}
            <Bar dataKey="sample_size" yAxisId="right" radius={[4, 4, 0, 0]} fill="#64748b" opacity={0.5} stroke="#94a3b8" strokeWidth={1} />
            {/* Win rate line on left axis */}
            <Line
              type="monotone"
              dataKey="win_rate"
              yAxisId="left"
              stroke="none"
              connectNulls={false}
              dot={(props: any) => {
                const { cx, cy, payload } = props;
                if (payload.win_rate == null) return <g key={`dot-${payload.label}`} />;
                return <circle key={`dot-${payload.label}`} cx={cx} cy={cy} r={5} fill={getDotColor(payload.win_rate)} stroke="none" />;
              }}
              activeDot={(props: any) => {
                const { cx, cy, payload } = props;
                if (payload.win_rate == null) return <g key={`adot-${payload.label}`} />;
                return <circle key={`adot-${payload.label}`} cx={cx} cy={cy} r={7} fill={getDotColor(payload.win_rate)} stroke="none" />;
              }}
            />
            {/* Neutral line segments between consecutive valid dots */}
            {chartData.map((d, i) => {
              if (i === 0 || d.win_rate == null) return null;
              let prev = null;
              for (let j = i - 1; j >= 0; j--) {
                if (chartData[j].win_rate != null) { prev = chartData[j]; break; }
              }
              if (!prev) return null;
              return (
                <ReferenceLine
                  key={`seg-${i}`}
                  yAxisId="left"
                  segment={[
                    { x: prev.label, y: prev.win_rate as number },
                    { x: d.label, y: d.win_rate as number },
                  ]}
                  stroke="#e2e8f0"
                  strokeWidth={2}
                />
              );
            })}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
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
      ) : data ? (
        <ChessCard title={t('chess.bestDaysTitle')} action={toggle}>
          <DaysChart stats={stats ?? []} />
        </ChessCard>
      ) : null}
    </CardPageLayout>
  );
}
