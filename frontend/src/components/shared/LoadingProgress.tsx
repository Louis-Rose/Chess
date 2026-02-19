// Loading progress indicator with real-time progress from SSE
// Permanent section: shows loading state or completed summary + time class toggle

import { Loader2, CheckCircle2 } from 'lucide-react';
import type { StreamProgress, TimeClass } from '../../apps/chess/utils/types';
import { TimeClassToggle } from '../../apps/chess/components/TimeClassToggle';
import { useLanguage } from '../../contexts/LanguageContext';

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
  const { t, language } = useLanguage();

  // Format month from "2024-01" to localized month name + year
  const formatProgressMonth = (month: string) => {
    if (!month) return null;
    const [year, monthNum] = month.split('-');
    const date = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
    const locale = language === 'fr' ? 'fr-FR' : 'en-US';
    const monthName = date.toLocaleString(locale, { month: 'long' });
    return `${monthName} ${year}`;
  };

  const formattedMonth = formatProgressMonth(progress?.month || '');

  let statusContent;

  if (loading) {
    if (progress?.cached) {
      statusContent = (
        <div className="flex items-center justify-center py-2">
          <div className="relative flex items-center">
            <Loader2 className="animate-spin w-5 h-5 text-blue-500 absolute -left-7" />
            <span className="text-slate-300">{t('chess.loadingCached')}</span>
          </div>
        </div>
      );
    } else {
      const fetchingText = formattedMonth
        ? t('chess.fetchingGamesFrom').replace('{month}', formattedMonth)
        : t('chess.fetchingGames');
      statusContent = (
        <div className="flex items-center justify-center py-2">
          <div className="relative flex items-center">
            <Loader2 className="animate-spin w-5 h-5 text-blue-500 absolute -left-7" />
            <span className="text-slate-300">{fetchingText}</span>
          </div>
        </div>
      );
    }
  } else {
    const count = totalGames?.toLocaleString() ?? '0';
    const plural = totalGames !== 1 ? 's' : '';
    const usernameStr = username ? `@${username}` : '';
    const analyzedText = t('chess.analyzedGames')
      .replace('{username}', usernameStr)
      .replace('{count}', count)
      .replace(/\{plural\}/g, plural);
    statusContent = (
      <div className="flex items-center justify-center py-2">
        <div className="relative flex items-center">
          <CheckCircle2 className="w-5 h-5 text-green-500 absolute -left-7" />
          <span className="text-slate-400">{analyzedText}</span>
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
