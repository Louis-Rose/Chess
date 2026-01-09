// Openings panel - placeholder

import { BookOpen } from 'lucide-react';
import { useChessData } from '../contexts/ChessDataContext';
import { OpeningsChart } from '../../../components/charts/OpeningsChart';

export function OpeningsPanel() {
  const { data, allOpenings, selectedOpening, handleOpeningSelect, videos, videosLoading } = useChessData();

  if (!data) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex flex-col items-center justify-center py-20">
          <BookOpen className="w-16 h-16 text-slate-500 mb-4" />
          <h2 className="text-2xl font-bold text-slate-300 mb-2">No Data Available</h2>
          <p className="text-slate-500">Search for a player using the sidebar to view openings.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col items-center gap-2 mb-6 mt-8">
        <h2 className="text-3xl font-bold text-slate-100">Openings</h2>
        <p className="text-slate-400 text-lg italic">Your most played openings and win rates</p>
      </div>

      <div className="max-w-6xl mx-auto space-y-6">
        {/* Opening Charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-6">
            <h3 className="text-xl font-bold text-slate-800 mb-4 text-center">Openings as White</h3>
            <OpeningsChart data={data.openings.white} />
          </div>
          <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-6">
            <h3 className="text-xl font-bold text-slate-800 mb-4 text-center">Openings as Black</h3>
            <OpeningsChart data={data.openings.black} />
          </div>
        </div>

        {/* Learn Openings */}
        <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-6">
          <h3 className="text-xl font-bold text-slate-800 mb-4">Learn an Opening</h3>
          <select
            value={selectedOpening}
            onChange={(e) => handleOpeningSelect(e.target.value)}
            className="w-full max-w-md px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-800"
          >
            <option value="">Select an opening...</option>
            {allOpenings.map((o, idx) => (
              <option key={idx} value={`${o.opening}-${o.side}`}>
                {o.opening} ({o.side}) - {o.win_rate}% win rate
              </option>
            ))}
          </select>

          {selectedOpening && (
            <div className="mt-6">
              {videosLoading ? (
                <p className="text-slate-500">Loading videos...</p>
              ) : videos && videos.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {videos.slice(0, 6).map((video) => (
                    <a
                      key={video.video_id}
                      href={video.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-white rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
                    >
                      <img
                        src={video.thumbnail}
                        alt={video.title}
                        className="w-full aspect-video object-cover"
                      />
                      <div className="p-3">
                        <p className="font-medium text-slate-800 text-sm line-clamp-2">{video.title}</p>
                        <p className="text-slate-500 text-xs mt-1">{video.channel_title}</p>
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500">No videos found for this opening.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
