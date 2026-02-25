import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';
import { useChessData } from '../contexts/ChessDataContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { TimeClassToggle } from '../components/TimeClassToggle';
import { DailyVolumeSection, aggregateDailyVolume } from './MyDataPanel';
import type { TimePeriod } from './MyDataPanel';

export function DailyVolumePage() {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const { data, loading, selectedTimeClass, handleTimeClassChange, searchedUsername } = useChessData();
  const [period, setPeriod] = useState<TimePeriod>('ALL');

  const filteredGames = useMemo(() => {
    if (!data) return 0;
    return aggregateDailyVolume(data, period).filteredGames;
  }, [data, period]);

  if (!data && !loading) return <p className="text-slate-400 text-center mt-16">{t('chess.noData')}</p>;

  const totalGames = data?.total_games ?? 0;
  const count = filteredGames.toLocaleString();
  const total = totalGames.toLocaleString();
  const plural = filteredGames !== 1 ? 's' : '';
  const usernameStr = searchedUsername ? (language === 'fr' ? ` de @${searchedUsername}` : ` of @${searchedUsername}`) : '';
  const analyzedText = period === 'ALL'
    ? t('chess.analyzedGames').replace('{username}', usernameStr).replace('{count}', count).replace(/\{plural\}/g, plural)
    : (language === 'fr'
      ? `${count} partie${plural} analysée${plural} sur ${total}${usernameStr}.`
      : `Analyzed ${count} game${plural} of ${total}${usernameStr}.`);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="max-w-4xl mx-auto mt-2 space-y-2">
        {data && (
          <div className="flex items-center justify-center py-1">
            <div className="relative flex items-center">
              <CheckCircle2 className="w-4 h-4 text-green-500 absolute -left-6" />
              <span className="text-slate-400 text-sm">{analyzedText}</span>
            </div>
          </div>
        )}
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
