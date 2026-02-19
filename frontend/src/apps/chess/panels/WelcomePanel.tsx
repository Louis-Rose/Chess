// Chess Welcome panel

import { useNavigate } from 'react-router-dom';
import { LineChart, Calendar, Hash, TrendingUp, Target } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useChessData } from '../contexts/ChessDataContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { LoadingProgress } from '../../../components/shared/LoadingProgress';

const LumnaLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 128 128" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="8" width="112" height="112" rx="20" fill="#16a34a"/>
    <rect x="32" y="64" width="16" height="40" rx="2" fill="white"/>
    <rect x="56" y="48" width="16" height="56" rx="2" fill="white"/>
    <rect x="80" y="32" width="16" height="72" rx="2" fill="white"/>
  </svg>
);

function LanguageToggle() {
  const { language, setLanguage } = useLanguage();
  return (
    <div className="relative flex bg-slate-700 rounded-md p-0.5">
      <div
        className="absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] bg-slate-500 rounded transition-transform duration-200"
        style={{ transform: language === 'en' ? 'translateX(0)' : 'translateX(100%)' }}
      />
      <button
        onClick={() => setLanguage('en')}
        className={`relative z-10 px-2 py-1 text-xs font-medium rounded transition-colors ${language === 'en' ? 'text-white' : 'text-slate-400'}`}
      >
        EN
      </button>
      <button
        onClick={() => setLanguage('fr')}
        className={`relative z-10 px-2 py-1 text-xs font-medium rounded transition-colors ${language === 'fr' ? 'text-white' : 'text-slate-400'}`}
      >
        FR
      </button>
    </div>
  );
}

// Card definitions - titleKey/descriptionKey are i18n keys resolved at render time
const CARDS: { id: string; path: string; icon: LucideIcon; hoverBorder: string; iconBg: string; titleKey: string; descriptionKey: string | null }[] = [
  {
    id: 'elo',
    path: '/chess/elo',
    icon: LineChart,
    hoverBorder: 'hover:border-blue-500',
    iconBg: 'bg-blue-600',
    titleKey: 'chess.eloTitle',
    descriptionKey: null,
  },
  {
    id: 'daily-volume',
    path: '/chess/daily-volume',
    icon: Calendar,
    hoverBorder: 'hover:border-green-500',
    iconBg: 'bg-green-600',
    titleKey: 'chess.dailyVolumeTitle',
    descriptionKey: null,
  },
  {
    id: 'game-number',
    path: '/chess/game-number',
    icon: Hash,
    hoverBorder: 'hover:border-amber-500',
    iconBg: 'bg-amber-600',
    titleKey: 'chess.bestGamesCardTitle',
    descriptionKey: null,
  },
  {
    id: 'streak',
    path: '/chess/streak',
    icon: TrendingUp,
    hoverBorder: 'hover:border-red-500',
    iconBg: 'bg-red-600',
    titleKey: 'chess.streaksCardTitle',
    descriptionKey: null,
  },
  {
    id: 'today',
    path: '/chess/today',
    icon: Target,
    hoverBorder: 'hover:border-purple-500',
    iconBg: 'bg-purple-600',
    titleKey: 'chess.todayTitle',
    descriptionKey: null,
  },
];

function CardContent({ icon: Icon, iconBg, title, description, exploreLabel }: {
  icon: LucideIcon;
  iconBg: string;
  title: string;
  description: string | null;
  exploreLabel: string;
}) {
  // Title-only card (like daily-volume) - icon absolute, title centered
  if (!description) {
    return (
      <>
        <div className={`absolute top-5 left-5 w-10 h-10 ${iconBg} rounded-lg flex items-center justify-center`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <h3 className="text-lg font-bold text-slate-100 select-text text-center text-balance pl-12 pr-2 py-4">{title}</h3>
        <span className="absolute top-3 right-4 text-xs text-slate-500">{exploreLabel}</span>
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
      {/* Top bar: logo centered, language toggle right */}
      <div className="relative flex items-center justify-center px-2 mb-2">
        <div className="flex items-center gap-2">
          <LumnaLogo className="w-8 h-8" />
          <span className="text-2xl font-bold text-white tracking-wide">LUMNA</span>
        </div>
        <div className="absolute right-2">
          <LanguageToggle />
        </div>
      </div>

      {/* Header */}
      <div className="text-center space-y-4">
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

        {error && <p className="text-red-500 bg-red-100 py-2 px-4 rounded inline-block">{error}</p>}
        {searchedUsername && (
          <LoadingProgress progress={progress} loading={loading} totalGames={data?.total_games}
            selectedTimeClass={selectedTimeClass} onTimeClassChange={handleTimeClassChange} />
        )}
      </div>

      {/* Welcome cards */}
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 mt-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-[5%] md:mx-auto">
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
                  exploreLabel={t('chess.explore')}
                />
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
