import { useState, useMemo, useReducer, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceDot,
} from 'recharts';
import { ArrowLeft, Pencil, X, Minus, Plus } from 'lucide-react';
import { useChessData } from '../contexts/ChessDataContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { TimeClassToggle } from '../components/TimeClassToggle';
import { AnalyzedGamesBanner } from '../components/AnalyzedGamesBanner';
import { TimePeriodToggle, getDateCutoff } from '../components/TimePeriodToggle';
import type { TimePeriod } from '../components/TimePeriodToggle';
import { getChessPrefs, saveChessPrefs } from '../utils/constants';
import { ChessCard } from '../components/ChessCard';

export function GoalPage() {
  const navigate = useNavigate();
  const { data, loading, selectedTimeClass, handleTimeClassChange, playerInfo } = useChessData();
  const { t } = useLanguage();
  const [, forceUpdate] = useReducer(x => x + 1, 0);
  const [editing, setEditing] = useState(false);
  const [draftGoal, setDraftGoal] = useState<number | null>(null);
  const [draftMonths, setDraftMonths] = useState(3);
  const [period, setPeriod] = useState<TimePeriod>('ALL');

  const prefs = getChessPrefs();
  const player = playerInfo ?? data?.player;
  const currentElo = selectedTimeClass === 'blitz'
    ? player?.blitz_rating
    : player?.rapid_rating;

  const { elo_goal, elo_goal_start_elo, elo_goal_start_date, elo_goal_months } = prefs;
  const hasGoal = elo_goal !== null && elo_goal_start_elo !== null && elo_goal_start_date !== null;

  const endDate = useMemo(() => {
    if (!elo_goal_start_date) return null;
    const d = new Date(elo_goal_start_date);
    d.setMonth(d.getMonth() + elo_goal_months);
    return d;
  }, [elo_goal_start_date, elo_goal_months]);

  // Filter elo_history by period
  const filteredEloHistory = useMemo(() => {
    const history = data?.elo_history ?? [];
    const cutoff = getDateCutoff(period);
    if (!cutoff) return history;
    return history.filter(e => e.date >= cutoff);
  }, [data?.elo_history, period]);

  type ChartPoint = { date: string; ts: number; goal?: number; actual?: number };

  const chartData = useMemo((): ChartPoint[] => {
    if (!hasGoal || !elo_goal_start_date || !endDate) {
      // No goal — just show elo history
      if (filteredEloHistory.length === 0) return [];
      return filteredEloHistory.map(e => ({
        date: e.date,
        ts: new Date(e.date).getTime(),
        actual: e.elo,
      }));
    }

    const startMs = new Date(elo_goal_start_date).getTime();
    const endMs = endDate.getTime();
    const cutoff = getDateCutoff(period);
    const cutoffMs = cutoff ? new Date(cutoff).getTime() : null;

    // Determine visible range: either period cutoff or goal start, whichever is earlier
    const rangeStartMs = cutoffMs ? Math.min(cutoffMs, startMs) : startMs;

    const points: Record<string, { date: string; ts: number; goal?: number; actual?: number }> = {};

    // Goal line: start and end points (only if within visible range)
    if (startMs >= rangeStartMs) {
      points[elo_goal_start_date] = { date: elo_goal_start_date, ts: startMs, goal: elo_goal_start_elo!, actual: elo_goal_start_elo! };
    }
    const endKey = endDate.toISOString().slice(0, 10);
    points[endKey] = { date: endKey, ts: endMs, goal: elo_goal! };

    // Add all filtered elo history points
    for (const entry of filteredEloHistory) {
      const ms = new Date(entry.date).getTime();
      if (points[entry.date]) {
        points[entry.date].actual = entry.elo;
      } else {
        points[entry.date] = { date: entry.date, ts: ms, actual: entry.elo };
      }
    }

    return Object.values(points).sort((a, b) => a.ts - b.ts);
  }, [hasGoal, elo_goal_start_date, elo_goal_start_elo, elo_goal, endDate, filteredEloHistory, period, elo_goal_months]);

  const { yDomain, yTicks } = useMemo(() => {
    if (!chartData.length) return { yDomain: [0, 100], yTicks: [0, 100] };
    const values = chartData.flatMap(d => [d.goal, d.actual].filter((v): v is number => v != null));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const tickLo = Math.floor(min / 100) * 100;
    const tickHi = Math.ceil(max / 100) * 100;
    const ticks: number[] = [];
    for (let v = tickLo; v <= tickHi; v += 100) ticks.push(v);
    return { yDomain: [tickLo - 50, tickHi + 50], yTicks: ticks };
  }, [chartData]);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const xTicks = useMemo(() => {
    if (!chartData.length) return [];
    const startMs = chartData[0].ts;
    const endMs = chartData[chartData.length - 1].ts;
    const totalDays = (endMs - startMs) / 86400000;
    const maxTicks = isMobile ? 4 : 8;
    let intervalDays: number;
    if (totalDays <= 45) intervalDays = 7;
    else if (totalDays <= 90) intervalDays = 14;
    else if (totalDays <= 365) intervalDays = 30;
    else intervalDays = 90;
    while (totalDays / intervalDays > maxTicks) intervalDays *= 2;

    const ticks: number[] = [];
    const cursor = new Date(startMs);
    while (cursor.getTime() <= endMs) {
      ticks.push(cursor.getTime());
      cursor.setDate(cursor.getDate() + intervalDays);
    }
    if (ticks[ticks.length - 1] !== endMs) ticks.push(endMs);
    return ticks;
  }, [chartData, isMobile]);

  const totalDays = chartData.length >= 2
    ? (chartData[chartData.length - 1].ts - chartData[0].ts) / 86400000
    : 0;

  const formatDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    if (totalDays > 365) {
      // Multi-year: show "Nov '23"
      return date.toLocaleDateString('en-US', { month: 'short' }) + " '" + String(y).slice(2);
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const openEditor = () => {
    setDraftGoal(elo_goal ?? (currentElo ? Math.ceil(currentElo / 50) * 50 + 50 : 1500));
    setDraftMonths(elo_goal_months);
    setEditing(true);
  };

  const openSetGoal = () => {
    setDraftGoal(currentElo ? Math.ceil(currentElo / 50) * 50 + 50 : 1500);
    setDraftMonths(3);
    setEditing(true);
  };

  const handleSave = () => {
    if (draftGoal === null) return;
    const startElo = currentElo ?? elo_goal_start_elo;
    if (!startElo) return;
    saveChessPrefs({
      elo_goal: draftGoal,
      elo_goal_start_elo: startElo,
      elo_goal_start_date: new Date().toISOString().slice(0, 10),
      elo_goal_months: draftMonths,
    });
    forceUpdate();
    setEditing(false);
  };

  const showChart = chartData.length > 0;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="max-w-4xl mx-auto mt-2 space-y-2">
        <AnalyzedGamesBanner />
        {/* Header */}
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

        {/* No goal — prompt to set one */}
        {!hasGoal && !editing && !showChart && (
          <div className="text-center py-12 space-y-4">
            <p className="text-slate-400">{t('chess.goalCard.setGoalPrompt')}</p>
            <button
              onClick={openSetGoal}
              className="px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              {t('chess.goalCard.setGoal')}
            </button>
          </div>
        )}

        {/* No goal but has elo history — show history + set goal button */}
        {!hasGoal && !editing && showChart && (
          <>
            <ChessCard
              title={t('chess.goalCard.title')}
              leftAction={
                <button
                  onClick={openSetGoal}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white border border-white/60 hover:border-white rounded-lg transition-colors"
                >
                  {t('chess.goalCard.setGoal')}
                </button>
              }
              action={<TimePeriodToggle selected={period} onChange={setPeriod} />}
            >
              <div className="h-[450px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid stroke="#475569" vertical={false} horizontalCoordinatesGenerator={({ yAxis }: any) => {
                      const ticks = yAxis?.ticks;
                      if (!ticks || ticks.length < 3) return [];
                      return ticks.slice(1, -1).map((t: any) => yAxis.scale(t));
                    }} />
                    <XAxis
                      dataKey="ts"
                      type="number"
                      domain={['dataMin', 'dataMax']}
                      scale="time"
                      ticks={xTicks}
                      tickFormatter={(ts: number) => formatDate(new Date(ts).toISOString().slice(0, 10))}
                      tick={({ x, y, payload, index, visibleTicksCount }: any) => {
                        if (index === 0 || index === visibleTicksCount - 1) return <g />;
                        return <text x={x} y={y} dy={4} textAnchor="end" fill="#ffffff" fontSize={14} fontWeight={700}>{payload.value}</text>;
                      }}
                      axisLine={false}
                      tickLine={false}
                      angle={isMobile ? -35 : 0}
                      textAnchor={isMobile ? 'end' : 'middle'}
                      height={isMobile ? 50 : 30}
                    />
                    <YAxis
                      domain={yDomain}
                      ticks={yTicks}
                      interval={0}
                      tick={({ x, y, payload, index, visibleTicksCount }: any) => {
                        if (index === 0 || index === visibleTicksCount - 1) return <g />;
                        return <text x={x} y={y} dy={4} textAnchor="end" fill="#ffffff" fontSize={14} fontWeight={700}>{payload.value}</text>;
                      }}
                      axisLine={false}
                      tickLine={false}
                      width={45}
                    />
                    <Tooltip
                      content={({ active, payload, label }: any) => {
                        if (!active || !payload?.length) return null;
                        const dateLabel = new Date(label as number).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
                        const items = payload.filter((p: any) => p.value != null);
                        if (!items.length) return null;
                        return (
                          <div style={{ backgroundColor: '#1e293b', borderRadius: '8px', border: '1px solid #334155', padding: '8px 12px' }}>
                            <p style={{ color: '#f1f5f9', fontWeight: 700, marginBottom: 4 }}>{dateLabel}</p>
                            {items.map((p: any) => (
                              <p key={p.dataKey} style={{ color: p.color, margin: 0, fontSize: 13 }}>
                                {p.dataKey === 'goal' ? t('chess.goalCard.goal') : t('chess.goalCard.actual')}: {p.value}
                              </p>
                            ))}
                          </div>
                        );
                      }}
                    />
                    <Line dataKey="actual" stroke="#16a34a" strokeWidth={2} dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </ChessCard>
          </>
        )}

        {/* Chart with goal */}
        {hasGoal && showChart && (
          <ChessCard
            title={t('chess.goalCard.title')}
            leftAction={
              <button
                onClick={openEditor}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white border border-white/60 hover:border-white rounded-lg transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                {t('chess.goalCard.updateGoal')}
              </button>
            }
            action={<TimePeriodToggle selected={period} onChange={setPeriod} />}
          >
            <div className="h-[450px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid stroke="#475569" vertical={false} />
                  <XAxis
                    dataKey="ts"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    scale="time"
                    ticks={xTicks}
                    tickFormatter={(ts: number) => formatDate(new Date(ts).toISOString().slice(0, 10))}
                    tick={{ fill: '#ffffff', fontSize: 14, fontWeight: 700 }}
                    axisLine={false}
                    tickLine={false}
                    angle={isMobile ? -35 : 0}
                    textAnchor={isMobile ? 'end' : 'middle'}
                    height={isMobile ? 50 : 30}
                  />
                  <YAxis
                    domain={yDomain}
                    ticks={yTicks}
                    tick={{ fill: '#ffffff', fontSize: 14, fontWeight: 700 }}
                    axisLine={false}
                    tickLine={false}
                    width={45}
                  />
                  <Tooltip
                    content={({ active, payload, label }: any) => {
                      if (!active || !payload?.length) return null;
                      const dateLabel = new Date(label as number).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
                      const endMs = endDate!.getTime();
                      const items = payload.filter((p: any) => {
                        if (p.value == null) return false;
                        if (p.dataKey === 'goal' && Math.abs((label as number) - endMs) > 86400000) return false;
                        return true;
                      });
                      if (!items.length) return null;
                      return (
                        <div style={{ backgroundColor: '#1e293b', borderRadius: '8px', border: '1px solid #334155', padding: '8px 12px' }}>
                          <p style={{ color: '#f1f5f9', fontWeight: 700, marginBottom: 4 }}>{dateLabel}</p>
                          {items.map((p: any) => (
                            <p key={p.dataKey} style={{ color: p.color, margin: 0, fontSize: 13 }}>
                              {p.dataKey === 'goal' ? t('chess.goalCard.goal') : t('chess.goalCard.actual')}: {p.value}
                            </p>
                          ))}
                        </div>
                      );
                    }}
                  />
                  <Legend
                    formatter={(value: string) => value === 'goal' ? t('chess.goalCard.goal') : t('chess.goalCard.actual')}
                    iconType="line"
                    wrapperStyle={{ fontSize: 12 }}
                  />
                  <Line dataKey="goal" stroke="#3b82f6" strokeWidth={2} strokeDasharray="6 3" dot={false} connectNulls />
                  <Line dataKey="actual" stroke="#16a34a" strokeWidth={2} dot={false} connectNulls />
                  {/* Start point */}
                  <ReferenceDot x={new Date(elo_goal_start_date!).getTime()} y={elo_goal_start_elo!} r={5} fill="#3b82f6" stroke="#1e293b" strokeWidth={2} />
                  {/* Goal point */}
                  <ReferenceDot x={endDate!.getTime()} y={elo_goal!} r={5} fill="#3b82f6" stroke="#1e293b" strokeWidth={2} />
                  {/* Latest actual elo point */}
                  {(() => {
                    const last = [...chartData].reverse().find(d => d.actual != null);
                    return last ? <ReferenceDot x={last.ts} y={last.actual!} r={5} fill="#16a34a" stroke="#1e293b" strokeWidth={2} /> : null;
                  })()}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChessCard>
        )}

        {/* Modal editor */}
        {editing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setEditing(false)}>
            <div className="bg-slate-800 rounded-xl p-5 w-full max-w-md mx-4 space-y-4" onClick={e => e.stopPropagation()}>
              <div className="relative flex items-center justify-center">
                <h2 className="text-lg font-bold text-slate-100">{t('chess.goalCard.updateGoal')}</h2>
                <button onClick={() => setEditing(false)} className="absolute right-0 text-slate-400 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Goal picker — incrementer by 50 */}
              <div>
                <div className="flex items-center justify-center gap-4">
                  <button
                    onClick={() => setDraftGoal(g => (g ?? 1500) - 50)}
                    className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white transition-colors"
                  >
                    <Minus className="w-5 h-5" />
                  </button>
                  <span className="text-2xl font-bold text-white tabular-nums min-w-[80px] text-center">
                    {draftGoal ?? 1500}
                  </span>
                  <button
                    onClick={() => setDraftGoal(g => (g ?? 1500) + 50)}
                    className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Month selector */}
              <div>
                <div className="flex gap-2 flex-wrap justify-center">
                  {[1, 2, 3].map(m => (
                    <button
                      key={m}
                      onClick={() => setDraftMonths(m)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                        draftMonths === m
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                      }`}
                    >
                      {t(m === 1 ? 'chess.goalCard.months' : 'chess.goalCard.monthsPlural').replace('{n}', String(m))}
                    </button>
                  ))}
                </div>
              </div>

              {/* Save */}
              <div className="flex justify-center pt-2">
                <button
                  onClick={handleSave}
                  disabled={draftGoal === null}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {t('chess.goalCard.save')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
