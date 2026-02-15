// Chess app sidebar with navigation

// import { useState, useEffect, useRef } from 'react'; // needed for app switcher
import { Link, NavLink } from 'react-router-dom';
import { Loader2, /* ChevronDown, */ Search, Shield } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { UserMenu } from '../../components/UserMenu';
import { SidebarShell } from '../../components/SidebarShell';
import { useChessData } from './contexts/ChessDataContext';
import { LoginButton } from '../../components/LoginButton';

// Custom LUMNA logo matching the favicon
const LumnaLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 128 128" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="8" width="112" height="112" rx="20" fill="#16a34a"/>
    <rect x="32" y="64" width="16" height="40" rx="2" fill="white"/>
    <rect x="56" y="48" width="16" height="56" rx="2" fill="white"/>
    <rect x="80" y="32" width="16" height="72" rx="2" fill="white"/>
  </svg>
);


export function ChessSidebar() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const {
    data,
    myPlayerData,
    selectedTimeClass,
    handleTimeClassChange,
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
  const { user } = useAuth();

  // App switcher state - commented out, may re-enable later
  // const [showAppSwitcher, setShowAppSwitcher] = useState(false);
  // const [switcherPos, setSwitcherPos] = useState<{ top: number; left: number; width: number } | null>(null);
  // const appSwitcherRef = useRef<HTMLDivElement>(null);
  // const appSwitcherBtnRef = useRef<HTMLButtonElement>(null);

  // useEffect(() => {
  //   const handleClickOutside = (event: MouseEvent) => {
  //     if (appSwitcherRef.current && !appSwitcherRef.current.contains(event.target as Node)) {
  //       setShowAppSwitcher(false);
  //     }
  //   };
  //   document.addEventListener('mousedown', handleClickOutside);
  //   return () => document.removeEventListener('mousedown', handleClickOutside);
  // }, []);

  // useEffect(() => {
  //   if (showAppSwitcher && appSwitcherBtnRef.current) {
  //     const rect = appSwitcherBtnRef.current.getBoundingClientRect();
  //     setSwitcherPos({ top: rect.top, left: rect.right + 8, width: rect.width });
  //   }
  // }, [showAppSwitcher]);

  return (
    <SidebarShell hideThemeToggle>
      {/* LUMNA Logo */}
      <Link
        to="/chess"
        className="flex items-center justify-center gap-3 px-2 pb-4 mb-2 border-b border-slate-700 hover:opacity-80 transition-opacity flex-shrink-0"
      >
        <LumnaLogo className="w-10 h-10 flex-shrink-0" />
        <span className="text-xl font-bold text-white tracking-wide">LUMNA</span>
      </Link>

      {/* User Menu */}
      <div className="flex justify-center items-center px-2 pb-4 border-b border-slate-700 flex-shrink-0 min-h-[64px]">
        {authLoading ? (
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        ) : isAuthenticated ? (
          <UserMenu />
        ) : (
          <LoginButton />
        )}
      </div>

      {/* App Switcher - commented out, may re-enable later */}
      {/* <div className="px-2 pb-4 border-b border-slate-700" ref={appSwitcherRef}>
        <button
          ref={appSwitcherBtnRef}
          onClick={() => setShowAppSwitcher(!showAppSwitcher)}
          className="w-full bg-blue-900/30 hover:bg-blue-900/50 rounded-lg p-3 transition-colors"
        >
          <div className="flex items-center justify-center gap-2">
            <span className="text-2xl">♞</span>
            <p className="text-blue-400 font-semibold">Chess</p>
            <ChevronDown className={`w-4 h-4 text-blue-400 transition-transform ${showAppSwitcher ? 'rotate-180' : ''}`} />
          </div>
        </button>
        {showAppSwitcher && switcherPos && (
          <div
            className="fixed bg-slate-700 border border-slate-600 rounded-lg shadow-lg z-50 overflow-hidden"
            style={{ top: switcherPos.top, left: switcherPos.left, width: switcherPos.width }}
          >
            <Link
              to="/investing"
              onClick={() => setShowAppSwitcher(false)}
              className="flex items-center justify-center gap-2 px-5 py-3 hover:bg-slate-600 transition-colors"
            >
              <span className="text-2xl">📈</span>
              <p className="text-slate-200 font-medium">Investing</p>
            </Link>
          </div>
        )}
      </div> */}

      {/* Search Bar */}
      <div className="px-2 pb-3">
        <div ref={dropdownRef} className="relative">
        <form onSubmit={handleSubmit}>
          <div className="flex">
            <input
              type="text"
              placeholder="Chess.com username"
              className="bg-white text-slate-900 placeholder:text-slate-400 px-3 py-2 border border-slate-300 rounded-l-lg w-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                const isMe = user?.preferences?.chess_username?.toLowerCase() === player.username.toLowerCase();
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
      <div className="px-2 pb-4 border-b border-slate-700">
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
        )}
      </div>

      {/* Game Type */}
      <div className="px-2 pb-4 border-b border-slate-700">
        <div className="bg-white rounded-lg p-3">
          <label className="block text-slate-600 text-xs font-medium mb-2 text-center">Game Type</label>
          <select
            value={selectedTimeClass}
            onChange={(e) => handleTimeClassChange(e.target.value as 'rapid' | 'blitz')}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="rapid">Rapid</option>
            <option value="blitz">Blitz</option>
          </select>
        </div>
      </div>

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
