// My Data panel - placeholder (full version to be extracted from App.tsx)

import { BarChart3 } from 'lucide-react';
import { useChessData } from '../contexts/ChessDataContext';
import { LoadingProgress } from '../../../components/shared/LoadingProgress';

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

        {/* Placeholder for charts */}
        <div className="bg-slate-100 rounded-xl p-6">
          <h3 className="text-xl font-bold text-slate-800 mb-4">ELO History</h3>
          <p className="text-slate-500 text-center py-8">
            Charts will be displayed here. Full implementation coming soon.
          </p>
        </div>

        <div className="bg-slate-100 rounded-xl p-6">
          <h3 className="text-xl font-bold text-slate-800 mb-4">Games Played</h3>
          <p className="text-slate-500 text-center py-8">
            Charts will be displayed here. Full implementation coming soon.
          </p>
        </div>
      </div>
    </div>
  );
}
