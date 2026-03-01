import { Loader2 } from 'lucide-react';
import { useChessData } from '../contexts/ChessDataContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { CardPageLayout } from '../components/CardPageLayout';
import { useTimePeriod } from '../hooks/useTimePeriod';
import { StreakSection } from './MyDataPanel';

export function StreakPage() {
  const { t } = useLanguage();
  const { data, loading } = useChessData();
  const { period, toggle } = useTimePeriod();

  if (!data && !loading) return <p className="text-slate-400 text-center mt-16">{t('chess.noData')}</p>;

  return (
    <CardPageLayout>
      {loading && !data ? (
        <div className="flex justify-center py-20"><Loader2 className="w-12 h-12 text-slate-400 animate-spin" /></div>
      ) : data ? (
        <StreakSection data={data} standalone action={toggle} period={period} />
      ) : null}
    </CardPageLayout>
  );
}
