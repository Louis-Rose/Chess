// Identify Weaknesses panel - placeholder

import { Target, Loader2 } from 'lucide-react';
import { useChessData } from '../contexts/ChessDataContext';

export function WeaknessesPanel() {
  const { data, fatigueAnalysis, fatigueLoading, handleAnalyzeFatigue } = useChessData();

  if (!data) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex flex-col items-center justify-center py-20">
          <Target className="w-16 h-16 text-slate-500 mb-4" />
          <h2 className="text-2xl font-bold text-slate-300 mb-2">No Data Available</h2>
          <p className="text-slate-500">Search for a player using the sidebar to analyze weaknesses.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col items-center gap-2 mb-6 mt-8">
        <h2 className="text-3xl font-bold text-slate-100">Identify My Weaknesses</h2>
        <p className="text-slate-400 text-lg italic">Analyzing fatigue and performance patterns</p>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">
        {!fatigueAnalysis && !fatigueLoading && (
          <div className="text-center py-12">
            <button
              onClick={handleAnalyzeFatigue}
              className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 flex items-center gap-2 mx-auto"
            >
              <Target className="w-5 h-5" />
              Analyze Fatigue Patterns
            </button>
          </div>
        )}

        {fatigueLoading && (
          <div className="flex flex-col items-center py-12">
            <Loader2 className="animate-spin w-10 h-10 text-blue-500 mb-4" />
            <p className="text-slate-400">Analyzing your fatigue patterns...</p>
          </div>
        )}

        {fatigueAnalysis && !fatigueAnalysis.error && (
          <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-6">
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 dark:text-slate-100 mb-4">Fatigue Analysis</h3>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="text-center p-4 bg-white rounded-lg">
                <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 dark:text-slate-100">{fatigueAnalysis.baseline_win_rate?.toFixed(1)}%</p>
                <p className="text-slate-500 dark:text-slate-400 text-sm">Baseline Win Rate</p>
              </div>
              <div className="text-center p-4 bg-white rounded-lg">
                <p className="text-2xl font-bold text-green-600">{fatigueAnalysis.best_win_rate?.toFixed(1)}%</p>
                <p className="text-slate-500 dark:text-slate-400 text-sm">Best (Game #{fatigueAnalysis.best_game_number})</p>
              </div>
              <div className="text-center p-4 bg-white rounded-lg">
                <p className="text-2xl font-bold text-red-600">{fatigueAnalysis.worst_win_rate?.toFixed(1)}%</p>
                <p className="text-slate-500 dark:text-slate-400 text-sm">Worst (Game #{fatigueAnalysis.worst_game_number})</p>
              </div>
            </div>

            {fatigueAnalysis.insights && fatigueAnalysis.insights.length > 0 && (
              <div className="space-y-3">
                {fatigueAnalysis.insights.map((insight, idx) => (
                  <div key={idx} className={`p-4 rounded-lg ${
                    insight.type === 'warning' ? 'bg-red-50 border-l-4 border-red-500' :
                    insight.type === 'positive' ? 'bg-green-50 border-l-4 border-green-500' :
                    'bg-blue-50 border-l-4 border-blue-500'
                  }`}>
                    <p className="font-bold text-slate-800 dark:text-slate-100">{insight.title}</p>
                    <p className="text-slate-600 dark:text-slate-300 text-sm">{insight.message}</p>
                    <p className="text-slate-500 text-xs mt-1 italic">{insight.recommendation}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
