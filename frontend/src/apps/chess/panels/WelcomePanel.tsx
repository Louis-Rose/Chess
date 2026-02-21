// Chess Welcome panel

import { useNavigate } from 'react-router-dom';
import { Calendar, TrendingUp, ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useChessData } from '../contexts/ChessDataContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { LoadingProgress } from '../../../components/shared/LoadingProgress';
import { EloGoalCard } from '../components/EloGoalCard';

// Card definitions - titleKey/descriptionKey are i18n keys resolved at render time
const CARDS: { id: string; path: string; icon: LucideIcon; hoverBorder: string; iconBg: string; titleKey: string; descriptionKey: string | null }[] = [
  // {
  //   id: 'elo',
  //   path: '/chess/elo',
  //   icon: LineChart,
  //   hoverBorder: 'hover:border-blue-500',
  //   iconBg: 'bg-blue-600',
  //   titleKey: 'chess.eloTitle',
  //   descriptionKey: null,
  // },
  {
    id: 'daily-volume',
    path: '/chess/daily-volume',
    icon: Calendar,
    hoverBorder: 'hover:border-green-500',
    iconBg: 'bg-green-600',
    titleKey: 'chess.dailyVolumeTitle',
    descriptionKey: null,
  },
  // {
  //   id: 'game-number',
  //   path: '/chess/game-number',
  //   icon: Hash,
  //   hoverBorder: 'hover:border-amber-500',
  //   iconBg: 'bg-amber-600',
  //   titleKey: 'chess.bestGamesCardTitle',
  //   descriptionKey: null,
  // },
  {
    id: 'streak',
    path: '/chess/streak',
    icon: TrendingUp,
    hoverBorder: 'hover:border-red-500',
    iconBg: 'bg-red-600',
    titleKey: 'chess.streaksCardTitle',
    descriptionKey: null,
  },
  // {
  //   id: 'breaks',
  //   path: '/chess/breaks',
  //   icon: Coffee,
  //   hoverBorder: 'hover:border-blue-500',
  //   iconBg: 'bg-blue-600',
  //   titleKey: 'chess.breaksCardTitle',
  //   descriptionKey: null,
  // },
  // {
  //   id: 'today',
  //   path: '/chess/today',
  //   icon: Target,
  //   hoverBorder: 'hover:border-purple-500',
  //   iconBg: 'bg-purple-600',
  //   titleKey: 'chess.todayTitle',
  //   descriptionKey: null,
  // },
];

function CardContent({ icon: Icon, iconBg, title, description }: {
  icon: LucideIcon;
  iconBg: string;
  title: string;
  description: string | null;
}) {
  // Title-only card (like daily-volume) - icon absolute, title centered
  if (!description) {
    return (
      <>
        <div className={`absolute top-5 left-5 w-10 h-10 ${iconBg} rounded-lg flex items-center justify-center`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <h3 className="text-lg font-bold text-slate-100 select-text text-center text-balance pl-12 pr-2 py-4">{title}</h3>
        <ChevronRight className="absolute top-3 right-3 w-5 h-5 text-slate-500" />
      </>
    );
  }

  // Standard card with icon + title header and description
  return (
    <>
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 ${iconBg} rounded-lg flex items-center justify-center`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <h3 className="text-lg font-bold text-slate-100 select-text">{title}</h3>
      </div>
      <p className="text-slate-400 text-sm select-text">{description}</p>
    </>
  );
}

export function WelcomePanel() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const {
    data,
    loading,
    error,
    progress,
    searchedUsername,
    selectedTimeClass,
    handleTimeClassChange,
    playerInfo,
  } = useChessData();

  return (
    <>
      {/* Header */}
      <div className="text-center space-y-4 -mt-1 pb-1">
        {/* Avatar placeholder while loading */}
        {loading && !data?.player && playerInfo && (
          <div className="flex justify-center">
            {playerInfo.avatar ? (
              <img src={playerInfo.avatar} alt="" className="w-16 h-16 rounded-full opacity-50" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-slate-700" />
            )}
          </div>
        )}

        <h1 className="text-lg font-bold text-slate-100">{t('chess.welcomeTitle')}</h1>
      </div>

      {/* Loading / status */}
      <div className="text-center">
        {error && <p className="text-red-500 bg-red-100 py-2 px-4 rounded inline-block">{error}</p>}
        {searchedUsername && (
          <LoadingProgress progress={progress} loading={loading} totalGames={data?.total_games}
            username={searchedUsername} selectedTimeClass={selectedTimeClass} onTimeClassChange={handleTimeClassChange} />
        )}
      </div>

      {/* Welcome cards */}
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 mt-2">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-[5%] md:mx-auto">
          <EloGoalCard />
          {CARDS.map((card) => {
            const title = t(card.titleKey);
            const description = card.descriptionKey ? t(card.descriptionKey) : null;
            const hasDescription = description !== null;

            return (
              <div
                key={card.id}
                onClick={() => navigate(card.path)}
                className={`${hasDescription ? '' : 'relative'} bg-slate-800 border border-slate-700 rounded-xl p-5 h-[120px] flex flex-col ${
                  hasDescription ? 'text-left' : 'items-center justify-center'
                } ${card.hoverBorder} transition-colors cursor-pointer`}
              >
                <CardContent
                  icon={card.icon}
                  iconBg={card.iconBg}
                  title={title}
                  description={description}
                />
              </div>
            );
          })}
        </div>
        <div className="border-t border-slate-700 mt-4" />
      </div>
    </>
  );
}
