import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine
} from 'recharts';
import { Search, Loader2, BarChart3, Trophy, Target, BookOpen, Swords, Crown, ChevronDown } from 'lucide-react';
import { useAuth } from './contexts/AuthContext';
import { LoginButton } from './components/LoginButton';
import { UserMenu } from './components/UserMenu';

type PanelType = 'my-data' | 'pros-tips' | 'weaknesses' | 'openings' | 'middle-game' | 'end-game';

// --- localStorage helpers for username history ---
const STORAGE_KEY = 'chess_stats_usernames';
const MAX_USERNAMES = 10;

interface SavedPlayer {
  username: string;
  avatar: string | null;
}

const getSavedPlayers = (): SavedPlayer[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    // Handle migration from old string[] format
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
      return parsed.map((u: string) => ({ username: u, avatar: null }));
    }
    return parsed;
  } catch {
    return [];
  }
};

const savePlayer = (username: string, avatar: string | null) => {
  try {
    const existing = getSavedPlayers();
    // Remove if already exists, then add to front
    const filtered = existing.filter(p => p.username.toLowerCase() !== username.toLowerCase());
    const updated = [{ username, avatar }, ...filtered].slice(0, MAX_USERNAMES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Ignore localStorage errors
  }
};

// Top 3 FIDE rated players (December 2024)
const TOP_FIDE_PLAYERS = [
  { name: 'Magnus Carlsen', country: 'Norway', rating: 2831 },
  { name: 'Fabiano Caruana', country: 'USA', rating: 2805 },
  { name: 'Hikaru Nakamura', country: 'USA', rating: 2802 },
];

// --- Types ---
interface PlayerData {
  name: string;
  username: string;
  avatar: string | null;
  followers: number;
  joined: number; // Unix timestamp
}

interface HistoryData {
  year: number;
  week: number;
  games_played: number;
}

interface EloData {
  year: number;
  week: number;
  elo: number;
}

interface OpeningData {
  opening: string;
  games: number;
  win_rate: number;
  ci_lower: number;
  ci_upper: number;
}

interface GameNumberStats {
  game_number: number;
  win_rate: number;
  sample_size: number;
}

interface FatigueInsight {
  type: 'warning' | 'positive' | 'info';
  title: string;
  message: string;
  recommendation: string;
}

interface FatigueAnalysis {
  sample_size: number;
  error?: string;
  baseline_win_rate?: number;
  best_game_number?: number;
  best_win_rate?: number;
  worst_game_number?: number;
  worst_win_rate?: number;
  insights?: FatigueInsight[];
}

interface ApiResponse {
  player: PlayerData;
  time_class: string;
  history: HistoryData[];
  elo_history: EloData[];
  total_games: number;
  total_rapid: number;
  total_blitz: number;
  openings: {
    white: OpeningData[];
    black: OpeningData[];
  };
  game_number_stats: GameNumberStats[];
}

type TimeClass = 'rapid' | 'blitz';

// SSE streaming types
interface StreamProgress {
  current: number;
  total: number;
  month: string;  // e.g., "2024-01"
}

interface VideoData {
  video_id: string;
  title: string;
  channel_title: string;
  thumbnail: string;
  channel_thumbnail: string;
  published_at: string;
  view_count: number;
  subscriber_count: number;
  url: string;
}

// --- Shared Helpers ---
const formatMonth = (date: Date) => {
  const fullMonth = date.toLocaleString('en-US', { month: 'long' });
  // 3-letter months (May): no period
  // 4-letter months (June, July): show all 4 letters, no period
  // Others: 3-letter abbreviation with period
  if (fullMonth.length <= 3) return fullMonth;
  if (fullMonth.length === 4) return fullMonth;
  return fullMonth.slice(0, 3) + '.';
};

const formatNumber = (num: number) => {
  // European formatting with space as thousand separator
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

const formatJoinedDate = (timestamp: number) => {
  const date = new Date(timestamp * 1000);
  const month = formatMonth(date);
  const day = date.getDate();
  const year = date.getFullYear();
  return `${month} ${day}, ${year}`;
};

const getBarColor = (winRate: number) => {
  if (winRate >= 55) return "#4ade80"; // Green
  if (winRate >= 45) return "#facc15"; // Yellow
  return "#f87171"; // Red
};

// Helper to format ISO week to "Aug. W2" (week of month based on first Monday)
const formatWeekYear = (year: number, isoWeek: number) => {
  // Get the Monday of this ISO week
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const firstMonday = new Date(jan4);
  firstMonday.setDate(jan4.getDate() - dayOfWeek + 1);

  const weekMonday = new Date(firstMonday);
  weekMonday.setDate(firstMonday.getDate() + (isoWeek - 1) * 7);

  // Get month name using our formatter
  const monthName = formatMonth(weekMonday);

  // Find the first Monday of this month
  const firstOfMonth = new Date(weekMonday.getFullYear(), weekMonday.getMonth(), 1);
  const firstMondayOfMonth = new Date(firstOfMonth);
  const dow = firstOfMonth.getDay();
  const daysUntilMonday = dow === 0 ? 1 : (dow === 1 ? 0 : 8 - dow);
  firstMondayOfMonth.setDate(1 + daysUntilMonday);

  // Calculate week of month
  const diffDays = Math.floor((weekMonday.getTime() - firstMondayOfMonth.getTime()) / (1000 * 60 * 60 * 24));
  const weekOfMonth = Math.floor(diffDays / 7) + 1;

  const yearShort = weekMonday.getFullYear().toString().slice(-2);
  return `W${weekOfMonth} ${monthName} ${yearShort}`;
};

// --- API fetch functions ---
const fetchYouTubeVideos = async (opening: string, side: string): Promise<VideoData[]> => {
  const response = await axios.get(`/api/youtube-videos?opening=${encodeURIComponent(opening)}&side=${encodeURIComponent(side)}`);
  return response.data.videos;
};

const fetchProTipsVideos = async (playerName: string): Promise<VideoData[]> => {
  const query = `${playerName} chess how to improve tips`;
  const response = await axios.get(`/api/youtube-videos?opening=${encodeURIComponent(query)}&side=tips`);
  return response.data.videos;
};

const fetchFatigueAnalysis = async (username: string, timeClass: TimeClass): Promise<FatigueAnalysis> => {
  const response = await axios.get(`/api/fatigue-analysis?username=${username}&time_class=${timeClass}`);
  return response.data;
};

// Custom hook for streaming stats with real-time progress
function useStreamingStats(username: string, timeClass: TimeClass) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<StreamProgress | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchStats = useCallback(() => {
    if (!username) return;

    // Close any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setLoading(true);
    setError(null);
    setProgress(null);
    setData(null);

    const url = `/api/stats-stream?username=${encodeURIComponent(username)}&time_class=${timeClass}`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    let playerData: PlayerData | null = null;

    eventSource.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case 'player':
            playerData = message.player;
            break;

          case 'start':
            setProgress({ current: 0, total: message.total_archives, month: '' });
            break;

          case 'progress':
            setProgress({
              current: message.current,
              total: message.total,
              month: message.month
            });
            break;

          case 'processing':
            // Optional: could show "Processing..." state
            break;

          case 'complete':
            if (playerData) {
              setData({
                player: playerData,
                ...message.data
              });
            }
            setLoading(false);
            setProgress(null);
            eventSource.close();
            break;

          case 'error':
            setError(message.error);
            setLoading(false);
            eventSource.close();
            break;
        }
      } catch (e) {
        console.error('Error parsing SSE message:', e);
      }
    };

    eventSource.onerror = () => {
      setError('Connection lost. Please try again.');
      setLoading(false);
      eventSource.close();
    };
  }, [username, timeClass]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return { data, loading, error, progress, fetchStats };
}

function App() {
  // Auth
  const { user, isAuthenticated, isLoading: authLoading, updatePreferences } = useAuth();

  // UI state
  const [usernameInput, setUsernameInput] = useState('');
  const [searchedUsername, setSearchedUsername] = useState('');
  const [activePanel, setActivePanel] = useState<PanelType>('my-data');
  const [selectedOpening, setSelectedOpening] = useState<string>('');
  const [selectedTimeClass, setSelectedTimeClass] = useState<TimeClass>('rapid');
  const [selectedPro, setSelectedPro] = useState<string>('');

  // Username history
  const [savedPlayers, setSavedPlayers] = useState<SavedPlayer[]>([]);
  const [showUsernameDropdown, setShowUsernameDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load saved players on mount
  useEffect(() => {
    setSavedPlayers(getSavedPlayers());
  }, []);

  // Use saved preferences when user logs in - auto-load their data
  const hasAutoLoaded = useRef(false);
  const wasAuthenticated = useRef(false);

  useEffect(() => {
    // Handle logout - clear data
    if (wasAuthenticated.current && !isAuthenticated) {
      setSearchedUsername('');
      setUsernameInput('');
      hasAutoLoaded.current = false;
    }
    wasAuthenticated.current = isAuthenticated;

    // Handle login - auto-load user's data
    if (user?.preferences?.chess_username && !hasAutoLoaded.current) {
      setUsernameInput(user.preferences.chess_username);
      setSearchedUsername(user.preferences.chess_username);
      hasAutoLoaded.current = true;
    }
    if (user?.preferences?.preferred_time_class) {
      setSelectedTimeClass(user.preferences.preferred_time_class);
    }
  }, [user, isAuthenticated]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowUsernameDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Player stats with streaming progress
  const {
    data,
    loading,
    error: statsError,
    progress,
    fetchStats
  } = useStreamingStats(searchedUsername, selectedTimeClass);

  // YouTube videos query - cached by opening + side
  const [openingName, openingSide] = selectedOpening ? selectedOpening.split('-') : ['', ''];
  const {
    data: videos = [],
    isLoading: videosLoading,
    error: videosError,
  } = useQuery({
    queryKey: ['youtubeVideos', openingName, openingSide],
    queryFn: () => fetchYouTubeVideos(openingName, openingSide),
    enabled: !!selectedOpening, // Only fetch when an opening is selected
  });

  // Pro tips videos query - cached by pro player name
  const {
    data: proVideos = [],
    isLoading: proVideosLoading,
    error: proVideosError,
  } = useQuery({
    queryKey: ['proTipsVideos', selectedPro],
    queryFn: () => fetchProTipsVideos(selectedPro),
    enabled: !!selectedPro,
  });

  // Fatigue analysis query - manually triggered
  const [fatigueEnabled, setFatigueEnabled] = useState(false);
  const {
    data: fatigueAnalysis,
    isLoading: fatigueLoading,
    error: fatigueError,
    refetch: refetchFatigue,
  } = useQuery({
    queryKey: ['fatigueAnalysis', searchedUsername, selectedTimeClass],
    queryFn: () => fetchFatigueAnalysis(searchedUsername, selectedTimeClass),
    enabled: fatigueEnabled && !!searchedUsername,
  });

  const handleAnalyzeFatigue = () => {
    setFatigueEnabled(true);
    refetchFatigue();
  };

  const error = statsError || '';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (usernameInput.trim()) {
      const username = usernameInput.trim();
      setSearchedUsername(username);
      setShowUsernameDropdown(false);
    }
  };

  // Trigger fetch when username or time class changes
  useEffect(() => {
    if (searchedUsername) {
      fetchStats();
    }
  }, [searchedUsername, selectedTimeClass, fetchStats]);

  // Save player with avatar after successful fetch
  useEffect(() => {
    if (data?.player) {
      savePlayer(data.player.username, data.player.avatar);
      setSavedPlayers(getSavedPlayers());
      // Save to server preferences if logged in
      if (isAuthenticated && user?.preferences?.chess_username !== data.player.username) {
        updatePreferences({ chess_username: data.player.username });
      }
    }
  }, [data?.player, isAuthenticated]);

  const handleSelectSavedUsername = (player: SavedPlayer) => {
    setUsernameInput(player.username);
    setSearchedUsername(player.username);
    setShowUsernameDropdown(false);
  };

  const handleOpeningSelect = (value: string) => {
    setSelectedOpening(value);
  };

  const handleTimeClassChange = (newTimeClass: TimeClass) => {
    setSelectedTimeClass(newTimeClass);
  };

  // 1. Pre-process the history data to include the label directly
  // This fixes the "Index vs Data" mismatch ensuring 100% sync
  const processedHistory = data?.history.map(item => ({
    ...item,
    // Create a specific key for the X-Axis to use
    periodLabel: formatWeekYear(item.year, item.week)
  }));

  // 2. Pre-process the Elo history data
  const processedEloHistory = data?.elo_history.map(item => ({
    ...item,
    periodLabel: formatWeekYear(item.year, item.week)
  }));

  // 3. Get all openings for dropdown
  const allOpenings = data ? [
    ...data.openings.white.map(o => ({ ...o, side: 'White' as const })),
    ...data.openings.black.map(o => ({ ...o, side: 'Black' as const }))
  ] : [];

  return (
    <div className="min-h-screen bg-slate-800 font-sans text-slate-800 flex">
      {/* Sidebar */}
      <div className="w-64 bg-slate-900 min-h-screen p-4 flex flex-col gap-2">
        {isAuthenticated && (
          <div className="flex justify-center mb-4 px-2 pb-4 border-b border-slate-700">
            {authLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            ) : (
              <UserMenu />
            )}
          </div>
        )}

        {/* Player Info in Sidebar - only when logged in */}
        {isAuthenticated && data?.player && (
          <div className="px-2 pb-4 mb-2 border-b border-slate-700">
            <div className="bg-white rounded-lg p-4 text-center">
              {data.player.avatar ? (
                <img src={data.player.avatar} alt="" className="w-16 h-16 rounded-full mx-auto mb-2" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 text-xl font-bold mx-auto mb-2">
                  {data.player.username.charAt(0).toUpperCase()}
                </div>
              )}
              <p className="text-slate-800 font-semibold">{data.player.name || data.player.username}</p>
              <p className="text-slate-500 text-sm">@{data.player.username}</p>
              <p className="text-slate-400 text-xs mt-1">{data.player.followers} followers</p>
              <p className="text-slate-400 text-xs">
                Joined {new Date(data.player.joined * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
              <div className="mt-3 pt-3 border-t border-slate-200 text-xs text-slate-600 space-y-1">
                <p>Rapid: <span className="font-semibold text-slate-800">{data.total_rapid?.toLocaleString() || 0}</span> games</p>
                <p>Blitz: <span className="font-semibold text-slate-800">{data.total_blitz?.toLocaleString() || 0}</span> games</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1 px-2 pb-4 border-b border-slate-700">
        <button
          onClick={() => setActivePanel('my-data')}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
            activePanel === 'my-data'
              ? 'bg-blue-600 text-white'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <BarChart3 className="w-5 h-5" />
          My Data
        </button>

        <button
          onClick={() => setActivePanel('pros-tips')}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
            activePanel === 'pros-tips'
              ? 'bg-blue-600 text-white'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Trophy className="w-5 h-5" />
          How to Improve (from Pros)
        </button>

        <button
          onClick={() => setActivePanel('weaknesses')}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
            activePanel === 'weaknesses'
              ? 'bg-blue-600 text-white'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Target className="w-5 h-5" />
          Identify My Weaknesses
        </button>

        <button
          onClick={() => setActivePanel('openings')}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
            activePanel === 'openings'
              ? 'bg-blue-600 text-white'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <BookOpen className="w-5 h-5" />
          Openings
        </button>

        <button
          onClick={() => setActivePanel('middle-game')}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
            activePanel === 'middle-game'
              ? 'bg-blue-600 text-white'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Swords className="w-5 h-5" />
          Middle Game
        </button>

        <button
          onClick={() => setActivePanel('end-game')}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
            activePanel === 'end-game'
              ? 'bg-blue-600 text-white'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Crown className="w-5 h-5" />
          End Game
        </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-8 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-8">

          {/* Login prompt when not authenticated */}
          {!isAuthenticated && (
            <div className="flex flex-col items-center min-h-[70vh]" style={{ marginLeft: 'calc(-128px)' }}>
              <h1 className="text-5xl font-bold text-slate-100 mt-16">Let's improve your chess rating !</h1>
              <div className="flex items-start pt-8">
                <img src="/favicon.svg" alt="" className="w-48 h-48 opacity-15" />
              </div>
              <div className="flex flex-col items-center flex-1 justify-end pb-8">
                <p className="text-slate-400 mb-8 text-center max-w-md">
                  Sign in with your Google account to analyze your Chess.com games and get personalized insights.
                </p>
                <LoginButton />
              </div>
            </div>
          )}

          {/* Header with search - only when authenticated */}
          {isAuthenticated && (
            <div className="text-center space-y-6" style={{ marginLeft: 'calc(-128px)' }}>
              <h1 className="text-4xl font-bold text-slate-100">Your Chess AI Assistant</h1>

              <form onSubmit={handleSubmit} className="flex justify-center gap-2">
                <div className="relative" ref={dropdownRef}>
                  <div className="flex">
                    <input
                      type="text"
                      placeholder="Enter chess.com username"
                      className="bg-white text-slate-900 placeholder:text-slate-400 px-4 py-2 border border-slate-300 rounded-l-lg w-56 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={usernameInput}
                      onChange={(e) => setUsernameInput(e.target.value)}
                      onFocus={() => savedPlayers.length > 0 && setShowUsernameDropdown(true)}
                    />
                    {savedPlayers.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowUsernameDropdown(!showUsernameDropdown)}
                        className="bg-white border border-l-0 border-slate-300 rounded-r-lg px-2 hover:bg-slate-50"
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
                      {savedPlayers.map((player, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSelectSavedUsername(player)}
                          className="w-full px-3 py-2 text-left text-slate-800 hover:bg-blue-50 flex items-center gap-2"
                        >
                          {player.avatar ? (
                            <img
                              src={player.avatar}
                              alt=""
                              className="w-6 h-6 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-slate-300 flex items-center justify-center text-slate-500 text-xs font-bold">
                              {player.username.charAt(0).toUpperCase()}
                            </div>
                          )}
                          {player.username}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {loading ? <Loader2 className="animate-spin w-4 h-4" /> : <Search className="w-4 h-4" />}
                  Fetch data
                </button>
              </form>
              {error && <p className="text-red-500 bg-red-100 py-2 px-4 rounded inline-block">{error}</p>}
              {loading && searchedUsername && <LoadingProgress progress={progress} />}
            </div>
          )}

          {/* ========== HOW TO IMPROVE (FROM PROS) PANEL ========== */}
          {isAuthenticated && activePanel === 'pros-tips' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="flex justify-center mb-8 mt-20">
                <div className="h-1 w-[90%] bg-slate-100 rounded-full"></div>
              </div>

              
              <div className="flex justify-center mb-8 mt-12">
                <div className="h-1 w-[90%] bg-slate-100 rounded-full"></div>
              </div>

              <div className="flex flex-col items-center gap-4 mb-6">
                <h2 className="text-3xl font-bold text-slate-100 whitespace-nowrap">
                  How to Improve (from Pros)
                </h2>
              </div>

              <div className="bg-slate-100 border border-slate-300 p-6 rounded-xl shadow-sm max-w-2xl mx-auto">
                <label className="block text-slate-800 font-bold mb-3">Select a Top Player</label>
                <select
                  value={selectedPro}
                  onChange={(e) => setSelectedPro(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Choose a pro player --</option>
                  {TOP_FIDE_PLAYERS.map((player, idx) => (
                    <option key={idx} value={player.name}>
                      #{idx + 1} {player.name} ({player.country}) - {formatNumber(player.rating)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Pro Tips Videos Section */}
              {selectedPro && (
                <div className="mt-8">
                  <h3 className="text-2xl font-bold text-slate-100 text-center mb-6">
                    Tips from {selectedPro}
                  </h3>

                  {proVideosLoading && (
                    <div className="flex justify-center items-center py-12">
                      <Loader2 className="animate-spin w-8 h-8 text-slate-300" />
                      <span className="ml-3 text-slate-300">Loading videos...</span>
                    </div>
                  )}

                  {proVideosError && (
                    <div className="bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded-lg max-w-2xl mx-auto">
                      Failed to fetch videos. YouTube API may not be configured.
                    </div>
                  )}

                  {!proVideosLoading && !proVideosError && proVideos.length === 0 && (
                    <p className="text-slate-400 text-center italic">
                      No videos found for this player.
                    </p>
                  )}

                  {!proVideosLoading && proVideos.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
                      {proVideos.map((video) => (
                        <a
                          key={video.video_id}
                          href={video.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-slate-100 border border-slate-300 rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-shadow"
                        >
                          <img
                            src={video.thumbnail}
                            alt={video.title}
                            className="w-full h-40 object-cover"
                          />
                          <div className="p-4">
                            <h4 className="font-bold text-slate-800 text-sm line-clamp-2 mb-3">
                              {video.title}
                            </h4>
                            <div className="flex items-center gap-3">
                              {video.channel_thumbnail && (
                                <img
                                  src={video.channel_thumbnail}
                                  alt={video.channel_title}
                                  className="w-8 h-8 rounded-full"
                                />
                              )}
                              <div>
                                <p className="text-slate-700 text-sm font-medium">{video.channel_title}</p>
                                <div className="flex gap-3 text-xs text-slate-500">
                                  <span>{formatNumber(video.view_count)} views</span>
                                  <span>{formatNumber(video.subscriber_count)} subs</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-center mt-12">
                <div className="h-1 w-[90%] bg-slate-100 rounded-full"></div>
              </div>
            </div>
          )}

          {/* ========== IDENTIFY MY WEAKNESSES PANEL ========== */}
          {isAuthenticated && activePanel === 'weaknesses' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="flex justify-center mb-8 mt-20">
                <div className="h-1 w-[90%] bg-slate-100 rounded-full"></div>
              </div>

              
              <div className="flex justify-center mb-8 mt-12">
                <div className="h-1 w-[90%] bg-slate-100 rounded-full"></div>
              </div>

              <div className="flex flex-col items-center gap-4 mb-6">
                <h2 className="text-3xl font-bold text-slate-100 whitespace-nowrap">
                  Time Management Analysis
                </h2>
              </div>

              {!data ? (
                <div className="bg-slate-100 border border-slate-300 p-8 rounded-xl shadow-sm max-w-2xl mx-auto text-center">
                  <Target className="w-16 h-16 text-slate-400 mx-auto mb-4" />
                  <p className="text-slate-500 text-lg italic">
                    Fetch your data first to analyze time management.
                  </p>
                </div>
              ) : !fatigueAnalysis && !fatigueLoading ? (
                <div className="bg-slate-100 border border-slate-300 p-8 rounded-xl shadow-sm max-w-2xl mx-auto text-center">
                  <Target className="w-16 h-16 text-slate-400 mx-auto mb-4" />
                  <p className="text-slate-600 mb-4">
                    Analyze how fatigue and breaks affect your performance.
                  </p>
                  <button
                    onClick={handleAnalyzeFatigue}
                    className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-medium"
                  >
                    Analyze Time Management
                  </button>
                  <p className="text-slate-400 text-sm mt-4">
                    This analysis may take a moment as it processes all your games.
                  </p>
                </div>
              ) : fatigueLoading ? (
                <div className="bg-slate-100 border border-slate-300 p-8 rounded-xl shadow-sm max-w-2xl mx-auto text-center">
                  <Loader2 className="w-16 h-16 text-blue-500 mx-auto mb-4 animate-spin" />
                  <p className="text-slate-600 text-lg">
                    Analyzing your games...
                  </p>
                  <p className="text-slate-400 text-sm mt-2">
                    Building fatigue models from your game history.
                  </p>
                </div>
              ) : fatigueError ? (
                <div className="bg-slate-100 border border-slate-300 p-8 rounded-xl shadow-sm max-w-2xl mx-auto text-center">
                  <Target className="w-16 h-16 text-red-400 mx-auto mb-4" />
                  <p className="text-red-600 text-lg italic">
                    Failed to analyze fatigue data.
                  </p>
                  <button
                    onClick={handleAnalyzeFatigue}
                    className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                  >
                    Retry
                  </button>
                </div>
              ) : fatigueAnalysis?.error ? (
                <div className="bg-slate-100 border border-slate-300 p-8 rounded-xl shadow-sm max-w-2xl mx-auto text-center">
                  <Target className="w-16 h-16 text-slate-400 mx-auto mb-4" />
                  <p className="text-slate-500 text-lg italic">
                    {fatigueAnalysis.error}
                  </p>
                  <p className="text-slate-400 text-sm mt-2">
                    Games analyzed: {fatigueAnalysis.sample_size}
                  </p>
                </div>
              ) : fatigueAnalysis ? (
                <div className="space-y-6 max-w-2xl mx-auto">
                  {/* Header Stats */}
                  <div className="bg-slate-100 border border-slate-300 p-6 rounded-xl shadow-sm">
                    <p className="text-slate-500 text-center mb-4">
                      Based on <span className="font-bold text-slate-800">{formatNumber(fatigueAnalysis.sample_size)}</span> {data.time_class} games
                    </p>

                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-slate-500 text-sm">Baseline Win Rate</p>
                        <p className="text-2xl font-bold text-slate-800">{fatigueAnalysis.baseline_win_rate}%</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-sm">Best Performance</p>
                        <p className="text-2xl font-bold text-green-600">Game #{fatigueAnalysis.best_game_number}</p>
                        <p className="text-sm text-green-600">{fatigueAnalysis.best_win_rate}% win rate</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-sm">Worst Performance</p>
                        <p className="text-2xl font-bold text-red-500">Game #{fatigueAnalysis.worst_game_number}</p>
                        <p className="text-sm text-red-500">{fatigueAnalysis.worst_win_rate}% win rate</p>
                      </div>
                    </div>
                  </div>

                  {/* Insights Section */}
                  {fatigueAnalysis.insights && fatigueAnalysis.insights.length > 0 && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-bold text-slate-200 text-center">What We Found</h3>
                      {fatigueAnalysis.insights.map((insight, idx) => (
                        <div key={idx} className={`p-5 rounded-xl shadow-sm border-l-4 ${
                          insight.type === 'warning' ? 'bg-red-50 border-red-500' :
                          insight.type === 'positive' ? 'bg-green-50 border-green-500' :
                          'bg-blue-50 border-blue-500'
                        }`}>
                          <div className="flex items-start gap-3">
                            <span className="text-2xl mt-0.5">
                              {insight.type === 'warning' ? '⚠️' :
                               insight.type === 'positive' ? '✅' : 'ℹ️'}
                            </span>
                            <div className="flex-1">
                              <h4 className={`font-bold text-lg mb-1 ${
                                insight.type === 'warning' ? 'text-red-800' :
                                insight.type === 'positive' ? 'text-green-800' :
                                'text-blue-800'
                              }`}>{insight.title}</h4>
                              <p className={`text-sm mb-3 ${
                                insight.type === 'warning' ? 'text-red-700' :
                                insight.type === 'positive' ? 'text-green-700' :
                                'text-blue-700'
                              }`}>{insight.message}</p>
                              <div className={`p-3 rounded-lg ${
                                insight.type === 'warning' ? 'bg-red-100' :
                                insight.type === 'positive' ? 'bg-green-100' :
                                'bg-blue-100'
                              }`}>
                                <p className={`text-sm font-medium ${
                                  insight.type === 'warning' ? 'text-red-800' :
                                  insight.type === 'positive' ? 'text-green-800' :
                                  'text-blue-800'
                                }`}>
                                  💡 {insight.recommendation}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              <div className="flex justify-center mt-12">
                <div className="h-1 w-[90%] bg-slate-100 rounded-full"></div>
              </div>
            </div>
          )}

          {/* ========== OPENINGS PANEL ========== */}
          {isAuthenticated && activePanel === 'openings' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">

              <div className="flex justify-center mb-8 mt-20">
                <div className="h-1 w-[90%] bg-slate-100 rounded-full"></div>
              </div>

              
              {/* Opening Statistics Section */}
              <div className="flex justify-center mb-8 mt-12">
                <div className="h-1 w-[90%] bg-slate-100 rounded-full"></div>
              </div>

              <div className="flex flex-col items-center gap-4 mb-6">
                <h2 className="text-3xl font-bold text-slate-100 whitespace-nowrap">
                  Opening Statistics
                </h2>
              </div>

              {data ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
                  {/* White Openings */}
                  <div className="bg-slate-100 border border-slate-300 p-6 rounded-xl shadow-sm">
                    <h2 className="text-xl font-bold mb-6 text-slate-800">Openings as White</h2>
                    <OpeningsChart data={data.openings.white} />
                  </div>

                  {/* Black Openings */}
                  <div className="bg-slate-100 border border-slate-300 p-6 rounded-xl shadow-sm">
                    <h2 className="text-xl font-bold mb-6 text-slate-800">Openings as Black</h2>
                    <OpeningsChart data={data.openings.black} />
                  </div>
                </div>
              ) : (
                <div className="bg-slate-100 border border-slate-300 p-8 rounded-xl shadow-sm max-w-2xl mx-auto text-center mb-12">
                  <BookOpen className="w-16 h-16 text-slate-400 mx-auto mb-4" />
                  <p className="text-slate-500 text-lg italic">
                    Fetch your data first to see opening statistics.
                  </p>
                </div>
              )}

              {/* Learn Openings Section */}
              <div className="flex justify-center mb-8 mt-12">
                <div className="h-1 w-[90%] bg-slate-100 rounded-full"></div>
              </div>

              <div className="flex flex-col items-center gap-4 mb-6">
                <h2 className="text-3xl font-bold text-slate-100 whitespace-nowrap">
                  Learn Openings
                </h2>
              </div>

              <div className="bg-slate-100 border border-slate-300 p-6 rounded-xl shadow-sm max-w-2xl mx-auto">
                <label className="block text-slate-800 font-bold mb-3">Select an Opening</label>
                <select
                  value={selectedOpening}
                  onChange={(e) => handleOpeningSelect(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Choose an opening --</option>
                  {allOpenings.map((opening, idx) => (
                    <option key={idx} value={`${opening.opening}-${opening.side}`}>
                      {opening.opening} ({opening.side})
                    </option>
                  ))}
                </select>

                {!data && (
                  <p className="text-slate-500 italic mt-4">
                    Fetch your data first to see available openings.
                  </p>
                )}
              </div>

              {/* Videos Section */}
              {selectedOpening && (
                <div className="mt-8">
                  <h3 className="text-2xl font-bold text-slate-100 text-center mb-6">
                    Recommended Videos
                  </h3>

                  {videosLoading && (
                    <div className="flex justify-center items-center py-12">
                      <Loader2 className="animate-spin w-8 h-8 text-slate-300" />
                      <span className="ml-3 text-slate-300">Loading videos...</span>
                    </div>
                  )}

                  {videosError && (
                    <div className="bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded-lg max-w-2xl mx-auto">
                      Failed to fetch videos. YouTube API may not be configured.
                    </div>
                  )}

                  {!videosLoading && !videosError && videos.length === 0 && (
                    <p className="text-slate-400 text-center italic">
                      No videos found for this opening.
                    </p>
                  )}

                  {!videosLoading && videos.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
                      {videos.map((video) => (
                        <a
                          key={video.video_id}
                          href={video.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-slate-100 border border-slate-300 rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-shadow"
                        >
                          <img
                            src={video.thumbnail}
                            alt={video.title}
                            className="w-full h-40 object-cover"
                          />
                          <div className="p-4">
                            <h4 className="font-bold text-slate-800 text-sm line-clamp-2 mb-3">
                              {video.title}
                            </h4>
                            <div className="flex items-center gap-3">
                              {video.channel_thumbnail && (
                                <img
                                  src={video.channel_thumbnail}
                                  alt={video.channel_title}
                                  className="w-8 h-8 rounded-full"
                                />
                              )}
                              <div>
                                <p className="text-slate-700 text-sm font-medium">{video.channel_title}</p>
                                <div className="flex gap-3 text-xs text-slate-500">
                                  <span>{formatNumber(video.view_count)} views</span>
                                  <span>{formatNumber(video.subscriber_count)} subs</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-center mt-12">
                <div className="h-1 w-[90%] bg-slate-100 rounded-full"></div>
              </div>
            </div>
          )}

          {/* ========== MIDDLE GAME PANEL ========== */}
          {isAuthenticated && activePanel === 'middle-game' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="flex justify-center mb-8 mt-20">
                <div className="h-1 w-[90%] bg-slate-100 rounded-full"></div>
              </div>

              
              <div className="flex justify-center mb-8 mt-12">
                <div className="h-1 w-[90%] bg-slate-100 rounded-full"></div>
              </div>

              <div className="flex flex-col items-center gap-4 mb-6">
                <h2 className="text-3xl font-bold text-slate-100 whitespace-nowrap">
                  Middle Game
                </h2>
              </div>

              <div className="bg-slate-100 border border-slate-300 p-8 rounded-xl shadow-sm max-w-2xl mx-auto text-center">
                <Swords className="w-16 h-16 text-slate-400 mx-auto mb-4" />
                <p className="text-slate-500 text-lg italic">
                  Coming soon...
                </p>
              </div>

              <div className="flex justify-center mt-12">
                <div className="h-1 w-[90%] bg-slate-100 rounded-full"></div>
              </div>
            </div>
          )}

          {/* ========== END GAME PANEL ========== */}
          {isAuthenticated && activePanel === 'end-game' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="flex justify-center mb-8 mt-20">
                <div className="h-1 w-[90%] bg-slate-100 rounded-full"></div>
              </div>

              
              <div className="flex justify-center mb-8 mt-12">
                <div className="h-1 w-[90%] bg-slate-100 rounded-full"></div>
              </div>

              <div className="flex flex-col items-center gap-4 mb-6">
                <h2 className="text-3xl font-bold text-slate-100 whitespace-nowrap">
                  End Game
                </h2>
              </div>

              <div className="bg-slate-100 border border-slate-300 p-8 rounded-xl shadow-sm max-w-2xl mx-auto text-center">
                <Crown className="w-16 h-16 text-slate-400 mx-auto mb-4" />
                <p className="text-slate-500 text-lg italic">
                  Coming soon...
                </p>
              </div>

              <div className="flex justify-center mt-12">
                <div className="h-1 w-[90%] bg-slate-100 rounded-full"></div>
              </div>
            </div>
          )}

          {/* ========== MY DATA PANEL ========== */}
          {isAuthenticated && activePanel === 'my-data' && data && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">

            {/* ========== GAME TYPE SELECTOR ========== */}
            <div className="flex justify-center mb-8 mt-12">
              <div className="h-1 w-[90%] bg-slate-100 rounded-full"></div>
            </div>

            <div className="flex flex-col items-center gap-4 mb-6">
              <h2 className="text-3xl font-bold text-slate-100 whitespace-nowrap">
                Game Type
              </h2>
              <div className="bg-slate-100 border border-slate-300 p-4 rounded-xl shadow-sm">
                <select
                  value={selectedTimeClass}
                  onChange={(e) => handleTimeClassChange(e.target.value as TimeClass)}
                  className="px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="rapid">Rapid</option>
                  <option value="blitz">Blitz</option>
                </select>
              </div>
            </div>

            {/* ========== ELO RATING SECTION ========== */}
            <div className="flex justify-center mb-8 mt-12">
              <div className="h-1 w-[90%] bg-slate-100 rounded-full"></div>
            </div>

            <div className="flex flex-col items-center gap-4 mb-6">
              <h2 className="text-3xl font-bold text-slate-100 whitespace-nowrap">
                Elo Rating
              </h2>
            </div>

            {processedEloHistory && processedEloHistory.length > 0 ? (
              <div className="bg-slate-100 border border-slate-300 p-6 rounded-xl shadow-sm">
                <h2 className="text-xl font-bold mb-6 text-slate-800 capitalize">{data.time_class} Rating Over Time</h2>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={processedEloHistory}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ccc" />
                      <XAxis
                        dataKey="periodLabel"
                        stroke="#475569"
                        tick={{fill: '#475569'}}
                        minTickGap={30}
                      />
                      <YAxis
                        stroke="#475569"
                        tick={{fill: '#475569'}}
                        domain={['dataMin - 50', 'dataMax + 50']}
                      />
                      <Tooltip
                        cursor={{stroke: '#94a3b8', strokeWidth: 1}}
                        contentStyle={{ backgroundColor: '#fff', borderColor: '#cbd5e1', color: '#1e293b' }}
                        labelFormatter={(label) => label}
                        formatter={(value) => [formatNumber(value as number), "Elo"]}
                      />
                      <Line
                        type="monotone"
                        dataKey="elo"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, fill: '#3b82f6' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="bg-slate-100 border border-slate-300 p-6 rounded-xl shadow-sm">
                <h2 className="text-xl font-bold mb-6 text-slate-800 capitalize">{data.time_class} Rating Over Time</h2>
                <p className="text-slate-500 italic">No {data.time_class} games found.</p>
              </div>
            )}

            {/* ========== ALL GAMES PLAYED SECTION ========== */}
            <div className="flex justify-center mb-8 mt-12">
              <div className="h-1 w-[90%] bg-slate-100 rounded-full"></div>
            </div>

            <div className="flex flex-col items-center gap-4 mb-6">
              <h2 className="text-3xl font-bold text-slate-100 whitespace-nowrap">
                All Games Played
              </h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

              {/* History Chart */}
              <div className="bg-slate-100 border border-slate-300 p-6 rounded-xl shadow-sm lg:col-span-2">
                <h2 className="text-xl font-bold mb-6 text-slate-800">Games Played Per Week</h2>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={processedHistory}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ccc" />
                      <XAxis
                        dataKey="periodLabel"
                        stroke="#475569"
                        tick={{fill: '#475569'}}
                        minTickGap={30}
                      />
                      <YAxis stroke="#475569" tick={{fill: '#475569'}} />
                      <Tooltip
                        cursor={{fill: '#f1f5f9'}}
                        contentStyle={{ backgroundColor: '#fff', borderColor: '#cbd5e1', color: '#1e293b' }}
                        labelFormatter={(label) => label}
                        formatter={(value) => [formatNumber(value as number), "Games Played"]}
                      />
                      <Bar dataKey="games_played" fill="#769656" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {/* Stats below the chart */}
                {(() => {
                  const totalGames = data.history.reduce((sum, week) => sum + week.games_played, 0);
                  const totalDays = data.history.length * 7;
                  const avgPerDay = totalDays > 0 ? (totalGames / totalDays).toFixed(2) : '0';
                  return (
                    <div className="mt-6 flex gap-8 justify-center text-slate-700">
                      <p>Total games played ({data.time_class}): <span className="font-bold">{formatNumber(data.total_games)}</span></p>
                      <p>Avg. games per day: <span className="font-bold">{avgPerDay}</span></p>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* ========== GAMES PER DAY SECTION ========== */}
            <div className="flex justify-center mb-8 mt-12">
              <div className="h-1 w-[90%] bg-slate-100 rounded-full"></div>
            </div>

            <div className="flex flex-col items-center gap-4 mb-6">
              <h2 className="text-3xl font-bold text-slate-100 whitespace-nowrap">
                Win Rate by Game Number
              </h2>
            </div>

            {data.game_number_stats && data.game_number_stats.length > 0 ? (
              <div className="bg-slate-100 border border-slate-300 p-6 rounded-xl shadow-sm">
                <h2 className="text-xl font-bold mb-6 text-slate-800">Win Rate by Nth Game of the Day</h2>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.game_number_stats}>
                      <defs>
                        <linearGradient id="winRateGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#4ade80" stopOpacity={0.3} />
                          <stop offset="50%" stopColor="#4ade80" stopOpacity={0.1} />
                          <stop offset="50%" stopColor="#f87171" stopOpacity={0.1} />
                          <stop offset="100%" stopColor="#f87171" stopOpacity={0.3} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ccc" />
                      <XAxis
                        dataKey="game_number"
                        stroke="#475569"
                        tick={{fill: '#475569'}}
                        label={{ value: 'Game # of the day', position: 'insideBottom', offset: -5, fill: '#475569' }}
                      />
                      <YAxis
                        stroke="#475569"
                        tick={{fill: '#475569'}}
                        domain={[0, 100]}
                        label={{ value: 'Win Rate %', angle: -90, position: 'insideLeft', fill: '#475569' }}
                      />
                      <ReferenceLine
                        y={50}
                        stroke="#64748b"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        label={{ value: '50%', position: 'right', fill: '#64748b', fontSize: 12 }}
                      />
                      <Tooltip
                        cursor={{stroke: '#94a3b8', strokeWidth: 1}}
                        contentStyle={{ backgroundColor: '#fff', borderColor: '#cbd5e1', color: '#1e293b' }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const d = payload[0].payload;
                            const color = d.win_rate >= 50 ? '#4ade80' : '#f87171';
                            return (
                              <div className="bg-white p-3 border border-slate-200 shadow-xl rounded text-sm text-slate-800">
                                <p className="font-bold text-base mb-1">Game #{d.game_number} of the day</p>
                                <p>Win Rate: <span className="font-mono font-bold" style={{color}}>{d.win_rate}%</span></p>
                                <p>Sample size: <span className="font-mono">{formatNumber(d.sample_size)} games</span></p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="win_rate"
                        stroke="#475569"
                        strokeWidth={2}
                        dot={({ cx, cy, payload }) => {
                          const color = payload.win_rate >= 50 ? '#4ade80' : '#f87171';
                          return (
                            <circle cx={cx} cy={cy} r={6} fill={color} stroke="#fff" strokeWidth={2} />
                          );
                        }}
                        activeDot={({ cx, cy, payload }) => {
                          const color = payload.win_rate >= 50 ? '#4ade80' : '#f87171';
                          return (
                            <circle cx={cx} cy={cy} r={8} fill={color} stroke="#fff" strokeWidth={2} />
                          );
                        }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {/* Interpretation guide */}
                <div className="mt-6 p-4 bg-slate-200 rounded-lg text-sm text-slate-700">
                  <p className="font-bold mb-2">How to interpret this data:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li><span className="text-green-600 font-medium">Green dots</span> = win rate above 50% (you're performing well)</li>
                    <li><span className="text-red-500 font-medium">Red dots</span> = win rate below 50% (consider stopping or taking a break)</li>
                    <li>If your win rate drops after game #3-4, you may be prone to tilt or fatigue</li>
                    <li>Use this to find your optimal number of daily games for peak performance</li>
                  </ul>
                </div>
              </div>
            ) : (
              <div className="bg-slate-100 border border-slate-300 p-6 rounded-xl shadow-sm">
                <h2 className="text-xl font-bold mb-6 text-slate-800">Win Rate by Nth Game of the Day</h2>
                <p className="text-slate-500 italic">Not enough data to display.</p>
              </div>
            )}

            <div className="flex justify-center mt-12">
              <div className="h-1 w-[90%] bg-slate-100 rounded-full"></div>
            </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Sub-components
const PlayerDataCard = ({ player, totalRapid, totalBlitz }: { player: PlayerData; totalRapid: number; totalBlitz: number }) => (
  <div className="bg-slate-100 border border-slate-300 p-6 rounded-xl shadow-sm max-w-md mx-auto">
    <div className="flex items-center gap-6">
      {player.avatar ? (
        <img
          src={player.avatar}
          alt={`${player.username}'s avatar`}
          className="w-24 h-24 rounded-full border-2 border-slate-300"
        />
      ) : (
        <div className="w-24 h-24 rounded-full bg-slate-300 flex items-center justify-center text-slate-500 text-2xl font-bold">
          {player.username.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="space-y-1">
        <h3 className="text-xl font-bold text-slate-800">{player.name}</h3>
        <p className="text-slate-600">@{player.username}</p>
        <p className="text-slate-600">{formatNumber(player.followers)} followers</p>
        <p className="text-slate-500 text-sm">Joined {formatJoinedDate(player.joined)}</p>
        <div className="mt-2 space-y-0.5">
          <p className="text-slate-600">Total games played (rapid): <span className="font-bold">{formatNumber(totalRapid)}</span></p>
          <p className="text-slate-600">Total games played (blitz): <span className="font-bold">{formatNumber(totalBlitz)}</span></p>
        </div>
      </div>
    </div>
  </div>
);

const OpeningsChart = ({ data }: { data: OpeningData[] }) => {
  if (!data || data.length === 0) return <p className="text-slate-500 italic">No data available.</p>;

  return (
    <div className="h-[500px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart layout="vertical" data={data} margin={{ left: 10, right: 30 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#ccc" />
          <XAxis type="number" hide />
          <YAxis 
            type="category" 
            dataKey="opening" 
            width={110} 
            style={{ fontSize: '12px', fontWeight: 600, fill: '#334155' }} 
            interval={0}
          />
          <Tooltip
            cursor={{fill: '#f1f5f9'}}
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const d = payload[0].payload;
                return (
                  <div className="bg-white p-3 border border-slate-200 shadow-xl rounded text-sm text-slate-800 z-50">
                    <p className="font-bold text-base mb-1">{d.opening}</p>
                    <p>Games Played: <span className="font-mono">{formatNumber(d.games)}</span></p>
                    <p>Win Rate: <span className="font-mono font-bold" style={{color: getBarColor(d.win_rate)}}>{d.win_rate}%</span></p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Bar dataKey="games" radius={[0, 4, 4, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getBarColor(entry.win_rate)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

// Loading progress indicator with real-time progress from SSE
const LoadingProgress = ({ progress }: { progress: StreamProgress | null }) => {
  // Format month from "2024-01" to "Jan. 2024"
  const formatProgressMonth = (month: string) => {
    if (!month) return '...';
    const [year, monthNum] = month.split('-');
    const date = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
    const monthName = date.toLocaleString('en-US', { month: 'short' });
    return `${monthName}. ${year}`;
  };

  const percentage = progress ? (progress.current / progress.total) * 100 : 0;

  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <Loader2 className="animate-spin w-10 h-10 text-blue-500" />
      <div className="text-slate-300 text-lg">
        Fetching data from <span className="font-mono font-bold text-white">{formatProgressMonth(progress?.month || '')}</span>...
      </div>
      <div className="w-64 h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
      {progress && (
        <div className="text-slate-400 text-sm">
          {progress.current} / {progress.total} months processed
        </div>
      )}
    </div>
  );
};

export default App;