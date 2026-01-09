// How to Improve (from Pros) panel

import { useChessData } from '../contexts/ChessDataContext';
import { PRO_PLAYERS } from '../utils/constants';
import { formatNumber } from '../utils/helpers';

export function ProsTipsPanel() {
  const { selectedPro, setSelectedPro } = useChessData();

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col items-center gap-2 mb-6 mt-8">
        <h2 className="text-3xl font-bold text-slate-100 whitespace-nowrap">
          How to Improve (from Pros)
        </h2>
        <p className="text-slate-400 text-lg italic">Learn from the world's best players</p>
      </div>

      {/* Player Selection Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto mb-8">
        {PRO_PLAYERS.map((player) => (
          <button
            key={player.name}
            onClick={() => setSelectedPro(selectedPro === player.name ? '' : player.name)}
            className={`p-4 rounded-xl border-2 transition-all text-left ${
              selectedPro === player.name
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'bg-slate-800 border-slate-700 text-slate-200 hover:border-slate-500'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className={`text-2xl font-bold ${selectedPro === player.name ? 'text-blue-200' : 'text-slate-500'}`}>
                #{player.rank}
              </span>
              <div>
                <p className="font-bold">{player.name}</p>
                <p className={`text-sm ${selectedPro === player.name ? 'text-blue-200' : 'text-slate-400'}`}>
                  {player.country} • {formatNumber(player.rating)}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Selected Player Content */}
      {selectedPro && (() => {
        const player = PRO_PLAYERS.find(p => p.name === selectedPro);
        if (!player) return null;
        return (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Video Embed */}
            <div className="bg-slate-800 rounded-xl overflow-hidden">
              <div className="aspect-video">
                <iframe
                  width="100%"
                  height="100%"
                  src={`https://www.youtube.com/embed/${player.videoId}`}
                  title={player.videoTitle}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full"
                ></iframe>
              </div>
              <div className="p-4">
                <p className="text-slate-300 text-sm">
                  <span className="text-slate-500">Source:</span> {player.videoTitle}
                </p>
              </div>
            </div>

            {/* Tips */}
            <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-6">
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 dark:text-slate-100 mb-4">
                Key Tips from {player.name}
              </h3>
              <div className="space-y-4">
                {player.tips.map((tip, idx) => (
                  <div key={idx} className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                      {idx + 1}
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 dark:text-slate-100">{tip.title}</p>
                      <p className="text-slate-600 dark:text-slate-300 text-sm">{tip.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {!selectedPro && (
        <div className="text-center text-slate-400 py-12">
          <p>Select a player above to see their tips and video</p>
        </div>
      )}
    </div>
  );
}
