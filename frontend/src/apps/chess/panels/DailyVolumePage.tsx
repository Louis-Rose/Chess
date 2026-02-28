import { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useChessData } from '../contexts/ChessDataContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { CardPageLayout } from '../components/CardPageLayout';
import { useTimePeriod } from '../hooks/useTimePeriod';
import { DailyVolumeSection, aggregateDailyVolume } from './MyDataPanel';

export function DailyVolumePage() {
  const { t } = useLanguage();
  const { data, loading } = useChessData();
  const { period, setPeriod } = useTimePeriod();

  const filteredGames = useMemo(() => {
    if (!data) return 0;
    return aggregateDailyVolume(data, period).filteredGames;
  }, [data, period]);

  if (!data && !loading) return <p className="text-slate-400 text-center mt-16">{t('chess.noData')}</p>;

  return (
    <CardPageLayout totalGames={filteredGames}>
      {loading && !data ? (
        <div className="flex justify-center py-20"><Loader2 className="w-12 h-12 text-slate-400 animate-spin" /></div>
      ) : data ? (
        <DailyVolumeSection data={data} standalone period={period} onPeriodChange={setPeriod} />
      ) : null}
    </CardPageLayout>
  );
}
