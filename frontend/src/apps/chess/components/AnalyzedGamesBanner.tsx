import { CheckCircle2 } from 'lucide-react';
import { useChessData } from '../contexts/ChessDataContext';
import { useLanguage } from '../../../contexts/LanguageContext';

export function AnalyzedGamesBanner({ totalGames }: { totalGames?: number }) {
  const { data, searchedUsername } = useChessData();
  const { t, language } = useLanguage();

  const count = totalGames ?? data?.total_games;
  if (count == null) return null;

  const countStr = count.toLocaleString();
  const plural = count !== 1 ? 's' : '';
  const usernameStr = searchedUsername ? (language === 'fr' ? ` de @${searchedUsername}` : ` of @${searchedUsername}`) : '';
  const text = t('chess.analyzedGames').replace('{username}', usernameStr).replace('{count}', countStr).replace(/\{plural\}/g, plural);

  return (
    <>
      <div className="border-t border-slate-700" />
      <div className="flex items-center justify-center py-2">
        <div className="relative flex items-center">
          <CheckCircle2 className="w-5 h-5 text-green-500 absolute -left-7" />
          <span className="text-slate-400">{text}</span>
        </div>
      </div>
      <div className="border-t border-slate-700" />
    </>
  );
}
