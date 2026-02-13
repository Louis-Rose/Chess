import { useChessData } from '../contexts/ChessDataContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { LoadingProgress } from '../../../components/shared/LoadingProgress';
import { DailyVolumeSection } from './MyDataPanel';

export function DailyVolumePage() {
  const { t } = useLanguage();
  const { data, loading, progress, searchedUsername } = useChessData();

  if (loading && searchedUsername) return <LoadingProgress progress={progress} />;
  if (!data) return <p className="text-slate-400 text-center mt-16">{t('chess.noData')}</p>;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="max-w-4xl mx-auto mt-8 space-y-6">
        <DailyVolumeSection data={data} />
      </div>
    </div>
  );
}
