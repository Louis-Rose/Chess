// My Data panel with ELO history and games played charts

import { BarChart3 } from 'lucide-react';
import { useChessData } from '../contexts/ChessDataContext';
import { LoadingProgress } from '../../../components/shared/LoadingProgress';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

export function MyDataPanel() {
  const { data, loading, progress, searchedUsername } = useChessData();

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

  // Format week/year for display
  const formatPeriod = (year: number, week: number) => {
    const date = new Date(year, 0, 1 + (week - 1) * 7);
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  };

  // Prepare ELO history data
  const eloData = data.elo_history?.map(item => ({
    ...item,
    label: formatPeriod(item.year, item.week)
  })) || [];

  // Prepare games played data
  const gamesData = data.history?.map(item => ({
    ...item,
    label: formatPeriod(item.year, item.week)
  })) || [];

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col items-center gap-2 mb-6 mt-8">
        <h2 className="text-3xl font-bold text-slate-100">My Data</h2>
        <p className="text-slate-400 text-lg italic">
          Viewing stats for @{data.player.username}
        </p>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">
        {/* Stats Summary */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-slate-100 rounded-xl p-6 text-center">
            <p className="text-3xl font-bold text-slate-800">{data.total_games?.toLocaleString() || 0}</p>
            <p className="text-slate-500 text-sm">Total Games</p>
          </div>
          <div className="bg-slate-100 rounded-xl p-6 text-center">
            <p className="text-3xl font-bold text-slate-800">{data.total_rapid?.toLocaleString() || 0}</p>
            <p className="text-slate-500 text-sm">Rapid Games</p>
          </div>
          <div className="bg-slate-100 rounded-xl p-6 text-center">
            <p className="text-3xl font-bold text-slate-800">{data.total_blitz?.toLocaleString() || 0}</p>
            <p className="text-slate-500 text-sm">Blitz Games</p>
          </div>
        </div>

        {/* ELO History Chart */}
        <div className="bg-slate-100 rounded-xl p-6">
          <h3 className="text-xl font-bold text-slate-800 mb-4">ELO History</h3>
          {eloData.length > 0 ? (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={eloData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12, fill: '#64748b' }}
                    interval={Math.floor(eloData.length / 6)}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: '#64748b' }}
                    domain={['dataMin - 50', 'dataMax + 50']}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                    formatter={(value) => [value ?? 0, 'ELO']}
                  />
                  <Line
                    type="monotone"
                    dataKey="elo"
                    stroke="#16a34a"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-slate-500 text-center py-8">No ELO history data available.</p>
          )}
        </div>

        {/* Games Played Chart */}
        <div className="bg-slate-100 rounded-xl p-6">
          <h3 className="text-xl font-bold text-slate-800 mb-4">Games Played</h3>
          {gamesData.length > 0 ? (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={gamesData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12, fill: '#64748b' }}
                    interval={Math.floor(gamesData.length / 6)}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: '#64748b' }}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                    formatter={(value) => [value ?? 0, 'Games']}
                  />
                  <Bar
                    dataKey="games_played"
                    fill="#3b82f6"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-slate-500 text-center py-8">No games history data available.</p>
          )}
        </div>
      </div>
    </div>
  );
}
