// Chess Welcome panel

import { useNavigate } from 'react-router-dom';
import { BarChart3, Calendar, Hash, TrendingUp, ChevronDown, Search, Loader2 } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useChessData } from '../contexts/ChessDataContext';
import { LoginButton } from '../../../components/LoginButton';
import { LoadingProgress } from '../../../components/shared/LoadingProgress';

export function WelcomePanel() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
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

  // Not authenticated - show login prompt
  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center min-h-[70vh]">
        <h1 className="text-5xl font-bold text-slate-100 mt-16">Let's improve your chess rating !</h1>
        <div className="flex items-start pt-8">
          <img src="/favicon.svg" alt="" className="w-48 h-48 opacity-15" />
        </div>
        <div className="flex flex-col items-center flex-1 justify-end pb-8">
          <p className="text-xl text-slate-300 mb-3 text-center max-w-lg font-light tracking-wide">
            Analyze your Chess.com games.
          </p>
          <p className="text-xl text-slate-300 mb-10 text-center max-w-lg font-light tracking-wide">
            Get personalized insights to improve your play.
          </p>
          <LoginButton />
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Header with search */}
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold text-slate-100">Your Chess AI Assistant</h1>

        {/* First-time user: show search bar in main area */}
        {!myPlayerData && (
          <>
            <p className="text-xl text-slate-300 font-light">What is your Chess.com username?</p>
            <form onSubmit={handleSubmit} className="flex items-center justify-center gap-2">
              <div className="relative" ref={dropdownRef}>
                <div className="flex">
                  <input
                    type="text"
                    placeholder="Enter your chess.com username"
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
                    <div className="px-3 py-2 text-xs text-slate-500 border-b border-slate-200">Recent searches</div>
                    {savedPlayers.map((player, idx) => {
                      const isMe = user?.preferences?.chess_username?.toLowerCase() === player.username.toLowerCase();
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
                Fetch data
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
          <h2 className="text-2xl font-bold text-slate-100 mb-2">
            {myPlayerData?.player?.name || myPlayerData?.player?.username
              ? `Welcome back, ${myPlayerData.player.name || myPlayerData.player.username}!`
              : 'Welcome!'}
          </h2>
          <p className="text-slate-400">
            Explore these powerful analysis tools to improve your game:
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto">
          {/* My Data */}
          <button
            onClick={() => navigate('/chess/my-data')}
            className="bg-slate-800 border border-slate-700 rounded-xl p-5 hover:border-blue-500 transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-lg font-bold text-slate-100 select-text">My Data</h3>
            </div>
            <p className="text-slate-400 text-sm select-text">
              Track your Elo progression and today's session stats.
            </p>
          </button>

          {/* Games Per Day */}
          <button
            onClick={() => navigate('/chess/daily-volume')}
            className="bg-slate-800 border border-slate-700 rounded-xl p-5 hover:border-green-500 transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
                <Calendar className="w-5 h-5 text-white" />
              </div>
            </div>
            <h3 className="text-lg font-bold text-slate-100 select-text text-center text-balance">How many games per day should you play?</h3>
          </button>

          {/* Best Games */}
          <button
            onClick={() => navigate('/chess/game-number')}
            className="bg-slate-800 border border-slate-700 rounded-xl p-5 hover:border-amber-500 transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-amber-600 rounded-lg flex items-center justify-center">
                <Hash className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-lg font-bold text-slate-100 select-text">Best Games</h3>
            </div>
            <p className="text-slate-400 text-sm select-text">
              Which game of the day is your strongest? See your win rate by game number.
            </p>
          </button>

          {/* Streaks */}
          <button
            onClick={() => navigate('/chess/streak')}
            className="bg-slate-800 border border-slate-700 rounded-xl p-5 hover:border-red-500 transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-lg font-bold text-slate-100 select-text">Streaks</h3>
            </div>
            <p className="text-slate-400 text-sm select-text">
              Should you play another game after wins or losses? Data-driven streak analysis.
            </p>
          </button>
        </div>
      </div>
    </>
  );
}
