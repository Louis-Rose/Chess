import { useState, useMemo, useCallback, useReducer } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { Target, Pencil } from 'lucide-react';
import { useChessData } from '../contexts/ChessDataContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { getChessPrefs, saveChessPrefs } from '../utils/constants';

function generateEloGoals(currentElo: number): number[] {
  const base = Math.ceil(currentElo / 50) * 50;
  const start = base <= currentElo ? base + 50 : base;
  return Array.from({ length: 5 }, (_, i) => start + i * 50);
}

export function EloGoalCard() {
  const { data, selectedTimeClass, playerInfo } = useChessData();
  const { t } = useLanguage();
  const [, forceUpdate] = useReducer(x => x + 1, 0);
  const [editing, setEditing] = useState(false);
  const [draftGoal, setDraftGoal] = useState<number | null>(null);
  const [draftMonths, setDraftMonths] = useState(3);

  // Read prefs fresh each render so onboarding changes are picked up
  const prefs = getChessPrefs();

  const currentElo = selectedTimeClass === 'blitz'
    ? playerInfo?.blitz_rating
    : playerInfo?.rapid_rating;

  const { elo_goal, elo_goal_start_elo, elo_goal_start_date, elo_goal_months } = prefs;

  const hasGoal = elo_goal !== null && elo_goal_start_elo !== null && elo_goal_start_date !== null;

  // Compute end date from start + months
  const endDate = useMemo(() => {
    if (!elo_goal_start_date) return null;
    const d = new Date(elo_goal_start_date);
    d.setMonth(d.getMonth() + elo_goal_months);
    return d;
  }, [elo_goal_start_date, elo_goal_months]);

  // Build chart data: merge goal line + actual elo
  const chartData = useMemo(() => {
    if (!hasGoal || !elo_goal_start_date || !endDate) return [];

    const startMs = new Date(elo_goal_start_date).getTime();
    const endMs = endDate.getTime();

    const goalPoints: Record<string, { date: string; goal?: number; actual?: number }> = {};
    const startKey = elo_goal_start_date;
    const endKey = endDate.toISOString().slice(0, 10);
    goalPoints[startKey] = { date: startKey, goal: elo_goal_start_elo! };
    goalPoints[endKey] = { date: endKey, goal: elo_goal! };

    const eloHistory = data?.elo_history ?? [];
    for (const entry of eloHistory) {
      const d = entry.date;
      const ms = new Date(d).getTime();
      if (ms < startMs) continue;
      if (ms > endMs + 7 * 86400000) continue;
      if (goalPoints[d]) {
        goalPoints[d].actual = entry.elo;
      } else {
        goalPoints[d] = { date: d, actual: entry.elo };
      }
    }

    return Object.values(goalPoints).sort((a, b) => a.date.localeCompare(b.date));
  }, [hasGoal, elo_goal_start_date, elo_goal_start_elo, elo_goal, endDate, data, elo_goal_months]);

  // Y-axis domain
  const yDomain = useMemo(() => {
    if (!chartData.length) return [0, 100];
    const values = chartData.flatMap(d => [d.goal, d.actual].filter((v): v is number => v != null));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = Math.max(30, Math.round((max - min) * 0.15));
    return [Math.floor((min - padding) / 10) * 10, Math.ceil((max + padding) / 10) * 10];
  }, [chartData]);

  const formatMonth = useCallback((dateStr: string) => {
    const [y, m] = dateStr.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    return d.toLocaleDateString('en-US', { month: 'short' });
  }, []);

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

  // No goal set yet — compact card matching grid siblings
  if (!hasGoal && !editing) {
    return (
      <div className="relative bg-slate-800 border border-slate-700 rounded-xl p-5 h-[120px] flex items-center justify-center hover:border-blue-500 transition-colors cursor-pointer"
        onClick={openSetGoal}
      >
        <div className="absolute top-5 left-5 w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
          <Target className="w-5 h-5 text-white" />
        </div>
        <h3 className="text-lg font-bold text-slate-100 text-center text-balance pl-12 pr-2 py-4">
          {t('chess.goalCard.setGoal')}
        </h3>
      </div>
    );
  }

  // Editing without a goal — expanded inline editor
  if (!hasGoal && editing) {
    return (
      <div className="md:col-span-2 bg-slate-800 border border-slate-700 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
            <Target className="w-5 h-5 text-white" />
          </div>
          <h3 className="text-lg font-bold text-slate-100">{t('chess.goalCard.title')}</h3>
        </div>
        {currentElo && (
          <GoalEditor
            currentElo={currentElo}
            eloGoals={eloGoals}
            draftGoal={draftGoal}
            draftMonths={draftMonths}
            onGoalChange={setDraftGoal}
            onMonthsChange={setDraftMonths}
            onSave={handleSave}
            onCancel={() => setEditing(false)}
            t={t}
          />
        )}
      </div>
    );
  }

  // Goal set — chart view spanning full grid width
  return (
    <div className="md:col-span-2 bg-slate-800 border border-slate-700 rounded-xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
            <Target className="w-5 h-5 text-white" />
          </div>
          <h3 className="text-lg font-bold text-slate-100">{t('chess.goalCard.title')}</h3>
        </div>
        {!editing && (
          <button
            onClick={openEditor}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-400 hover:text-white border border-slate-600 hover:border-slate-500 rounded-lg transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            {t('chess.goalCard.updateGoal')}
          </button>
        )}
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid stroke="#475569" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatMonth}
                tick={{ fill: '#94a3b8', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={yDomain}
                tick={{ fill: '#94a3b8', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={45}
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}
                labelStyle={{ color: '#f1f5f9', fontWeight: 700 }}
                itemStyle={{ color: '#f1f5f9' }}
                labelFormatter={(dateStr: string) => {
                  const [y, m, d] = dateStr.split('-').map(Number);
                  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
                }}
                formatter={(value?: number, name?: string) => {
                  const label = name === 'goal' ? t('chess.goalCard.goal') : t('chess.goalCard.actual');
                  return [value ?? '', label];
                }}
              />
              <Legend
                formatter={(value: string) => value === 'goal' ? t('chess.goalCard.goal') : t('chess.goalCard.actual')}
                iconType="line"
                wrapperStyle={{ fontSize: 12 }}
              />
              <Line
                dataKey="goal"
                stroke="#3b82f6"
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={false}
                connectNulls
              />
              <Line
                dataKey="actual"
                stroke="#16a34a"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Inline editor */}
      {editing && currentElo && (
        <GoalEditor
          currentElo={currentElo}
          eloGoals={eloGoals}
          draftGoal={draftGoal}
          draftMonths={draftMonths}
          onGoalChange={setDraftGoal}
          onMonthsChange={setDraftMonths}
          onSave={handleSave}
          onCancel={() => setEditing(false)}
          t={t}
        />
      )}
    </div>
  );
}

function GoalEditor({ currentElo, eloGoals, draftGoal, draftMonths, onGoalChange, onMonthsChange, onSave, onCancel, t }: {
  currentElo: number;
  eloGoals: number[];
  draftGoal: number | null;
  draftMonths: number;
  onGoalChange: (v: number) => void;
  onMonthsChange: (v: number) => void;
  onSave: () => void;
  onCancel: () => void;
  t: (key: string) => string;
}) {
  return (
    <div className="mt-4 pt-4 border-t border-slate-700 space-y-4">
      {/* Current elo reference */}
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
              onClick={() => onGoalChange(goal)}
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
              onClick={() => onMonthsChange(m)}
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
          onClick={onSave}
          disabled={draftGoal === null}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t('chess.goalCard.save')}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-slate-600 hover:border-slate-500 rounded-lg transition-colors"
        >
          {t('chess.goalCard.cancel')}
        </button>
      </div>
    </div>
  );
}
