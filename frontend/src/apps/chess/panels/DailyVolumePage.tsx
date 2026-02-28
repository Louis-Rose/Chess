import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useChessData } from '../contexts/ChessDataContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { TimeClassToggle } from '../components/TimeClassToggle';
import { AnalyzedGamesBanner } from '../components/AnalyzedGamesBanner';
import { DailyVolumeSection, aggregateDailyVolume } from './MyDataPanel';
import type { TimePeriod } from '../components/TimePeriodToggle';

export function DailyVolumePage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { data, loading, selectedTimeClass, handleTimeClassChange } = useChessData();
  const [period, setPeriod] = useState<TimePeriod>('ALL');

  const filteredGames = useMemo(() => {
    if (!data) return 0;
    return aggregateDailyVolume(data, period).filteredGames;
  }, [data, period]);

  if (!data && !loading) return <p className="text-slate-400 text-center mt-16">{t('chess.noData')}</p>;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="max-w-4xl mx-auto -mt-1 space-y-2">

        <AnalyzedGamesBanner totalGames={filteredGames} />
        <div className="relative flex items-center justify-center">
          <button
            onClick={() => navigate('/chess')}
            className="absolute left-2 md:left-4 flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors text-base"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Previous</span>
          </button>
          <TimeClassToggle selected={selectedTimeClass} onChange={handleTimeClassChange} disabled={loading} />
        </div>
        <div className="border-t border-slate-700" />
        {loading && !data ? (
          <div className="flex justify-center py-20"><Loader2 className="w-12 h-12 text-slate-400 animate-spin" /></div>
        ) : data ? (
          <DailyVolumeSection data={data} standalone period={period} onPeriodChange={setPeriod} />
        ) : null}
      </div>
    </div>
  );
}
