// Openings bar chart component

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import type { OpeningData } from '../../apps/chess/utils/types';
import { formatNumber, getBarColor } from '../../apps/chess/utils/helpers';

interface OpeningsChartProps {
  data: OpeningData[];
}

export const OpeningsChart = ({ data }: OpeningsChartProps) => {
  if (!data || data.length === 0) return <p className="text-slate-500 italic text-center">No data available.</p>;

  return (
    <div className="h-[500px] w-full">
      <ResponsiveContainer width="99%" height={320}>
        <BarChart layout="vertical" data={data} margin={{ left: 10, right: 30 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#ccc" />
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="opening"
            width={110}
            style={{ fontSize: '12px', fontWeight: 600, fill: '#334155' }}
            interval={0}
          />
          <Tooltip
            cursor={{fill: '#f1f5f9'}}
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const d = payload[0].payload;
                return (
                  <div className="bg-white p-3 border border-slate-200 shadow-xl rounded text-sm text-slate-800 z-50">
                    <p className="font-bold text-base mb-1">{d.opening}</p>
                    <p>Games Played: <span className="font-mono">{formatNumber(d.games)}</span></p>
                    <p>Win Rate: <span className="font-mono font-bold" style={{color: getBarColor(d.win_rate)}}>{d.win_rate}%</span></p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Bar dataKey="games" radius={[0, 4, 4, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getBarColor(entry.win_rate)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
