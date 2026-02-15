// Chess Welcome panel

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { LineChart, Calendar, Hash, TrendingUp, Target, ChevronDown, Search, Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useChessData } from '../contexts/ChessDataContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { LoadingProgress } from '../../../components/shared/LoadingProgress';
import { getChessPrefs } from '../utils/constants';

// Card definitions - titleKey/descriptionKey are i18n keys resolved at render time
const CARDS = {
  'elo': {
    path: '/chess/elo',
    icon: LineChart,
    hoverBorder: 'hover:border-blue-500',
    iconBg: 'bg-blue-600',
    titleKey: 'chess.eloTitle',
    descriptionKey: 'chess.eloDescription',
  },
  'today': {
    path: '/chess/today',
    icon: Target,
    hoverBorder: 'hover:border-purple-500',
    iconBg: 'bg-purple-600',
    titleKey: 'chess.todayTitle',
    descriptionKey: null,
  },
  'daily-volume': {
    path: '/chess/daily-volume',
    icon: Calendar,
    hoverBorder: 'hover:border-green-500',
    iconBg: 'bg-green-600',
    titleKey: 'chess.dailyVolumeTitle',
    descriptionKey: null,
  },
  'game-number': {
    path: '/chess/game-number',
    icon: Hash,
    hoverBorder: 'hover:border-amber-500',
    iconBg: 'bg-amber-600',
    titleKey: 'chess.bestGamesTitle',
    descriptionKey: 'chess.bestGamesDescription',
  },
  'streak': {
    path: '/chess/streak',
    icon: TrendingUp,
    hoverBorder: 'hover:border-red-500',
    iconBg: 'bg-red-600',
    titleKey: 'chess.streaksCardTitle',
    descriptionKey: 'chess.streaksDescription',
  },
} as const;

type CardId = keyof typeof CARDS;
const ALL_CARD_IDS: CardId[] = ['elo', 'today', 'daily-volume', 'game-number', 'streak'];
const GRID_SIZE = 6;
type GridSlot = CardId | null;
const DEFAULT_GRID: GridSlot[] = [...ALL_CARD_IDS, null, null];

const STORAGE_KEY = 'chess-card-order';

function loadGridOrder(): GridSlot[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [...DEFAULT_GRID];
    const parsed: GridSlot[] = JSON.parse(saved);
    // Validate
    const valid: GridSlot[] = parsed.map(s =>
      s === null || ALL_CARD_IDS.includes(s as CardId) ? s : null
    );
    while (valid.length < GRID_SIZE) valid.push(null);
    // Ensure all cards present
    const present = valid.filter((s): s is CardId => s !== null);
    const missing = ALL_CARD_IDS.filter(id => !present.includes(id));
    for (const card of missing) {
      const emptyIdx = valid.findIndex(s => s === null);
      if (emptyIdx !== -1) valid[emptyIdx] = card;
    }
    return valid.slice(0, GRID_SIZE);
  } catch {
    return [...DEFAULT_GRID];
  }
}

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
        <h3 className="text-lg font-bold text-slate-100 select-text text-center text-balance px-2 py-4">{title}</h3>
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
    usernameInput,
    setUsernameInput,
    loading,
    error,
    progress,
    myPlayerData,
    savedPlayers,
    showUsernameDropdown,
    setShowUsernameDropdown,
    dropdownRef,
    handleSelectSavedUsername,
    handleSubmit,
    searchedUsername,
  } = useChessData();

  // Grid state
  const [gridSlots, setGridSlots] = useState<GridSlot[]>(loadGridOrder);
  const [draggedCardId, setDraggedCardId] = useState<CardId | null>(null);
  const [dragOverSlotIndex, setDragOverSlotIndex] = useState<number | null>(null);
  const dragNodeRef = useRef<HTMLDivElement | null>(null);

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(gridSlots));
  }, [gridSlots]);

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, cardId: CardId, node: HTMLDivElement) => {
    setDraggedCardId(cardId);
    dragNodeRef.current = node;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', cardId);
    setTimeout(() => {
      if (dragNodeRef.current) dragNodeRef.current.style.opacity = '0.4';
    }, 0);
  };

  const handleDragEnd = () => {
    if (dragNodeRef.current) dragNodeRef.current.style.opacity = '1';
    setDraggedCardId(null);
    setDragOverSlotIndex(null);
    dragNodeRef.current = null;
  };

  const handleSlotDragOver = (e: React.DragEvent, slotIndex: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverSlotIndex !== slotIndex) setDragOverSlotIndex(slotIndex);
  };

  const handleSlotDrop = (e: React.DragEvent, targetSlotIndex: number) => {
    e.preventDefault();
    const draggedId = draggedCardId;
    handleDragEnd();
    if (draggedId === null) return;
    const draggedSlotIndex = gridSlots.findIndex(slot => slot === draggedId);
    if (draggedSlotIndex === -1 || draggedSlotIndex === targetSlotIndex) return;
    const newSlots = [...gridSlots];
    [newSlots[draggedSlotIndex], newSlots[targetSlotIndex]] = [newSlots[targetSlotIndex], newSlots[draggedSlotIndex]];
    setGridSlots(newSlots);
  };

  // Render a slot
  const renderSlot = (slotIndex: number) => {
    const cardId = gridSlots[slotIndex];
    const isDragOver = dragOverSlotIndex === slotIndex;

    // Empty slot
    if (cardId === null) {
      return (
        <div
          key={`empty-${slotIndex}`}
          className={`rounded-xl border-2 border-dashed h-[160px] transition-colors ${
            isDragOver ? 'border-blue-500 bg-slate-700/50' : 'border-slate-700'
          }`}
          onDragOver={(e) => handleSlotDragOver(e, slotIndex)}
          onDragLeave={() => setDragOverSlotIndex(null)}
          onDrop={(e) => handleSlotDrop(e, slotIndex)}
        />
      );
    }

    const card = CARDS[cardId];
    const isDragging = draggedCardId === cardId;
    const title = t(card.titleKey);
    const description = card.descriptionKey ? t(card.descriptionKey) : null;
    const hasDescription = description !== null;

    return (
      <div
        key={cardId}
        ref={node => { if (isDragging && node) dragNodeRef.current = node; }}
        draggable
        onDragStart={(e) => handleDragStart(e, cardId, e.currentTarget as HTMLDivElement)}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => handleSlotDragOver(e, slotIndex)}
        onDragLeave={() => setDragOverSlotIndex(null)}
        onDrop={(e) => handleSlotDrop(e, slotIndex)}
        onClick={() => navigate(card.path)}
        className={`${hasDescription ? '' : 'relative'} bg-slate-800 border border-slate-700 rounded-xl p-5 h-[160px] flex flex-col ${
          hasDescription ? 'text-left' : 'items-center justify-center'
        } ${card.hoverBorder} transition-colors cursor-pointer ${
          isDragOver ? 'ring-2 ring-blue-500' : ''
        }`}
      >
        <CardContent
          icon={card.icon}
          iconBg={card.iconBg}
          title={title}
          description={description}
        />
      </div>
    );
  };

  const savedChessUsername = getChessPrefs().chess_username;

  return (
    <>
      {/* Header with search */}
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold text-slate-100">{t('chess.welcomeTitle')}</h1>

        {/* First-time user: show search bar in main area */}
        {!myPlayerData && (
          <>
            <p className="text-xl text-slate-300 font-light">{t('chess.usernamePrompt')}</p>
            <form onSubmit={handleSubmit} className="flex items-center justify-center gap-2">
              <div className="relative" ref={dropdownRef}>
                <div className="flex">
                  <input
                    type="text"
                    placeholder={t('chess.usernamePlaceholder')}
                    className="bg-white text-slate-900 placeholder:text-slate-400 px-4 py-3 border border-slate-300 rounded-l-lg w-80 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    onFocus={() => savedPlayers.length > 0 && setShowUsernameDropdown(true)}
                  />
                  {savedPlayers.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowUsernameDropdown(!showUsernameDropdown)}
                      className="bg-white border border-l-0 border-slate-300 rounded-r-lg px-3 hover:bg-slate-50"
                    >
                      <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${showUsernameDropdown ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                  {savedPlayers.length === 0 && (
                    <div className="w-0 border-r border-slate-300 rounded-r-lg" />
                  )}
                </div>
                {/* Dropdown */}
                {showUsernameDropdown && savedPlayers.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-300 rounded-lg shadow-lg z-50 max-h-60 overflow-auto">
                    <div className="px-3 py-2 text-xs text-slate-500 border-b border-slate-200">{t('chess.recentSearches')}</div>
                    {savedPlayers.map((player, idx) => {
                      const isMe = savedChessUsername?.toLowerCase() === player.username.toLowerCase();
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSelectSavedUsername(player)}
                          className="w-full px-3 py-2 text-left text-slate-800 hover:bg-blue-50 flex items-center gap-2"
                        >
                          {player.avatar ? (
                            <img src={player.avatar} alt="" className="w-6 h-6 rounded-full object-cover" />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-slate-300 flex items-center justify-center text-slate-500 text-xs font-bold">
                              {player.username.charAt(0).toUpperCase()}
                            </div>
                          )}
                          {player.username}
                          {isMe && <span className="text-sm"> (me)</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <button
                type="submit"
                disabled={loading}
                className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? <Loader2 className="animate-spin w-4 h-4" /> : <Search className="w-4 h-4" />}
                {t('chess.fetchData')}
              </button>
            </form>
          </>
        )}

        {error && <p className="text-red-500 bg-red-100 py-2 px-4 rounded inline-block">{error}</p>}
        {loading && searchedUsername && <LoadingProgress progress={progress} />}
      </div>

      {/* Welcome cards */}
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 mt-8">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-slate-100">
            {myPlayerData?.player?.name || myPlayerData?.player?.username
              ? t('chess.welcomeBack').replace('{name}', myPlayerData.player.name || myPlayerData.player.username)
              : t('chess.welcome')}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
          {gridSlots.map((_, index) => renderSlot(index))}
        </div>
      </div>
    </>
  );
}
