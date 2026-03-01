import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useChessData } from '../contexts/ChessDataContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { CardPageLayout } from '../components/CardPageLayout';
import { useTimePeriod } from '../hooks/useTimePeriod';
import { ChessCard } from '../components/ChessCard';
import type { HourlyStats, DayOfWeekStats, HeatmapCell } from '../utils/types';
import { filterGameLog, computeHourlyStats, computeDowStats, computeHeatmapStats } from '../utils/helpers';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';

/* ── Hours chart ────────────────────────────────────────────── */

function formatHourRange(start: number, end: number, lang: string): string {
  if (lang === 'fr') {
    return `${start}h-${end}h`;
  }
  const fmt = (h: number) => {
    if (h === 0 || h === 24) return '12AM';
    if (h === 12) return '12PM';
    return h < 12 ? `${h}AM` : `${h - 12}PM`;
  };
  return `${fmt(start)}-${fmt(end)}`;
}

function HoursChart({ stats }: { stats: HourlyStats[] }) {
  const { t, language } = useLanguage();

  const { chartData, baseline } = useMemo(() => {
    const statsMap = new Map(stats.map(d => [d.hour_group, d]));
    const data = Array.from({ length: 12 }, (_, hg) => {
      const d = statsMap.get(hg);
      const sufficient = d && d.sample_size >= 30;
      return {
        hour_group: hg,
        start_hour: hg * 2,
        end_hour: hg * 2 + 2,
        win_rate: sufficient ? d.win_rate : null,
        sample_size: d?.sample_size ?? 0,
        label: formatHourRange(hg * 2, hg * 2 + 2, language),
      };
    });

    return { chartData: data, baseline: 50 };
  }, [stats, language]);

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const AXIS_PAD = isMobile ? 34 : 48;
  const winRateLabel = language === 'fr' ? 'Taux de victoire' : 'Win Rate';
  const gamesLabel = language === 'fr' ? 'Parties jouées' : 'Games played';
  const hourLabel = language === 'fr' ? 'Heure' : 'Hour';

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
              tick={{ fontSize: isMobile ? 12 : 13, fill: '#f1f5f9', fontWeight: 600 }}
              interval={0}
              angle={-45}
              textAnchor="end"
              height={language === 'fr' ? 60 : 75}
              label={{ value: hourLabel, position: 'insideBottom', offset: -5, fill: '#f1f5f9', fontSize: isMobile ? 13 : 14, fontWeight: 600 }}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: isMobile ? 11 : 13, fill: '#f1f5f9', fontWeight: 600 }}
              domain={[20, 80]}
              ticks={[20, 30, 40, 50, 60, 70, 80]}
              tickFormatter={(v) => `${v}%`}
              tickLine={false}
              width={AXIS_PAD}
            />
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
            <Bar dataKey="sample_size" yAxisId="right" radius={[4, 4, 0, 0]} fill="#64748b" opacity={0.5} stroke="#94a3b8" strokeWidth={1} />
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

/* ── Days chart ─────────────────────────────────────────────── */

const DAY_NAMES_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_NAMES_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MIN_SAMPLE = 30;

function DaysChart({ stats }: { stats: DayOfWeekStats[] }) {
  const { t, language } = useLanguage();
  const dayNames = language === 'fr' ? DAY_NAMES_FR : DAY_NAMES_EN;

  const { chartData, baseline } = useMemo(() => {
    const statsMap = new Map(stats.map(d => [d.day, d]));
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
            <YAxis
              yAxisId="left"
              tick={{ fontSize: isMobile ? 11 : 13, fill: '#f1f5f9', fontWeight: 600 }}
              domain={[20, 80]}
              ticks={[20, 30, 40, 50, 60, 70, 80]}
              tickFormatter={(v) => `${v}%`}
              tickLine={false}
              width={AXIS_PAD}
            />
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
            <Bar dataKey="sample_size" yAxisId="right" radius={[4, 4, 0, 0]} fill="#64748b" opacity={0.5} stroke="#94a3b8" strokeWidth={1} />
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

/* ── Heatmap chart ──────────────────────────────────────────── */

function getCellColor(winRate: number | null): string {
  if (winRate == null) return 'bg-slate-800';
  if (winRate >= 60) return 'bg-green-500';
  if (winRate >= 55) return 'bg-green-600';
  if (winRate >= 52) return 'bg-green-700';
  if (winRate >= 50) return 'bg-green-800';
  if (winRate >= 48) return 'bg-red-900';
  if (winRate >= 45) return 'bg-red-700';
  return 'bg-red-600';
}

function getCellTextColor(winRate: number | null): string {
  if (winRate == null) return 'text-slate-600';
  return 'text-white';
}

function HeatmapChart({ cells }: { cells: HeatmapCell[] }) {
  const { t, language } = useLanguage();
  const dayLabels = language === 'fr' ? DAY_NAMES_FR : DAY_NAMES_EN;
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  // Build a lookup: cellMap[day][hour_group]
  const cellMap = useMemo(() => {
    const map: Record<number, Record<number, HeatmapCell>> = {};
    for (const c of cells) {
      if (!map[c.day]) map[c.day] = {};
      map[c.day][c.hour_group] = c;
    }
    return map;
  }, [cells]);

  const hourLabels = useMemo(() =>
    Array.from({ length: 12 }, (_, hg) => formatHourRange(hg * 2, hg * 2 + 2, language)),
    [language]
  );

  return (
    <div className="overflow-x-auto">
      <div className={`grid gap-[2px] ${isMobile ? 'min-w-[480px]' : ''}`}
        style={{ gridTemplateColumns: `auto repeat(7, 1fr)` }}>
        {/* Header row: empty corner + day names */}
        <div />
        {dayLabels.map(d => (
          <div key={d} className="text-center text-[11px] md:text-xs font-semibold text-slate-300 py-1">{d}</div>
        ))}

        {/* Data rows: hour label + 7 day cells */}
        {Array.from({ length: 12 }, (_, hg) => (
          <div key={hg} className="contents">
            <div className="flex items-center text-[10px] md:text-xs text-slate-400 font-medium pr-1 md:pr-2 whitespace-nowrap justify-end">
              {hourLabels[hg]}
            </div>
            {Array.from({ length: 7 }, (_, day) => {
              const cell = cellMap[day]?.[hg];
              const wr = cell?.win_rate ?? null;
              const n = cell?.sample_size ?? 0;
              return (
                <div
                  key={day}
                  className={`relative group rounded-[3px] md:rounded ${getCellColor(wr)} flex items-center justify-center h-[26px] md:h-[30px] cursor-default`}
                >
                  {/* Desktop: show value inside cell */}
                  {!isMobile && (
                    <span className={`text-[11px] font-semibold ${getCellTextColor(wr)}`}>
                      {wr != null ? `${wr}%` : ''}
                    </span>
                  )}
                  {/* Tooltip on hover */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10 pointer-events-none">
                    <div className="bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 whitespace-nowrap shadow-lg">
                      <p className="text-xs font-bold text-white">{dayLabels[day]} {hourLabels[hg]}</p>
                      {wr != null ? (
                        <p className={`text-xs font-semibold ${wr >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                          {wr}%
                        </p>
                      ) : (
                        <p className="text-xs text-slate-500">{t('chess.insufficientData')}</p>
                      )}
                      <p className="text-[10px] text-slate-400">{n} games</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-1.5 mt-3 text-[10px] md:text-xs text-slate-400">
        <span>{language === 'fr' ? 'Faible' : 'Low'}</span>
        <div className="flex gap-[2px]">
          <div className="w-4 h-3 rounded-sm bg-red-600" />
          <div className="w-4 h-3 rounded-sm bg-red-700" />
          <div className="w-4 h-3 rounded-sm bg-red-900" />
          <div className="w-4 h-3 rounded-sm bg-green-800" />
          <div className="w-4 h-3 rounded-sm bg-green-700" />
          <div className="w-4 h-3 rounded-sm bg-green-600" />
          <div className="w-4 h-3 rounded-sm bg-green-500" />
        </div>
        <span>{language === 'fr' ? 'Élevé' : 'High'}</span>
        <span className="ml-2 text-slate-500">|</span>
        <div className="w-4 h-3 rounded-sm bg-slate-800 ml-1" />
        <span className="text-slate-500">&lt;30 games</span>
      </div>
    </div>
  );
}

/* ── Combined page ──────────────────────────────────────────── */

type ViewMode = 'hour' | 'day' | 'both';

const VIEW_LABELS: Record<ViewMode, { en: string; fr: string }> = {
  hour: { en: 'Hour', fr: 'Heure' },
  day: { en: 'Day', fr: 'Jour' },
  both: { en: 'Both', fr: 'Les deux' },
};

function ViewToggle({ selected, onChange, language }: { selected: ViewMode; onChange: (v: ViewMode) => void; language: string }) {
  return (
    <div className="inline-flex bg-slate-800 rounded-lg p-0.5 gap-0.5">
      {(['hour', 'day', 'both'] as ViewMode[]).map(v => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
            selected === v ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          {language === 'fr' ? VIEW_LABELS[v].fr : VIEW_LABELS[v].en}
        </button>
      ))}
    </div>
  );
}

export function WhenToPlayPage() {
  const { t, language } = useLanguage();
  const { data, loading } = useChessData();
  const { period, toggle } = useTimePeriod();
  const [view, setView] = useState<ViewMode>('hour');

  const hourlyStats = useMemo(() => {
    if (!data) return undefined;
    if (period === 'ALL' || !data.game_log?.length) return data.hourly_stats;
    return computeHourlyStats(filterGameLog(data.game_log, period));
  }, [data, period]);

  const dowStats = useMemo(() => {
    if (!data) return undefined;
    if (period === 'ALL' || !data.game_log?.length) return data.dow_stats;
    return computeDowStats(filterGameLog(data.game_log, period));
  }, [data, period]);

  const heatmapCells = useMemo(() => {
    if (!data?.game_log?.length) return undefined;
    return computeHeatmapStats(filterGameLog(data.game_log, period));
  }, [data, period]);

  if (!data && !loading) return <p className="text-slate-400 text-center mt-16">{t('chess.noData')}</p>;

  return (
    <CardPageLayout>
      {loading && !data ? (
        <div className="flex justify-center py-20"><Loader2 className="w-12 h-12 text-slate-400 animate-spin" /></div>
      ) : data ? (
        <ChessCard
          title={view === 'hour' ? t('chess.bestHoursTitle') : view === 'day' ? t('chess.bestDaysTitle') : t('chess.heatmapTitle')}
          action={toggle}
          leftAction={<ViewToggle selected={view} onChange={setView} language={language} />}
        >
          {view === 'hour' && <HoursChart stats={hourlyStats ?? []} />}
          {view === 'day' && <DaysChart stats={dowStats ?? []} />}
          {view === 'both' && heatmapCells && <HeatmapChart cells={heatmapCells} />}
        </ChessCard>
      ) : null}
    </CardPageLayout>
  );
}
