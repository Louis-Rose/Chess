// Win Prediction panel - placeholder

import { TrendingUp } from 'lucide-react';
import { useChessData } from '../contexts/ChessDataContext';

export function WinPredictionPanel() {
  const { data } = useChessData();

  if (!data) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex flex-col items-center justify-center py-20">
          <TrendingUp className="w-16 h-16 text-slate-500 mb-4" />
          <h2 className="text-2xl font-bold text-slate-300 mb-2">No Data Available</h2>
          <p className="text-slate-500">Search for a player using the sidebar to view win prediction analysis.</p>
        </div>
      </div>
    );
  }

  const wp = data.win_prediction;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col items-center gap-2 mb-6 mt-8">
        <h2 className="text-3xl font-bold text-slate-100">Win Prediction</h2>
        <p className="text-slate-400 text-lg italic">Analyzing patterns in your game outcomes</p>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">
        {/* Win rates after previous results */}
        {wp && (
          <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-6">
            <h3 className="text-xl font-bold text-slate-800 mb-4">Win Rate After Previous Result</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-white rounded-lg">
                <p className="text-2xl font-bold text-green-600">{wp.win_rate_after_win?.toFixed(1)}%</p>
                <p className="text-slate-500 text-sm">After Win</p>
                <p className="text-slate-400 text-xs">{wp.games_after_win} games</p>
              </div>
              <div className="text-center p-4 bg-white rounded-lg">
                <p className="text-2xl font-bold text-red-600">{wp.win_rate_after_loss?.toFixed(1)}%</p>
                <p className="text-slate-500 text-sm">After Loss</p>
                <p className="text-slate-400 text-xs">{wp.games_after_loss} games</p>
              </div>
              <div className="text-center p-4 bg-white rounded-lg">
                <p className="text-2xl font-bold text-yellow-600">{wp.win_rate_after_draw?.toFixed(1)}%</p>
                <p className="text-slate-500 text-sm">After Draw</p>
                <p className="text-slate-400 text-xs">{wp.games_after_draw} games</p>
              </div>
            </div>
          </div>
        )}

        {/* Insights */}
        {wp?.insights && wp.insights.length > 0 && (
          <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-6">
            <h3 className="text-xl font-bold text-slate-800 mb-4">Insights</h3>
            <div className="space-y-3">
              {wp.insights.map((insight, idx) => (
                <div key={idx} className={`p-4 rounded-lg ${
                  insight.type === 'warning' ? 'bg-red-50 border-l-4 border-red-500' :
                  insight.type === 'positive' ? 'bg-green-50 border-l-4 border-green-500' :
                  'bg-blue-50 border-l-4 border-blue-500'
                }`}>
                  <p className="font-bold text-slate-800">{insight.title}</p>
                  <p className="text-slate-600 text-sm">{insight.message}</p>
                  <p className="text-slate-500 text-xs mt-1 italic">{insight.recommendation}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
