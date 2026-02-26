import { useState, useMemo, useReducer, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceDot,
} from 'recharts';
import { ArrowLeft, Pencil } from 'lucide-react';
import { useChessData } from '../contexts/ChessDataContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { getChessPrefs, saveChessPrefs } from '../utils/constants';

function generateEloGoals(currentElo: number): number[] {
  const base = Math.ceil(currentElo / 50) * 50;
  const start = base <= currentElo ? base + 50 : base;
  return Array.from({ length: 5 }, (_, i) => start + i * 50);
}

export function GoalPage() {
  const navigate = useNavigate();
  const { data, selectedTimeClass, playerInfo } = useChessData();
  const { t } = useLanguage();
  const [, forceUpdate] = useReducer(x => x + 1, 0);
  const [editing, setEditing] = useState(false);
  const [draftGoal, setDraftGoal] = useState<number | null>(null);
  const [draftMonths, setDraftMonths] = useState(3);

  const prefs = getChessPrefs();
  const currentElo = selectedTimeClass === 'blitz'
    ? playerInfo?.blitz_rating
    : playerInfo?.rapid_rating;

  const { elo_goal, elo_goal_start_elo, elo_goal_start_date, elo_goal_months } = prefs;
  const hasGoal = elo_goal !== null && elo_goal_start_elo !== null && elo_goal_start_date !== null;

  const endDate = useMemo(() => {
    if (!elo_goal_start_date) return null;
    const d = new Date(elo_goal_start_date);
    d.setMonth(d.getMonth() + elo_goal_months);
    return d;
  }, [elo_goal_start_date, elo_goal_months]);

  const chartData = useMemo(() => {
    if (!hasGoal || !elo_goal_start_date || !endDate) return [];

    const startMs = new Date(elo_goal_start_date).getTime();
    const endMs = endDate.getTime();

    const points: Record<string, { date: string; ts: number; goal?: number; actual?: number }> = {};
    points[elo_goal_start_date] = { date: elo_goal_start_date, ts: startMs, goal: elo_goal_start_elo! };
    const endKey = endDate.toISOString().slice(0, 10);
    points[endKey] = { date: endKey, ts: endMs, goal: elo_goal! };

    for (const entry of data?.elo_history ?? []) {
      const ms = new Date(entry.date).getTime();
      if (ms < startMs || ms > endMs + 7 * 86400000) continue;
      if (points[entry.date]) {
        points[entry.date].actual = entry.elo;
      } else {
        points[entry.date] = { date: entry.date, ts: ms, actual: entry.elo };
      }
    }

    return Object.values(points).sort((a, b) => a.ts - b.ts);
  }, [hasGoal, elo_goal_start_date, elo_goal_start_elo, elo_goal, endDate, data, elo_goal_months]);

  const { yDomain, yTicks } = useMemo(() => {
    if (!chartData.length) return { yDomain: [0, 100], yTicks: [0, 50, 100] };
    const values = chartData.flatMap(d => [d.goal, d.actual].filter((v): v is number => v != null));
    const min = Math.min(...values);
    const max = Math.max(...values);
    // Round down/up to nearest 50 for clean ticks
    const lo = Math.floor(min / 50) * 50;
    const hi = Math.ceil(max / 50) * 50;
    // Generate all ticks, then drop the lowest (below the data range)
    const allTicks: number[] = [];
    for (let v = lo; v <= hi; v += 50) allTicks.push(v);
    const ticks = allTicks.length > 2 ? allTicks.slice(1) : allTicks;
    return { yDomain: [lo, hi], yTicks: ticks };
  }, [chartData]);

  // Generate x-axis tick dates: adapt density to screen width and timeline length
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const xTicks = useMemo(() => {
    if (!elo_goal_start_date || !endDate) return [];
    const start = new Date(elo_goal_start_date);
    const totalDays = (endDate.getTime() - start.getTime()) / 86400000;
    // Choose interval: mobile gets fewer ticks
    const maxTicks = isMobile ? 4 : 8;
    let intervalDays: number;
    if (totalDays <= 45) intervalDays = 7;
    else if (totalDays <= 90) intervalDays = 14;
    else intervalDays = 30;
    // Adjust if too many ticks
    while (totalDays / intervalDays > maxTicks) intervalDays *= 2;

    const ticks: number[] = [];
    const cursor = new Date(start);
    while (cursor <= endDate) {
      ticks.push(cursor.getTime());
      cursor.setDate(cursor.getDate() + intervalDays);
    }
    // Always include end date
    const endMs = endDate.getTime();
    if (ticks[ticks.length - 1] !== endMs) ticks.push(endMs);
    return ticks;
  }, [elo_goal_start_date, endDate, isMobile]);

  const xTicksMs = xTicks;

  const formatDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const openEditor = () => {
    setDraftGoal(elo_goal);
    setDraftMonths(elo_goal_months);
    setEditing(true);
  };

  const openSetGoal = () => {
    setDraftGoal(null);
    setDraftMonths(3);
    setEditing(true);
  };

  const handleSave = () => {
    if (draftGoal === null || !currentElo) return;
    saveChessPrefs({
      elo_goal: draftGoal,
      elo_goal_start_elo: currentElo,
      elo_goal_start_date: new Date().toISOString().slice(0, 10),
      elo_goal_months: draftMonths,
    });
    forceUpdate();
    setEditing(false);
  };

  const eloGoals = useMemo(
    () => currentElo ? generateEloGoals(currentElo) : [],
    [currentElo]
  );

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="max-w-4xl mx-auto mt-2 space-y-2">
        {/* Header */}
        <div className="relative flex items-center justify-center">
          <button
            onClick={() => navigate('/chess')}
            className="absolute left-2 md:left-4 flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors text-base"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Previous</span>
          </button>
        </div>
        <div className="border-t border-slate-700" />

        {/* No goal — prompt to set one */}
        {!hasGoal && !editing && (
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

        {/* Chart */}
        {hasGoal && chartData.length > 0 && (
          <div className="bg-slate-700 rounded-xl p-5">
            {!editing && (
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-100 select-text">{t('chess.goalCard.title')}</h2>
                <button
                  onClick={openEditor}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-400 hover:text-white border border-slate-600 hover:border-slate-500 rounded-lg transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  {t('chess.goalCard.updateGoal')}
                </button>
              </div>
            )}
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid stroke="#475569" vertical={false} />
                  <XAxis
                    dataKey="ts"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    scale="time"
                    ticks={xTicksMs}
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
                      // Filter: only show goal on the end date, only show actual when present
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
          </div>
        )}

        {/* Inline editor */}
        {editing && currentElo && (
          <div className="bg-slate-700 rounded-xl p-5 space-y-4">
            {/* Current elo */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-400">{t('chess.goalCard.actual')}:</span>
              <span className="px-4 py-2 rounded-xl border-2 border-green-500 bg-green-500/10 text-white font-semibold">
                {currentElo}
              </span>
            </div>

            {/* Goal picker */}
            <div>
              <span className="text-sm text-slate-400 block mb-2">{t('chess.goalCard.goal')}:</span>
              <div className="flex gap-2 flex-wrap">
                {eloGoals.map(goal => (
                  <button
                    key={goal}
                    onClick={() => setDraftGoal(goal)}
                    className={`px-4 py-2 rounded-xl border-2 transition-all font-semibold ${
                      draftGoal === goal
                        ? 'border-blue-500 bg-blue-500/10 text-white'
                        : 'border-slate-600 bg-slate-800 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    {goal}
                  </button>
                ))}
              </div>
            </div>

            {/* Month selector */}
            <div>
              <span className="text-sm text-slate-400 block mb-2">{t('chess.goalCard.timeline')}:</span>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5, 6].map(m => (
                  <button
                    key={m}
                    onClick={() => setDraftMonths(m)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                      draftMonths === m
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                    }`}
                  >
                    {t('chess.goalCard.months').replace('{n}', String(m))}
                  </button>
                ))}
              </div>
            </div>

            {/* Save / Cancel */}
            <div className="flex gap-3">
              <button
                onClick={handleSave}
                disabled={draftGoal === null}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t('chess.goalCard.save')}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-slate-600 hover:border-slate-500 rounded-lg transition-colors"
              >
                {t('chess.goalCard.cancel')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
