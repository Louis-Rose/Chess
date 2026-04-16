import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Avatar } from '../../components/Avatar';

export interface ClickableBarUser {
  user_id: number;
  name: string;
  picture: string | null;
  value: number;
}

export interface ClickableBarDatum {
  date: string;
  label: string;
  value: number;
  by_user: ClickableBarUser[];
}

export interface ClickableBarChartProps {
  data: ClickableBarDatum[];
  color: string;
  height?: number;
  yTicks?: number[];
  yDomain?: [number | string, number | string | ((max: number) => number)];
  tooltipUnit: string;
  tooltipLabel: string;
  formatUserValue: (v: number) => string;
  formatDayValue: (v: number) => string;
}

export function ClickableBarChart({
  data,
  color,
  height = 200,
  yTicks,
  yDomain,
  tooltipUnit,
  tooltipLabel,
  formatUserValue,
  formatDayValue,
}: ClickableBarChartProps) {
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const expandedDay = expandedDate ? data.find(d => d.date === expandedDate) : null;

  const handleBarClick = (payload: unknown) => {
    const p = payload as { date?: string; payload?: { date?: string } } | undefined;
    const date = p?.date ?? p?.payload?.date;
    if (!date) return;
    setExpandedDate(d => (d === date ? null : date));
  };

  return (
    <div className="[&_*:focus]:outline-none">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="label" tick={{ fill: '#e2e8f0', fontSize: 11 }} angle={-45} textAnchor="end" height={60} interval={0} />
          <YAxis
            tick={{ fill: '#e2e8f0', fontSize: 13 }}
            allowDecimals={false}
            {...(yTicks ? { ticks: yTicks } : {})}
            {...(yDomain ? { domain: yDomain } : {})}
          />
          <Tooltip
            cursor={false}
            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
            labelStyle={{ color: '#e2e8f0' }}
            formatter={(value) => [`${value} ${tooltipUnit}`, tooltipLabel]}
          />
          <Bar
            dataKey="value"
            fill={color}
            radius={[2, 2, 0, 0]}
            activeBar={false}
            onClick={handleBarClick}
            style={{ cursor: 'pointer' }}
          />
        </BarChart>
      </ResponsiveContainer>
      {expandedDay && (
        <div className="mt-3 rounded-lg border border-slate-700 bg-slate-800/50 overflow-hidden">
          <div className="px-3 py-2 bg-slate-700/40 flex items-center justify-between">
            <h4 className="text-xs font-medium text-slate-300">{expandedDay.label} — {formatDayValue(expandedDay.value)}</h4>
            <button onClick={() => setExpandedDate(null)} className="text-xs text-slate-500 hover:text-slate-300">✕</button>
          </div>
          {expandedDay.by_user.length === 0 ? (
            <div className="px-3 py-3 text-xs text-slate-500">No activity</div>
          ) : (
            <div className="divide-y divide-slate-700/50">
              {expandedDay.by_user.map(u => (
                <div key={u.user_id} className="flex items-center gap-3 px-3 py-2">
                  <Avatar name={u.name || '?'} picture={u.picture} size="sm" />
                  <span className="flex-1 text-sm text-slate-200 truncate">{u.name || '—'}</span>
                  <span className="text-sm font-mono text-slate-400">{formatUserValue(u.value)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
