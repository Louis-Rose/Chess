// My Data panel with ELO history and games played charts

import { useState } from 'react';
import { BarChart3, ChevronRight } from 'lucide-react';
import { useChessData } from '../contexts/ChessDataContext';
import { LoadingProgress } from '../../../components/shared/LoadingProgress';
import {
  ComposedChart, Line, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

function CollapsibleSection({ title, defaultExpanded = true, children }: { title: string; defaultExpanded?: boolean; children: React.ReactNode }) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  return (
    <div className="bg-slate-50 dark:bg-slate-700 rounded-xl shadow-sm dark:shadow-none">
      <div className="flex items-center p-4">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-3 text-left flex-1"
        >
          <ChevronRight className={`w-5 h-5 text-slate-500 dark:text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">{title}</h3>
        </button>
      </div>
      {isExpanded && (
        <div className="px-4 pb-4">
          {children}
        </div>
      )}
    </div>
  );
}

export function MyDataPanel() {
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
          <h2 className="text-2xl font-bold text-slate-300 mb-2">No Data Available</h2>
          <p className="text-slate-500">Search for a player using the sidebar to view their statistics.</p>
        </div>
      </div>
    );
  }

  // Convert ISO week/year to a proper date (Monday of that week)
  const weekToDate = (year: number, week: number) => {
    const jan4 = new Date(year, 0, 4);
    const dayOfWeek = jan4.getDay() || 7;
    const monday = new Date(jan4);
    monday.setDate(jan4.getDate() - dayOfWeek + 1 + (week - 1) * 7);
    return monday;
  };

  // X-axis label: full month + 4-digit year
  const formatAxisLabel = (year: number, week: number) => {
    const date = weekToDate(year, week);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  // Tooltip label: full month + ordinal day + 4-digit year
  const formatTooltipLabel = (year: number, week: number) => {
    const date = weekToDate(year, week);
    const month = date.toLocaleDateString('en-US', { month: 'long' });
    const day = date.getDate();
    const suffix = day === 1 || day === 21 || day === 31 ? 'st' : day === 2 || day === 22 ? 'nd' : day === 3 || day === 23 ? 'rd' : 'th';
    return `${month} ${day}${suffix}, ${date.getFullYear()}`;
  };

  // Merge ELO history and games played into a single dataset keyed by year+week
  const mergedMap = new Map<string, { year: number; week: number; elo?: number; games_played?: number }>();

  for (const item of data.elo_history || []) {
    const key = `${item.year}-${item.week}`;
    mergedMap.set(key, { ...mergedMap.get(key), year: item.year, week: item.week, elo: item.elo });
  }
  for (const item of data.history || []) {
    const key = `${item.year}-${item.week}`;
    mergedMap.set(key, { ...mergedMap.get(key), year: item.year, week: item.week, games_played: item.games_played });
  }

  // Sort by date and add labels
  const chartData = Array.from(mergedMap.values())
    .sort((a, b) => a.year !== b.year ? a.year - b.year : a.week - b.week)
    .map(item => ({
      ...item,
      label: formatAxisLabel(item.year, item.week),
      tooltipLabel: formatTooltipLabel(item.year, item.week),
    }));

  // Compute explicit ELO Y-axis ticks (multiples of 100)
  const eloValues = chartData.map(d => d.elo).filter((v): v is number => v != null);
  const eloMin = eloValues.length > 0 ? Math.floor(Math.min(...eloValues) / 100) * 100 : 0;
  const eloMax = eloValues.length > 0 ? Math.ceil(Math.max(...eloValues) / 100) * 100 : 100;
  const eloTicks: number[] = [];
  for (let v = eloMin; v <= eloMax; v += 100) eloTicks.push(v);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col items-center gap-2 mb-6 mt-8">
        <h2 className="text-3xl font-bold text-slate-100">My Data</h2>
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
            <p className="text-slate-500 dark:text-slate-400 text-sm">Current ELO</p>
          </div>
        </div>

        {/* Combined ELO Ranking & Games Played Chart */}
        <CollapsibleSection title="ELO Ranking & Games Played" defaultExpanded>
          {chartData.length > 0 ? (
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12, fill: '#f1f5f9' }}
                    interval={Math.floor(chartData.length / 6)}
                  />
                  <YAxis
                    yAxisId="elo"
                    tick={{ fontSize: 12, fill: '#16a34a' }}
                    domain={[eloMin, eloMax]}
                    ticks={eloTicks}
                    allowDecimals={false}
                  />
                  <YAxis
                    yAxisId="games"
                    orientation="right"
                    tick={{ fontSize: 12, fill: '#3b82f6' }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}
                    labelStyle={{ color: '#f1f5f9' }}
                    itemStyle={{ color: '#f1f5f9' }}
                    labelFormatter={(_label, payload) => payload?.[0]?.payload?.tooltipLabel ?? _label}
                    formatter={(value, name) => [value ?? 0, name === 'elo' ? 'ELO' : 'Games']}
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
          )}
        </CollapsibleSection>
      </div>
    </div>
  );
}
