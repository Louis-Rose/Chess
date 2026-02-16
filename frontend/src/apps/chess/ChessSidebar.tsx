// Chess app sidebar — onboarding screen

import { Link, NavLink } from 'react-router-dom';
import { Loader2, Search, Shield, ArrowRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { SidebarShell } from '../../components/SidebarShell';
import { useChessData } from './contexts/ChessDataContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { getChessPrefs } from './utils/constants';

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

interface ChessSidebarProps {
  onComplete: () => void;
}

export function ChessSidebar({ onComplete }: ChessSidebarProps) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const {
    data,
    myPlayerData,
    usernameInput,
    setUsernameInput,
    savedPlayers,
    showUsernameDropdown,
    setShowUsernameDropdown,
    dropdownRef,
    handleSelectSavedUsername,
    handleSubmit,
    loading,
  } = useChessData();

  // Show searched player if available, otherwise fall back to own data
  const displayData = data || myPlayerData;
  const savedChessUsername = getChessPrefs().chess_username;
  const cardLoaded = !!displayData?.player;

  return (
    <SidebarShell hideThemeToggle hideLanguageToggle fullWidth>
      {/* LUMNA Logo */}
      <Link
        to="/chess"
        className="flex items-center justify-center gap-3 px-2 pb-4 mb-2 border-b border-slate-700 hover:opacity-80 transition-opacity flex-shrink-0"
      >
        <LumnaLogo className="w-10 h-10 flex-shrink-0" />
        <span className="text-xl font-bold text-white tracking-wide">LUMNA</span>
      </Link>

      {/* Search Bar */}
      <div className="px-2 pb-3">
        <div ref={dropdownRef} className="relative">
        <form onSubmit={handleSubmit}>
          <div className="flex">
            <input
              type="text"
              placeholder="Chess.com username"
              className="bg-white text-slate-900 placeholder:text-slate-400 px-3 py-2 border border-slate-300 rounded-l-lg w-full text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              onFocus={() => savedPlayers.length > 0 && setShowUsernameDropdown(true)}
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 text-white px-3 py-2 rounded-r-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin w-4 h-4" /> : <Search className="w-4 h-4" />}
            </button>
          </div>
          {showUsernameDropdown && savedPlayers.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-300 rounded-lg shadow-lg z-50 max-h-48 overflow-auto">
              <div className="px-3 py-1.5 text-xs text-slate-500 border-b border-slate-200">Recent searches</div>
              {savedPlayers.map((player, idx) => {
                const isMe = savedChessUsername?.toLowerCase() === player.username.toLowerCase();
                return (
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
                    {isMe && <span className="text-xs text-slate-400">(me)</span>}
                  </button>
                );
              })}
            </div>
          )}
        </form>
        </div>
      </div>

      {/* Player Info */}
      <div className="px-2 pb-4">
        {displayData?.player ? (
          <div className="bg-white rounded-lg p-4 text-center">
            {displayData.player.avatar ? (
              <img src={displayData.player.avatar} alt="" className="w-16 h-16 rounded-full mx-auto mb-2" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 text-xl font-bold mx-auto mb-2">
                {displayData.player.username.charAt(0).toUpperCase()}
              </div>
            )}
            <p className="text-slate-800 font-semibold">{displayData.player.name || displayData.player.username}</p>
            <p className="text-slate-500 text-sm">@{displayData.player.username}</p>
            <p className="text-slate-400 text-xs mt-1">{displayData.player.followers} followers</p>
            <p className="text-slate-400 text-xs">
              Joined {new Date(displayData.player.joined * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
            <div className="mt-3 pt-3 border-t border-slate-200 text-xs text-slate-600 space-y-1">
              <p>Rapid: <span className="font-semibold text-slate-800">{displayData.total_rapid?.toLocaleString() || 0}</span> games</p>
              <p>Blitz: <span className="font-semibold text-slate-800">{displayData.total_blitz?.toLocaleString() || 0}</span> games</p>
            </div>
          </div>
        ) : (
          <>
            <div className="bg-slate-800 rounded-lg p-4 text-center">
              <div className="w-16 h-16 rounded-full bg-slate-600 mx-auto mb-2" />
              <p className="text-slate-500 font-semibold">&nbsp;</p>
              <p className="text-slate-500 text-sm">@username</p>
              <p className="text-slate-500 text-xs mt-1">-- followers</p>
              <p className="text-slate-500 text-xs">Joined --</p>
              <div className="mt-3 pt-3 border-t border-slate-600 text-xs text-slate-500 space-y-1">
                <p>Rapid: <span className="font-semibold">--</span> games</p>
                <p>Blitz: <span className="font-semibold">--</span> games</p>
              </div>
            </div>
            <div className="flex flex-col items-center gap-3 mt-4">
              <div className="w-px h-6 bg-slate-600" />
              <p className="text-slate-400 text-sm text-center">{t('chess.onboardingInstruction')}</p>
            </div>
          </>
        )}
      </div>

      {/* Language toggle + Continue — shown once card is loaded */}
      {cardLoaded && (
        <div className="px-2 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300 border-t border-slate-700 pt-4">
          <LanguageSlider />
          <button
            onClick={onComplete}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2"
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Admin Link - only visible to admins */}
      {user?.is_admin && (
        <div className="px-2 py-2 border-t border-slate-700 flex-shrink-0">
          <NavLink
            to="/chess/admin"
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
                isActive
                  ? 'bg-amber-600 text-white'
                  : 'text-amber-400 hover:bg-slate-800'
              }`
            }
          >
            <Shield className="w-5 h-5 flex-shrink-0" />
            <span>Admin</span>
          </NavLink>
        </div>
      )}

    </SidebarShell>
  );
}
