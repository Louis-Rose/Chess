// My Data panel with Elo history and games played charts

import { useState, useEffect, useCallback } from 'react';
import { BarChart3, ChevronRight, Maximize2, Minimize2 } from 'lucide-react';
import { useChessData } from '../contexts/ChessDataContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import type { ApiResponse } from '../utils/types';
import { LoadingProgress } from '../../../components/shared/LoadingProgress';
import {
  ComposedChart, BarChart, Line, Bar, ReferenceLine,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import axios from 'axios';

function CollapsibleSection({ title, defaultExpanded = true, children }: { title: string; defaultExpanded?: boolean; children: React.ReactNode | ((fullscreen: boolean) => React.ReactNode) }) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const closeFullscreen = useCallback(() => setIsFullscreen(false), []);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeFullscreen(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen, closeFullscreen]);

  const card = (
    <div className={isFullscreen
      ? 'bg-slate-50 dark:bg-slate-700 rounded-xl shadow-lg flex flex-col overflow-hidden w-full h-full'
      : 'bg-slate-50 dark:bg-slate-700 rounded-xl shadow-sm dark:shadow-none'
    }>
      <div className="flex items-center p-4">
        <button
          onClick={() => { if (!isFullscreen) setIsExpanded(!isExpanded); }}
          className="flex items-center gap-3 text-left flex-1"
        >
          {!isFullscreen && (
            <ChevronRight className={`w-5 h-5 text-slate-500 dark:text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
          )}
          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">{title}</h3>
        </button>
        <button
          onClick={isFullscreen ? closeFullscreen : () => setIsFullscreen(true)}
          className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-400 transition-colors"
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen
            ? <Minimize2 className="w-4 h-4" />
            : <Maximize2 className="w-4 h-4" />
          }
        </button>
      </div>
      {(isExpanded || isFullscreen) && (
        <div className={isFullscreen ? 'px-4 pb-4 flex-1 min-h-0 flex flex-col *:flex-1 *:!h-auto' : 'px-4 pb-4'}>
          {typeof children === 'function' ? children(isFullscreen) : children}
        </div>
      )}
    </div>
  );

  if (isFullscreen) {
    return (
      <>
        {/* placeholder to keep layout stable */}
        <div className="bg-slate-50 dark:bg-slate-700 rounded-xl shadow-sm dark:shadow-none p-4 opacity-0 pointer-events-none" aria-hidden />
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-8 bg-black/50 backdrop-blur-sm" onClick={closeFullscreen}>
          <div className="w-[90vw] h-[80vh]" onClick={e => e.stopPropagation()}>
            {card}
          </div>
        </div>
      </>
    );
  }

  return card;
}

function DailyVolumeSection({ data }: { data: ApiResponse }) {
  const { t } = useLanguage();
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const rawDvs = data.daily_volume_stats;

  useEffect(() => {
    if (!rawDvs || rawDvs.length === 0) return;
    setAiLoading(true);
    axios.post('/api/chess/analyze-daily-volume', { stats: rawDvs })
      .then(res => setAiSummary(res.data.summary))
      .catch(() => setAiSummary(null))
      .finally(() => setAiLoading(false));
  }, [rawDvs]);

  return (
    <CollapsibleSection title={t('chess.dailyVolumeTitle')} defaultExpanded>
      {(fullscreen) => {
        if (!rawDvs || rawDvs.length === 0) return <p className="text-slate-500 text-center py-8">{t('chess.noData')}</p>;

        // Only show statistically significant data (> 5 days)
        const dvs = rawDvs.filter(d => d.days > 5);
        if (dvs.length === 0) return <p className="text-slate-500 text-center py-8">{t('chess.noData')}</p>;

        const fs = fullscreen ? 18 : 14;

        return (
          <div className="space-y-4">
            <div>
              <div className="text-center mb-3">
                <h4 className="text-white font-semibold">{t('chess.winRate')}</h4>
                <p className="text-white/70 text-xs mt-1">{t('chess.winRateFormula')}</p>
                <p className="text-white/70 text-xs">{t('chess.winRateFilter')}</p>
              </div>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dvs} margin={{ top: 10, right: 20, left: 10, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                    <ReferenceLine y={50} stroke="#f1f5f9" strokeWidth={2} strokeOpacity={0.5} />
                    <XAxis
                      dataKey="games_per_day"
                      tick={{ fontSize: fs, fill: '#f1f5f9', fontWeight: 700 }}
                      label={{ value: 'Games per day', position: 'insideBottom', offset: -15, fill: '#94a3b8', fontSize: fs, fontWeight: 700 }}
                    />
                    <YAxis
                      tick={{ fontSize: fs, fill: '#f1f5f9', fontWeight: 700 }}
                      domain={[0, 100]}
                      ticks={[0, 25, 50, 75, 100]}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      content={({ active, payload, label }: any) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0]?.payload;
                        if (!d || d.total_games === 0) return null;
                        const winRate = (d.win_pct + d.draw_pct / 2).toFixed(1);
                        return (
                          <div style={{ backgroundColor: '#1e293b', borderRadius: '8px', border: '1px solid #334155', padding: '8px 12px' }}>
                            <p style={{ color: '#f1f5f9', fontWeight: 700, marginBottom: 4 }}>{label} game{Number(label) !== 1 ? 's' : ''} / day</p>
                            <p style={{ color: '#f1f5f9' }}>Win rate: {winRate}%</p>
                            <p style={{ color: '#94a3b8', fontSize: 12 }}>{d.days} day{d.days !== 1 ? 's' : ''} of data</p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="win_pct" stackId="a" fill="#16a34a" />
                    <Bar dataKey="draw_pct" stackId="a" fill="#64748b" />
                    <Bar dataKey="loss_pct" stackId="a" fill="#dc2626" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* AI Summary */}
            <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-4">
              {aiLoading ? (
                <p className="text-slate-400 text-sm text-center animate-pulse">{t('chess.analyzing')}</p>
              ) : aiSummary ? (
                <div className="text-slate-300 text-sm space-y-3">
                  {aiSummary.split('\n').filter(Boolean).map((line, i) => {
                    // Split "Best Results: A, B, C" into label + individual results
                    const colonIdx = line.indexOf(':');
                    if (colonIdx === -1) return <p key={i}>{line}</p>;
                    const label = line.slice(0, colonIdx + 1).trim();
                    const items = line.slice(colonIdx + 1).split(',').map(s => s.trim()).filter(Boolean);
                    return (
                      <div key={i}>
                        <p className="font-semibold text-slate-200">{label}</p>
                        {items.map((item, j) => (
                          <p key={j} className="ml-4 text-slate-300">{item}</p>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-slate-500 text-sm text-center">{t('chess.aiUnavailable')}</p>
              )}
            </div>
          </div>
        );
      }}
    </CollapsibleSection>
  );
}

function StreakSection({ data }: { data: ApiResponse }) {
  const { t } = useLanguage();
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const stats = data.streak_stats;

  useEffect(() => {
    if (!stats || stats.length === 0) return;
    setAiLoading(true);
    axios.post('/api/chess/analyze-streak', { stats })
      .then(res => setAiSummary(res.data.summary))
      .catch(() => setAiSummary(null))
      .finally(() => setAiLoading(false));
  }, [stats]);

  const formatLabel = (type: string, len: number) => {
    if (type === 'win') return t(len === 1 ? 'chess.after1Win' : len === 2 ? 'chess.after2Wins' : 'chess.after3Wins');
    return t(len === 1 ? 'chess.after1Loss' : len === 2 ? 'chess.after2Losses' : 'chess.after3Losses');
  };

  return (
    <CollapsibleSection title={t('chess.streakTitle')} defaultExpanded>
      {() => {
        if (!stats || stats.length === 0) return <p className="text-slate-500 text-center py-8">{t('chess.noData')}</p>;

        const wins = stats.filter(s => s.streak_type === 'win').sort((a, b) => a.streak_length - b.streak_length);
        const losses = stats.filter(s => s.streak_type === 'loss').sort((a, b) => a.streak_length - b.streak_length);
        const rows = [...wins, ...losses];

        return (
          <div className="space-y-4">
            <table className="w-full border-collapse border border-slate-600">
              <thead>
                <tr className="border border-slate-600 bg-slate-800">
                  <th className="text-center text-white text-sm font-semibold py-3 px-4 border border-slate-600">{t('chess.situation')}</th>
                  <th className="text-center text-white text-sm font-semibold py-3 px-4 border border-slate-600">{t('chess.winRate')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={`${s.streak_type}-${s.streak_length}`} className="border border-slate-600">
                    <td className="text-center text-white text-sm py-3 px-4 border border-slate-600">{formatLabel(s.streak_type, s.streak_length)}</td>
                    <td className="text-center text-sm font-semibold py-3 px-4 border border-slate-600">
                      <span className={s.win_rate >= 50 ? 'text-green-400' : 'text-red-400'}>{s.win_rate}%</span>
                      <span className="text-slate-500 font-normal ml-2 text-xs">({s.sample_size} {t('chess.games')})</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* AI Summary */}
            <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-4">
              {aiLoading ? (
                <p className="text-slate-400 text-sm text-center animate-pulse">{t('chess.analyzing')}</p>
              ) : aiSummary ? (
                <div className="text-slate-300 text-sm">
                  {aiSummary}
                </div>
              ) : (
                <p className="text-slate-500 text-sm text-center">{t('chess.aiUnavailable')}</p>
              )}
            </div>
          </div>
        );
      }}
    </CollapsibleSection>
  );
}

export function MyDataPanel() {
  const { t } = useLanguage();
  const { data, loading, progress, searchedUsername, selectedTimeClass } = useChessData();

  if (loading && searchedUsername) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
        <LoadingProgress progress={progress} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex flex-col items-center justify-center py-20">
          <BarChart3 className="w-16 h-16 text-slate-500 mb-4" />
          <h2 className="text-2xl font-bold text-slate-300 mb-2">{t('chess.noData')}</h2>
          <p className="text-slate-500">{t('chess.searchPrompt')}</p>
        </div>
      </div>
    );
  }

  // Handle both new {date} and old cached {year, week} format
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getDateStr = (item: any): string => {
    if (typeof item.date === 'string') return item.date;
    // Old format: convert ISO year+week to a date string
    const year = item.year as number, week = item.week as number;
    const jan4 = new Date(year, 0, 4);
    const dayOfWeek = jan4.getDay() || 7;
    const monday = new Date(jan4);
    monday.setDate(jan4.getDate() - dayOfWeek + 1 + (week - 1) * 7);
    return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
  };

  // X-axis label: full month + 4-digit year
  const formatAxisLabel = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  // Tooltip label: full month + ordinal day + 4-digit year
  const formatTooltipLabel = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const month = date.toLocaleDateString('en-US', { month: 'long' });
    const day = date.getDate();
    const suffix = day === 1 || day === 21 || day === 31 ? 'st' : day === 2 || day === 22 ? 'nd' : day === 3 || day === 23 ? 'rd' : 'th';
    return `${month} ${day}${suffix}, ${date.getFullYear()}`;
  };

  // Merge Elo history and games played into a single dataset keyed by date
  const mergedMap = new Map<string, { date: string; elo?: number; games_played?: number }>();

  for (const item of data.elo_history || []) {
    const d = getDateStr(item);
    mergedMap.set(d, { ...mergedMap.get(d), date: d, elo: item.elo });
  }
  for (const item of data.history || []) {
    const d = getDateStr(item);
    mergedMap.set(d, { ...mergedMap.get(d), date: d, games_played: item.games_played });
  }

  // Sort by date; precompute month labels for axis ticks
  const chartData = Array.from(mergedMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(item => ({
      ...item,
      tooltipLabel: formatTooltipLabel(item.date),
    }));

  // Build list of indices where the month changes (for axis tick labels)
  const allMonthBoundaries: number[] = [];
  let prevMonth = '';
  chartData.forEach((item, i) => {
    const ml = formatAxisLabel(item.date);
    if (ml !== prevMonth) { allMonthBoundaries.push(i); prevMonth = ml; }
  });
  // Skip every other month if >18 months to avoid overlap
  const step = allMonthBoundaries.length > 18 ? 2 : 1;
  const monthBoundaries = new Set(allMonthBoundaries.filter((_, i) => i !== 0 && i % step === 0));

  // Compute explicit Elo Y-axis ticks (multiples of 100)
  const eloValues = chartData.map(d => d.elo).filter((v): v is number => v != null);
  const eloMin = eloValues.length > 0 ? Math.floor(Math.min(...eloValues) / 100) * 100 : 0;
  const eloMax = eloValues.length > 0 ? Math.ceil(Math.max(...eloValues) / 100) * 100 : 100;
  const eloTicks: number[] = [];
  for (let v = eloMin; v <= eloMax; v += 100) eloTicks.push(v);

  // Compute explicit games Y-axis ticks (multiples of 5)
  const gamesValues = chartData.map(d => d.games_played).filter((v): v is number => v != null);
  const gamesMax = gamesValues.length > 0 ? Math.ceil(Math.max(...gamesValues) / 5) * 5 : 5;
  const gamesTicks: number[] = [];
  for (let v = 0; v <= gamesMax; v += 5) gamesTicks.push(v);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col items-center gap-2 mb-6 mt-8">
        <h2 className="text-3xl font-bold text-slate-100">{t('chess.myData')}</h2>
        <p className="text-slate-400 text-lg italic">
          Viewing stats for @{data.player.username}
        </p>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">
        {/* Stats Summary - always open, no title */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-6 text-center">
            <p className="text-3xl font-bold text-slate-800 dark:text-slate-100">
              {(selectedTimeClass === 'rapid' ? data.total_rapid : data.total_blitz)?.toLocaleString() || 0}
            </p>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              {selectedTimeClass === 'rapid' ? 'Rapid' : 'Blitz'} Games
            </p>
          </div>
          <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-6 text-center">
            <p className="text-3xl font-bold text-slate-800 dark:text-slate-100">
              {eloValues.length > 0 ? eloValues[eloValues.length - 1]?.toLocaleString() : '—'}
            </p>
            <p className="text-slate-500 dark:text-slate-400 text-sm">Current Elo</p>
          </div>
        </div>

        {/* Combined Elo Ranking & Games Played Chart */}
        <CollapsibleSection title={t('chess.eloTitle')} defaultExpanded>
          {(fullscreen) => chartData.length > 0 ? (
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: fullscreen ? 30 : 20, left: fullscreen ? 20 : 10, bottom: fullscreen ? 80 : 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#475569" horizontalCoordinatesGenerator={({ yAxis }) => {
                    if (!yAxis?.ticks) return [];
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    return yAxis.ticks.map((t: any) => t.coordinate as number);
                  }} />
                  <XAxis
                    dataKey="date"
                    tick={(props: { x: number; y: number; index: number; payload: { value: string } }) => {
                      if (!monthBoundaries.has(props.index)) return <g />;
                      return (
                        <g transform={`translate(${props.x},${props.y})`}>
                          <text x={0} y={0} dy={20} textAnchor="end" fill="#f1f5f9" fontSize={fullscreen ? 18 : 14} fontWeight={700} transform="rotate(-45)">
                            {formatAxisLabel(props.payload.value)}
                          </text>
                        </g>
                      );
                    }}
                    interval={0}
                    height={fullscreen ? 100 : 80}
                  />
                  <YAxis
                    yAxisId="elo"
                    tick={{ fontSize: fullscreen ? 18 : 14, fill: '#16a34a', fontWeight: 700 }}
                    domain={[eloMin, eloMax]}
                    ticks={eloTicks}
                    allowDecimals={false}
                  />
                  <YAxis
                    yAxisId="games"
                    orientation="right"
                    tick={{ fontSize: fullscreen ? 18 : 14, fill: '#3b82f6', fontWeight: 700 }}
                    domain={[0, gamesMax]}
                    ticks={gamesTicks}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}
                    labelStyle={{ color: '#f1f5f9', fontWeight: 700 }}
                    itemStyle={{ color: '#f1f5f9' }}
                    labelFormatter={(_label, payload) => payload?.[0]?.payload?.tooltipLabel ?? _label}
                    formatter={(value, name) => [value ?? 0, name === 'elo' ? 'Elo' : 'Games']}
                  />
                  <Bar
                    yAxisId="games"
                    dataKey="games_played"
                    fill="#3b82f6"
                    opacity={0.4}
                    radius={[4, 4, 0, 0]}
                  />
                  <Line
                    yAxisId="elo"
                    type="monotone"
                    dataKey="elo"
                    stroke="#16a34a"
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-slate-500 text-center py-8">No data available.</p>
          )}</CollapsibleSection>

        {/* Games per day analysis */}
        <DailyVolumeSection data={data} />

        {/* Streak analysis */}
        <StreakSection data={data} />
      </div>
    </div>
  );
}
