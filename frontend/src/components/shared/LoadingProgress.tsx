// Loading progress indicator with real-time progress from SSE
// Permanent section: shows loading state or completed summary + time class toggle

import { Loader2, CheckCircle2 } from 'lucide-react';
import type { StreamProgress, TimeClass } from '../../apps/chess/utils/types';

interface LoadingProgressProps {
  progress: StreamProgress | null;
  loading: boolean;
  totalGames?: number;
  selectedTimeClass: TimeClass;
  onTimeClassChange: (tc: TimeClass) => void;
  totalRapid?: number;
  totalBlitz?: number;
}

export const LoadingProgress = ({
  progress, loading, totalGames,
  selectedTimeClass, onTimeClassChange,
  totalRapid, totalBlitz,
}: LoadingProgressProps) => {
  // Format month from "2024-01" to "January 2024" (2-digit year on mobile)
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
  const formatProgressMonth = (month: string) => {
    if (!month) return null;
    const [year, monthNum] = month.split('-');
    const date = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
    const monthName = date.toLocaleString('en-US', { month: 'long' });
    return `${monthName} ${isMobile ? year.slice(2) : year}`;
  };

  const formattedMonth = formatProgressMonth(progress?.month || '');

  let statusContent;

  if (loading) {
    if (progress?.cached) {
      statusContent = (
        <div className="flex items-center justify-center gap-3 py-3">
          <Loader2 className="animate-spin w-5 h-5 text-blue-500" />
          <span className="text-slate-300">Loading...</span>
        </div>
      );
    } else {
      statusContent = (
        <div className="flex items-center justify-center gap-3 py-3">
          <Loader2 className="animate-spin w-5 h-5 text-blue-500" />
          <span className="text-slate-300">
            {formattedMonth
              ? `Fetching your ${isMobile ? '' : 'chess.com '}games from ${formattedMonth}...`
              : `Fetching your ${isMobile ? '' : 'chess.com '}games...`}
          </span>
        </div>
      );
    }
  } else {
    statusContent = (
      <div className="flex items-center justify-center gap-2 py-3">
        <CheckCircle2 className="w-5 h-5 text-green-500" />
        <span className="text-slate-400">
          Fetched and analyzed {totalGames?.toLocaleString() ?? 0} chess.com games.
        </span>
      </div>
    );
  }

  const rapidLabel = totalRapid != null ? `Rapid (${totalRapid.toLocaleString()})` : 'Rapid';
  const blitzLabel = totalBlitz != null ? `Blitz (${totalBlitz.toLocaleString()})` : 'Blitz';

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="border-t border-slate-700" />
      {statusContent}
      {/* Time class toggle */}
      <div className="flex justify-center pb-3">
        <div className="relative flex bg-slate-700 rounded-lg p-1">
          <div
            className="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-slate-500 rounded-md transition-transform duration-200 ease-in-out"
            style={{ transform: selectedTimeClass === 'rapid' ? 'translateX(0)' : 'translateX(100%)' }}
          />
          <button
            onClick={() => onTimeClassChange('rapid')}
            className={`relative z-10 flex-1 text-center px-5 py-1.5 text-sm font-medium rounded-md transition-colors ${
              selectedTimeClass === 'rapid' ? 'text-white' : 'text-slate-400'
            }`}
          >
            {rapidLabel}
          </button>
          <button
            onClick={() => onTimeClassChange('blitz')}
            className={`relative z-10 flex-1 text-center px-5 py-1.5 text-sm font-medium rounded-md transition-colors ${
              selectedTimeClass === 'blitz' ? 'text-white' : 'text-slate-400'
            }`}
          >
            {blitzLabel}
          </button>
        </div>
      </div>
      <div className="border-t border-slate-700" />
    </div>
  );
};
