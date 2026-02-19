// Loading progress indicator with real-time progress from SSE
// Permanent section: shows loading state or completed summary + time class toggle

import { Loader2, CheckCircle2 } from 'lucide-react';
import type { StreamProgress, TimeClass } from '../../apps/chess/utils/types';
import { TimeClassToggle } from '../../apps/chess/components/TimeClassToggle';

interface LoadingProgressProps {
  progress: StreamProgress | null;
  loading: boolean;
  totalGames?: number;
  username?: string;
  selectedTimeClass: TimeClass;
  onTimeClassChange: (tc: TimeClass) => void;
}

export const LoadingProgress = ({
  progress, loading, totalGames, username,
  selectedTimeClass, onTimeClassChange,
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
        <div className="flex items-center justify-center py-2">
          <div className="relative flex items-center">
            <Loader2 className="animate-spin w-5 h-5 text-blue-500 absolute -left-7" />
            <span className="text-slate-300">Loading...</span>
          </div>
        </div>
      );
    } else {
      statusContent = (
        <div className="flex items-center justify-center py-2">
          <div className="relative flex items-center">
            <Loader2 className="animate-spin w-5 h-5 text-blue-500 absolute -left-7" />
            <span className="text-slate-300">
              {formattedMonth
                ? `Fetching your ${isMobile ? '' : 'chess.com '}games from ${formattedMonth}...`
                : `Fetching your ${isMobile ? '' : 'chess.com '}games...`}
            </span>
          </div>
        </div>
      );
    }
  } else {
    statusContent = (
      <div className="flex items-center justify-center py-2">
        <div className="relative flex items-center">
          <CheckCircle2 className="w-5 h-5 text-green-500 absolute -left-7" />
          <span className="text-slate-400">
            Analyzed {username ? `@${username}'s ` : ''}{totalGames?.toLocaleString() ?? 0} game{totalGames !== 1 ? 's' : ''}.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="border-t border-slate-700" />
      {statusContent}
      <div className="border-t border-slate-700" />
      <div className="flex justify-center pt-2">
        <TimeClassToggle selected={selectedTimeClass} onChange={onTimeClassChange} />
      </div>
    </div>
  );
};
