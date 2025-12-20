// Loading progress indicator with real-time progress from SSE

import { Loader2 } from 'lucide-react';
import type { StreamProgress } from '../../apps/chess/utils/types';

interface LoadingProgressProps {
  progress: StreamProgress | null;
}

export const LoadingProgress = ({ progress }: LoadingProgressProps) => {
  // Format month from "2024-01" to "January 2024"
  const formatProgressMonth = (month: string) => {
    if (!month) return null;
    const [year, monthNum] = month.split('-');
    const date = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
    const monthName = date.toLocaleString('en-US', { month: 'long' });
    return `${monthName} ${year}`;
  };

  // Handle cached data - show brief loading message
  if (progress?.cached) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <Loader2 className="animate-spin w-10 h-10 text-blue-500" />
        <div className="text-slate-300 text-lg">Loading...</div>
      </div>
    );
  }

  const percentage = progress && progress.total > 0 ? (progress.current / progress.total) * 100 : 0;
  const formattedMonth = formatProgressMonth(progress?.month || '');

  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <Loader2 className="animate-spin w-10 h-10 text-blue-500" />
      <div className="text-slate-300 text-lg">
        {formattedMonth ? `Fetching data from ${formattedMonth}...` : 'Fetching data from...'}
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
};
