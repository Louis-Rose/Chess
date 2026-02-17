// Chess app sidebar — onboarding screen

import { useRef, useEffect, useState, useCallback } from 'react';
import { Loader2, Search, ArrowRight, Check, X } from 'lucide-react';
import { SidebarShell } from '../../components/SidebarShell';
import { useChessData } from './contexts/ChessDataContext';
import { useLanguage } from '../../contexts/LanguageContext';

// Custom LUMNA logo matching the favicon
const LumnaLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 128 128" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="8" width="112" height="112" rx="20" fill="#16a34a"/>
    <rect x="32" y="64" width="16" height="40" rx="2" fill="white"/>
    <rect x="56" y="48" width="16" height="56" rx="2" fill="white"/>
    <rect x="80" y="32" width="16" height="72" rx="2" fill="white"/>
  </svg>
);

// Sliding language toggle
function LanguageSlider() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="relative flex bg-slate-700 rounded-lg p-1">
      {/* Sliding background */}
      <div
        className="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-slate-500 rounded-md transition-transform duration-200 ease-in-out"
        style={{ transform: language === 'en' ? 'translateX(0)' : 'translateX(100%)' }}
      />
      <button
        onClick={() => setLanguage('en')}
        className={`relative z-10 flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
          language === 'en' ? 'text-white' : 'text-slate-400'
        }`}
      >
        English
      </button>
      <button
        onClick={() => setLanguage('fr')}
        className={`relative z-10 flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
          language === 'fr' ? 'text-white' : 'text-slate-400'
        }`}
      >
        Fran&ccedil;ais
      </button>
    </div>
  );
}

// Renders both EN/FR text overlapping; only the active language is visible.
// The container always takes the height of the taller text, preventing layout shifts.
function StableText({ tKey, className }: { tKey: string; className?: string }) {
  const { language, tAll } = useLanguage();
  const texts = tAll(tKey);
  return (
    <span className="grid">
      <span className={`col-start-1 row-start-1 ${className ?? ''} ${language === 'en' ? '' : 'invisible'}`}>{texts.en}</span>
      <span className={`col-start-1 row-start-1 ${className ?? ''} ${language === 'fr' ? '' : 'invisible'}`}>{texts.fr}</span>
    </span>
  );
}

interface ChessSidebarProps {
  onComplete: () => void;
}

// Debounced username existence check — returns status + player info when found
interface CheckResult {
  status: 'idle' | 'checking' | 'exists' | 'not_found';
  player: { username: string; avatar: string | null } | null;
}

function useUsernameCheck(username: string, savedPlayers: { username: string; avatar: string | null }[]): CheckResult {
  const [result, setResult] = useState<CheckResult>({ status: 'idle', player: null });
  const abortRef = useRef<AbortController | null>(null);

  const check = useCallback(async (name: string, signal: AbortSignal) => {
    try {
      const res = await fetch(`/api/chess-username-check?username=${encodeURIComponent(name)}`, { signal });
      if (signal.aborted) return;
      const json = await res.json();
      if (json.exists) {
        setResult({ status: 'exists', player: { username: json.username, avatar: json.avatar || null } });
      } else {
        setResult({ status: 'not_found', player: null });
      }
    } catch {
      if (!signal.aborted) setResult({ status: 'idle', player: null });
    }
  }, []);

  useEffect(() => {
    abortRef.current?.abort();
    const trimmed = username.trim().toLowerCase();

    if (trimmed.length < 3) { setResult({ status: 'idle', player: null }); return; }

    // Skip API call if it's a saved player (we know they exist)
    const saved = savedPlayers.find(p => p.username.toLowerCase() === trimmed);
    if (saved) {
      setResult({ status: 'exists', player: saved });
      return;
    }

    setResult({ status: 'checking', player: null });
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = setTimeout(() => check(trimmed, controller.signal), 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [username, savedPlayers, check]);

  return result;
}

export function ChessSidebar({ onComplete }: ChessSidebarProps) {
  const {
    playerInfo,
    playerInfoLoading,
    playerInfoError,
    usernameInput,
    setUsernameInput,
    savedPlayers,
    showUsernameDropdown,
    setShowUsernameDropdown,
    dropdownRef,
    handleSelectSavedUsername,
    handleSubmit,
    triggerFullFetch,
  } = useChessData();
  const { t } = useLanguage();
  const { status: usernameStatus, player: livePlayer } = useUsernameCheck(usernameInput, savedPlayers);

  const cardLoaded = !!playerInfo;
  const topRef = useRef<HTMLDivElement>(null);

  // Auto-show dropdown when a live player is found
  useEffect(() => {
    if (livePlayer) setShowUsernameDropdown(true);
  }, [livePlayer, setShowUsernameDropdown]);

  // Scroll back to top when player card loads
  useEffect(() => {
    if (cardLoaded) {
      topRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [cardLoaded]);

  return (
    <SidebarShell hideThemeToggle hideLanguageToggle fullWidth>
      {/* LUMNA Logo */}
      <div ref={topRef} />
      <a
        href="/chess"
        className="flex items-center justify-center gap-3 px-2 pb-4 mb-2 border-b border-slate-700 hover:opacity-80 transition-opacity flex-shrink-0"
      >
        <LumnaLogo className="w-10 h-10 md:w-14 md:h-14 flex-shrink-0" />
        <span className="text-xl md:text-3xl font-bold text-white tracking-wide">LUMNA</span>
      </a>

      {/* Instruction — only when no player loaded */}
      {!cardLoaded && (
        <div className="px-3 pb-3">
          <StableText tKey="chess.onboardingInstruction" className="text-slate-300 text-sm md:text-lg font-medium text-center block" />
          <div className="h-px bg-slate-700 mt-3" />
        </div>
      )}

      {/* Player Info */}
      <div className="px-3 pb-2">
        {playerInfo ? (
          <div className="bg-white rounded-lg p-4 md:p-6 text-center">
            {playerInfo.avatar ? (
              <img src={playerInfo.avatar} alt="" className="w-16 h-16 md:w-20 md:h-20 rounded-full mx-auto mb-2" />
            ) : (
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 text-xl md:text-2xl font-bold mx-auto mb-2">
                {playerInfo.username.charAt(0).toUpperCase()}
              </div>
            )}
            <p className="text-slate-800 font-semibold md:text-lg">{playerInfo.name || playerInfo.username}</p>
            <p className="text-slate-500 text-sm md:text-base">@{playerInfo.username}</p>
            <p className="text-slate-400 text-xs md:text-sm mt-1">{playerInfo.followers} followers</p>
            <p className="text-slate-400 text-xs md:text-sm">
              Joined {new Date(playerInfo.joined * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
            <div className="mt-3 pt-3 border-t border-slate-200 text-xs md:text-sm text-slate-600 space-y-1">
              <p>Rapid: {playerInfo.rapid_rating && <><span className="font-semibold text-slate-800">{playerInfo.rapid_rating}</span> elo</>}</p>
              <p>Blitz: {playerInfo.blitz_rating && <><span className="font-semibold text-slate-800">{playerInfo.blitz_rating}</span> elo</>}</p>
            </div>
          </div>
        ) : (
          <>
            <div className="bg-slate-800 rounded-lg p-4 md:p-6 text-center">
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-slate-600 mx-auto mb-2" />
              <p className="text-slate-500 font-semibold md:text-lg">&nbsp;</p>
              <p className="text-slate-500 text-sm md:text-base">@username</p>
              <p className="text-slate-500 text-xs md:text-sm mt-1">-- followers</p>
              <p className="text-slate-500 text-xs md:text-sm">Joined --</p>
              <div className="mt-3 pt-3 border-t border-slate-600 text-xs md:text-sm text-slate-500 space-y-1">
                <p>Rapid: <span className="font-semibold">--</span> elo · <span className="font-semibold">--</span> games</p>
                <p>Blitz: <span className="font-semibold">--</span> elo · <span className="font-semibold">--</span> games</p>
              </div>
            </div>
            <div className="h-px bg-slate-700 mt-4" />
          </>
        )}
      </div>

      {/* Search Bar */}
      <div className="px-3 pb-3">
        <div ref={dropdownRef} className="relative">
        <form onSubmit={handleSubmit}>
          <div className="h-5 flex items-end mb-0.5">
            {usernameStatus === 'checking' && (
              <p className="flex items-center gap-1.5 text-slate-400 text-xs"><Loader2 className="w-3 h-3 animate-spin" />Checking username...</p>
            )}
            {usernameStatus === 'exists' && (
              <p className="flex items-center gap-1.5 text-green-400 text-xs"><Check className="w-3 h-3" />Player found on Chess.com</p>
            )}
            {usernameStatus === 'not_found' && (
              <p className="flex items-center gap-1.5 text-red-400 text-xs"><X className="w-3 h-3" />Player not found on Chess.com</p>
            )}
          </div>
          <div className="flex">
            <input
              type="text"
              placeholder="Chess.com username"
              className="bg-white text-slate-900 placeholder:text-slate-400 px-3 py-2 md:py-3 md:px-4 border border-slate-300 rounded-l-lg w-full text-base md:text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              onFocus={() => (savedPlayers.length > 0 || livePlayer) && setShowUsernameDropdown(true)}
            />
            <button
              type="submit"
              disabled={playerInfoLoading}
              className="bg-blue-600 text-white px-3 py-2 md:px-4 md:py-3 rounded-r-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {playerInfoLoading ? <Loader2 className="animate-spin w-4 h-4" /> : <Search className="w-4 h-4" />}
            </button>
          </div>
          {showUsernameDropdown && (livePlayer || savedPlayers.length > 0) && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-300 rounded-lg shadow-lg z-50 max-h-48 overflow-auto">
              {livePlayer && !savedPlayers.some(p => p.username.toLowerCase() === livePlayer.username.toLowerCase()) && (
                <button
                  type="button"
                  onClick={() => handleSelectSavedUsername(livePlayer)}
                  className="w-full px-3 py-1.5 text-left text-slate-800 hover:bg-blue-50 flex items-center gap-2 text-sm border-b border-slate-200"
                >
                  {livePlayer.avatar ? (
                    <img src={livePlayer.avatar} alt="" className="w-5 h-5 rounded-full object-cover" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-slate-300 flex items-center justify-center text-slate-500 text-xs font-bold">
                      {livePlayer.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  {livePlayer.username}
                </button>
              )}
              {savedPlayers.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-xs text-slate-500 border-b border-slate-200">Recent searches</div>
                  {savedPlayers.map((player, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectSavedUsername(player)}
                      className="w-full px-3 py-1.5 text-left text-slate-800 hover:bg-blue-50 flex items-center gap-2 text-sm"
                    >
                      {player.avatar ? (
                        <img src={player.avatar} alt="" className="w-5 h-5 rounded-full object-cover" />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-slate-300 flex items-center justify-center text-slate-500 text-xs font-bold">
                          {player.username.charAt(0).toUpperCase()}
                        </div>
                      )}
                      {player.username}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </form>
        </div>
      </div>
      {playerInfoLoading && (
        <p className="px-3 pb-2 text-slate-400 text-xs md:text-sm text-center animate-pulse">
          {t('chess.fetchingData')}
        </p>
      )}
      {playerInfoError && (
        <p className="px-3 pb-2 text-red-400 text-xs md:text-sm text-center">
          {playerInfoError}
        </p>
      )}
      <div className="px-3 pb-3">
        <div className="h-px bg-slate-700" />
      </div>

      {/* Description */}
      <div className="px-3 pt-1">
        <StableText tKey="chess.onboardingDescription" className="text-slate-300 text-sm md:text-lg leading-relaxed text-center block" />
        <div className="h-px bg-slate-700 mt-4" />
      </div>

      {/* Language toggle + Continue — shown once card is loaded */}
      {cardLoaded && (
        <div className="px-3 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <LanguageSlider />
          <div className="h-px bg-slate-700" />
          <button
            onClick={() => { triggerFullFetch(); onComplete(); }}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2"
          >
            {t('chess.continue')}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}


    </SidebarShell>
  );
}
