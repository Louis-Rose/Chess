// Loading progress indicator with real-time progress from SSE
// Permanent section: shows loading state or completed summary

import { Loader2, CheckCircle2 } from 'lucide-react';
import type { StreamProgress } from '../../apps/chess/utils/types';

interface LoadingProgressProps {
  progress: StreamProgress | null;
  loading: boolean;
  totalGames?: number;
}

export const LoadingProgress = ({ progress, loading, totalGames }: LoadingProgressProps) => {
  // Format month from "2024-01" to "January 2024"
  const formatProgressMonth = (month: string) => {
    if (!month) return null;
    const [year, monthNum] = month.split('-');
    const date = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
    const monthName = date.toLocaleString('en-US', { month: 'long' });
    return `${monthName} ${year}`;
  };

  const percentage = progress && progress.total > 0 ? (progress.current / progress.total) * 100 : 0;
  const formattedMonth = formatProgressMonth(progress?.month || '');

  let content;

  if (loading) {
    if (progress?.cached) {
      // Cached data - brief loading
      content = (
        <div className="flex items-center justify-center gap-3 py-4">
          <Loader2 className="animate-spin w-5 h-5 text-blue-500" />
          <span className="text-slate-300">Loading...</span>
        </div>
      );
    } else {
      // Actively fetching archives
      content = (
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="flex items-center gap-3">
            <Loader2 className="animate-spin w-5 h-5 text-blue-500" />
            <span className="text-slate-300">
              {formattedMonth
                ? `Fetching your chess.com games from ${formattedMonth}...`
                : 'Fetching your chess.com games...'}
            </span>
          </div>
          {progress && progress.total > 0 && (
            <>
              <div className="w-64 h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <div className="text-slate-400 text-sm">
                {progress.current} / {progress.total} months processed
              </div>
            </>
          )}
        </div>
      );
    }
  } else {
    // Completed state
    content = (
      <div className="flex items-center justify-center gap-2 py-4">
        <CheckCircle2 className="w-5 h-5 text-green-500" />
        <span className="text-slate-400">
          Fetched and analyzed {totalGames?.toLocaleString() ?? 0} chess.com games.
        </span>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="border-t border-slate-700" />
      {content}
      <div className="border-t border-slate-700" />
    </div>
  );
};
