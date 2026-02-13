import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useChessData } from '../contexts/ChessDataContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { LoadingProgress } from '../../../components/shared/LoadingProgress';
import { StreakSection } from './MyDataPanel';

export function StreakPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { data, loading, progress, searchedUsername } = useChessData();

  if (loading && searchedUsername) return <LoadingProgress progress={progress} />;
  if (!data) return <p className="text-slate-400 text-center mt-16">{t('chess.noData')}</p>;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="max-w-4xl mx-auto mt-8 space-y-6">
        <button
          onClick={() => navigate('/chess')}
          className="flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors text-base -ml-1"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Previous</span>
        </button>
        <StreakSection data={data} standalone />
      </div>
    </div>
  );
}
