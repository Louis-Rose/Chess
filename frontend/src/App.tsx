import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine
} from 'recharts';
import { Search, Loader2, BarChart3, Trophy, Target, BookOpen, Swords, Crown, ChevronDown, TrendingUp, Home } from 'lucide-react';
import { useAuth } from './contexts/AuthContext';
import { LoginButton } from './components/LoginButton';
import { UserMenu } from './components/UserMenu';

type PanelType = 'welcome' | 'my-data' | 'win-prediction' | 'pros-tips' | 'weaknesses' | 'openings' | 'middle-game' | 'end-game';

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

// Top 3 FIDE rated players with their tips and videos
const PRO_PLAYERS = [
  {
    name: 'Magnus Carlsen',
    country: 'Norway',
    rating: 2831,
    rank: 1,
    videoId: 'l1wXlyFOzgc',
    videoTitle: '5 Rules For Brutal Chess',
    tips: [
      {
        title: 'Hinder Opponent Development',
        description: "Don't just focus on moving your pieces; prioritize making moves that force your opponent to \"undevelop\" theirs or block their own pieces."
      },
      {
        title: 'Avoid "Unmotivated" Exchanges',
        description: "Never trade pieces just for the sake of it; exchanges should only happen if they give you a specific positional advantage, like helping you advance a pawn or activate a piece."
      },
      {
        title: 'Connect Your Rooks',
        description: "The opening phase is only truly complete once your Rooks are connected and eyeing each other, signaling that you are ready for a middle-game attack."
      }
    ]
  },
  {
    name: 'Fabiano Caruana',
    country: 'USA',
    rating: 2805,
    rank: 2,
    videoId: 'Ixg8sRmu2IU',
    videoTitle: 'Exclusive Classroom Lesson',
    tips: [
      {
        title: 'Improve Visualization',
        description: "Visualization is the most critical skill because most blunders come from not seeing the future board clearly."
      },
      {
        title: 'Trust Your Intuition',
        description: "When you feel you have the initiative, lean into being aggressive rather than playing too cautiously to \"preserve\" your position."
      },
      {
        title: 'The "Pattern within the Pattern"',
        description: "Real improvement comes from identifying macro mistakes, such as a consistent habit of playing too fast during critical moments or over-relying on computer evaluations."
      }
    ]
  },
  {
    name: 'Hikaru Nakamura',
    country: 'USA',
    rating: 2802,
    rank: 3,
    videoId: 'YcsWbpFKLUg',
    videoTitle: 'Peak Performance & Blitz Strategy',
    tips: [
      {
        title: 'Spam Blitz for Intuition',
        description: "Playing a massive volume of blitz games helps build a \"database\" of intuitive patterns that you can use in slower games."
      },
      {
        title: 'Manage Tilt and Fatigue',
        description: "Take conscious, long breaks (sometimes months) to refresh and reset your mental state to avoid burnout."
      },
      {
        title: 'Practical Decision Making',
        description: "Focus on making \"good enough\" moves quickly when under pressure rather than searching for the engine's \"best\" move and losing on time."
      }
    ]
  }
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

interface HourlyStats {
  hour_group: number;
  start_hour: number;
  end_hour: number;
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

interface WinPredictionInsight {
  type: 'warning' | 'positive' | 'info';
  title: string;
  message: string;
  recommendation: string;
}

interface WinPredictionHourlyData {
  hour_group: number;
  start_hour: number;
  end_hour: number;
  win_rate: number;
  sample_size: number;
}

interface AutocorrelationData {
  value: number;
  name: string;
}

interface WinPredictionAnalysis {
  sample_size: number;
  error?: string;
  games_after_win?: number;
  games_after_loss?: number;
  games_after_draw?: number;
  win_rate_after_win?: number;
  win_rate_after_loss?: number;
  win_rate_after_draw?: number;
  odds_ratio?: number;
  odds_ratio_hour?: number;
  odds_ratio_day_balance?: number;
  odds_ratio_minutes?: number;
  coefficient?: number;
  coefficient_hour?: number;
  coefficient_day_balance?: number;
  coefficient_minutes?: number;
  is_significant?: boolean;
  is_hour_significant?: boolean;
  is_balance_significant?: boolean;
  is_minutes_significant?: boolean;
  baseline_win_rate?: number;
  best_hour?: number;
  worst_hour?: number;
  hourly_data?: WinPredictionHourlyData[];
  autocorrelations?: {
    prev_result: AutocorrelationData;
    hour: AutocorrelationData;
    day_balance: AutocorrelationData;
    minutes_gap: AutocorrelationData;
  };
  insights?: WinPredictionInsight[];
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
  hourly_stats: HourlyStats[];
  win_prediction: WinPredictionAnalysis;
}

type TimeClass = 'rapid' | 'blitz';

// SSE streaming types
interface StreamProgress {
  current: number;
  total: number;
  month: string;  // e.g., "2024-01"
  cached?: boolean;  // true when data comes from cache
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
            setProgress({ current: 0, total: message.total_archives, month: '', cached: message.cached });
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
      setError('Failed to fetch player data. Check the username and try again.');
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
  const [activePanel, setActivePanel] = useState<PanelType>('welcome');
  const [selectedOpening, setSelectedOpening] = useState<string>('');
  const [selectedTimeClass, setSelectedTimeClass] = useState<TimeClass>('rapid');
  const [selectedPro, setSelectedPro] = useState<string>('');

  // Username history
  const [savedPlayers, setSavedPlayers] = useState<SavedPlayer[]>([]);
  const [showUsernameDropdown, setShowUsernameDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // User's own player data (separate from searched player)
  const [myPlayerData, setMyPlayerData] = useState<ApiResponse | null>(null);

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
      setMyPlayerData(null);
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
      setSelectedTimeClass(user.preferences.preferred_time_class as TimeClass);
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

      // If this matches the user's saved chess username, update myPlayerData
      if (isAuthenticated && user?.preferences?.chess_username?.toLowerCase() === data.player.username.toLowerCase()) {
        setMyPlayerData(data);
      }

      // First-time user: when they answer "What is your Chess.com username?" and search,
      // save that as their profile. Only if they don't have a preference yet.
      if (isAuthenticated && !user?.preferences?.chess_username && !myPlayerData) {
        updatePreferences({ chess_username: data.player.username });
        setMyPlayerData(data);
      }
    }
  }, [data?.player, isAuthenticated, user?.preferences?.chess_username, myPlayerData]);

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
        {/* User Menu - show placeholder when not authenticated */}
        <div className="flex justify-center mb-4 px-2 pb-4 border-b border-slate-700">
          {isAuthenticated ? (
            authLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            ) : (
              <UserMenu />
            )
          ) : (
            <div className="flex items-center gap-2 text-slate-500">
              <div className="w-8 h-8 rounded-full bg-slate-700" />
              <span className="text-sm">Not signed in</span>
            </div>
          )}
        </div>

        {/* Player Info in Sidebar - Always shows the logged-in user's Chess.com profile */}
        <div className="px-2 pb-4 border-b border-slate-700">
          {isAuthenticated && myPlayerData?.player ? (
            <div className="bg-white rounded-lg p-4 text-center">
              {myPlayerData.player.avatar ? (
                <img src={myPlayerData.player.avatar} alt="" className="w-16 h-16 rounded-full mx-auto mb-2" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 text-xl font-bold mx-auto mb-2">
                  {myPlayerData.player.username.charAt(0).toUpperCase()}
                </div>
              )}
              <p className="text-slate-800 font-semibold">{myPlayerData.player.name || myPlayerData.player.username}</p>
              <p className="text-slate-500 text-sm">@{myPlayerData.player.username}</p>
              <p className="text-slate-400 text-xs mt-1">{myPlayerData.player.followers} followers</p>
              <p className="text-slate-400 text-xs">
                Joined {new Date(myPlayerData.player.joined * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
              <div className="mt-3 pt-3 border-t border-slate-200 text-xs text-slate-600 space-y-1">
                <p>Rapid: <span className="font-semibold text-slate-800">{myPlayerData.total_rapid?.toLocaleString() || 0}</span> games</p>
                <p>Blitz: <span className="font-semibold text-slate-800">{myPlayerData.total_blitz?.toLocaleString() || 0}</span> games</p>
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

        {/* Username Search - in sidebar when user has profile */}
        {isAuthenticated && myPlayerData && (
          <div className="px-2 py-4 border-b border-slate-700">
            <div className="bg-white rounded-lg p-3">
              <label className="block text-slate-600 text-xs font-medium mb-2 text-center">Lookup Player</label>
              <form onSubmit={handleSubmit} className="space-y-2">
                <div className="relative" ref={dropdownRef}>
                  <div className="flex">
                    <input
                      type="text"
                      placeholder="chess.com username"
                      className="bg-white text-slate-900 placeholder:text-slate-400 px-3 py-2 border border-slate-300 rounded-l-lg w-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                        <ChevronDown className={`w-3 h-3 text-slate-500 transition-transform ${showUsernameDropdown ? 'rotate-180' : ''}`} />
                      </button>
                    )}
                    {savedPlayers.length === 0 && (
                      <div className="w-0 border-r border-slate-300 rounded-r-lg" />
                    )}
                  </div>
                  {/* Dropdown */}
                  {showUsernameDropdown && savedPlayers.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-300 rounded-lg shadow-lg z-50 max-h-48 overflow-auto">
                      <div className="px-2 py-1 text-xs text-slate-500 border-b border-slate-200">Recent</div>
                      {savedPlayers.map((player, idx) => {
                        const isMe = user?.preferences?.chess_username?.toLowerCase() === player.username.toLowerCase();
                        return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSelectSavedUsername(player)}
                          className="w-full px-2 py-1.5 text-left text-slate-800 hover:bg-blue-50 flex items-center gap-2 text-sm"
                        >
                          {player.avatar ? (
                            <img src={player.avatar} alt="" className="w-5 h-5 rounded-full object-cover" />
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-slate-300 flex items-center justify-center text-slate-500 text-xs font-bold">
                              {player.username.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span className="truncate">{player.username}</span>
                          {isMe && <span className="text-xs text-slate-400">(me)</span>}
                        </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 text-sm font-medium"
                >
                  {loading ? <Loader2 className="animate-spin w-4 h-4" /> : <Search className="w-4 h-4" />}
                  Fetch
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Game Type Selector */}
        <div className="px-2 py-4 border-b border-slate-700">
          <div className="bg-white rounded-lg p-3">
            <label className="block text-slate-600 text-xs font-medium mb-2 text-center">Game Type</label>
            <select
              value={selectedTimeClass}
              onChange={(e) => handleTimeClassChange(e.target.value as TimeClass)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value="rapid">Rapid</option>
              <option value="blitz">Blitz</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1 px-2 py-4 border-b border-slate-700">
        <button
          onClick={() => setActivePanel('welcome')}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
            activePanel === 'welcome'
              ? 'bg-blue-600 text-white'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Home className="w-5 h-5" />
          Welcome
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
          onClick={() => setActivePanel('win-prediction')}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
            activePanel === 'win-prediction'
              ? 'bg-blue-600 text-white'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <TrendingUp className="w-5 h-5" />
          Win Prediction
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
          )}

          {/* Header with search - only when authenticated */}
          {isAuthenticated && (
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
          )}

          {/* ========== WELCOME PANEL ========== */}
          {activePanel === 'welcome' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 mt-8">
              {/* Only show header text for authenticated users */}
              {isAuthenticated && (
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
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
                {/* How to Improve */}
                <button
                  onClick={() => setActivePanel('pros-tips')}
                  className="bg-slate-800 border border-slate-700 rounded-xl p-5 hover:border-yellow-500 transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-yellow-600 rounded-lg flex items-center justify-center">
                      <Trophy className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-100">How to Improve</h3>
                  </div>
                  <p className="text-slate-400 text-sm">
                    Learn from the best! Watch curated video tips from top FIDE players like Magnus Carlsen, Hikaru Nakamura, and more.
                  </p>
                </button>

                {/* My Data */}
                <button
                  onClick={() => setActivePanel('my-data')}
                  className="bg-slate-800 border border-slate-700 rounded-xl p-5 hover:border-blue-500 transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                      <BarChart3 className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-100">My Data</h3>
                  </div>
                  <p className="text-slate-400 text-sm">
                    Track your ELO progression, games played over time, and win rates by time of day. See your complete chess journey visualized.
                  </p>
                </button>

                {/* Win Prediction */}
                <button
                  onClick={() => setActivePanel('win-prediction')}
                  className="bg-slate-800 border border-slate-700 rounded-xl p-5 hover:border-green-500 transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-100">Win Prediction</h3>
                  </div>
                  <p className="text-slate-400 text-sm">
                    Uses logistic regression to analyze if your previous game result and time of day predict your next game outcome. Discover tilt and momentum patterns.
                  </p>
                </button>

                {/* Identify Weaknesses */}
                <button
                  onClick={() => setActivePanel('weaknesses')}
                  className="bg-slate-800 border border-slate-700 rounded-xl p-5 hover:border-red-500 transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center">
                      <Target className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-100">Identify Weaknesses</h3>
                  </div>
                  <p className="text-slate-400 text-sm">
                    Analyze your fatigue patterns to find when you perform best and worst. Get personalized recommendations based on your game-by-game performance.
                  </p>
                </button>

                {/* Openings */}
                <button
                  onClick={() => setActivePanel('openings')}
                  className="bg-slate-800 border border-slate-700 rounded-xl p-5 hover:border-purple-500 transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center">
                      <BookOpen className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-100">Openings</h3>
                  </div>
                  <p className="text-slate-400 text-sm">
                    See your most played openings with win rates and confidence intervals. Find video tutorials to improve your weakest lines.
                  </p>
                </button>

                {/* Middle & End Game */}
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 transition-colors opacity-60 text-left">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-slate-600 rounded-lg flex items-center justify-center">
                      <Swords className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-100">Middle & End Game</h3>
                    <span className="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded">Coming Soon</span>
                  </div>
                  <p className="text-slate-400 text-sm">
                    Advanced analysis of your middle game tactics and endgame technique. Currently in development.
                  </p>
                </div>
              </div>

              {/* Only show footer text for authenticated users */}
              {isAuthenticated && (
                <div className="text-center mt-8">
                  <p className="text-slate-500 text-sm">
                    Use the "Lookup Player" search in the sidebar to fetch your stats or explore any Chess.com player.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ========== HOW TO IMPROVE (FROM PROS) PANEL ========== */}
          {isAuthenticated && activePanel === 'pros-tips' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="flex justify-center mb-8 mt-12">
                <div className="h-1 w-[90%] bg-slate-100 rounded-full"></div>
              </div>

              <div className="flex flex-col items-center gap-2 mb-6">
                <h2 className="text-3xl font-bold text-slate-100 whitespace-nowrap">
                  How to Improve (from Pros)
                </h2>
                <p className="text-slate-400 text-lg italic">Learn from the world's best players</p>
              </div>

              {/* Player Selection Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto mb-8">
                {PRO_PLAYERS.map((player) => (
                  <button
                    key={player.name}
                    onClick={() => setSelectedPro(selectedPro === player.name ? '' : player.name)}
                    className={`p-4 rounded-xl border-2 transition-all text-left ${
                      selectedPro === player.name
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-slate-800 border-slate-700 text-slate-200 hover:border-slate-500'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`text-2xl font-bold ${selectedPro === player.name ? 'text-blue-200' : 'text-slate-500'}`}>
                        #{player.rank}
                      </span>
                      <div>
                        <p className="font-bold">{player.name}</p>
                        <p className={`text-sm ${selectedPro === player.name ? 'text-blue-200' : 'text-slate-400'}`}>
                          {player.country} • {formatNumber(player.rating)}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Selected Player Content */}
              {selectedPro && (() => {
                const player = PRO_PLAYERS.find(p => p.name === selectedPro);
                if (!player) return null;
                return (
                  <div className="max-w-4xl mx-auto space-y-6">
                    {/* Video Embed */}
                    <div className="bg-slate-800 rounded-xl overflow-hidden">
                      <div className="aspect-video">
                        <iframe
                          width="100%"
                          height="100%"
                          src={`https://www.youtube.com/embed/${player.videoId}`}
                          title={player.videoTitle}
                          frameBorder="0"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          className="w-full h-full"
                        ></iframe>
                      </div>
                      <div className="p-4">
                        <p className="text-slate-300 text-sm">
                          <span className="text-slate-500">Source:</span> {player.videoTitle}
                        </p>
                      </div>
                    </div>

                    {/* Tips */}
                    <div className="bg-slate-100 rounded-xl p-6">
                      <h3 className="text-xl font-bold text-slate-800 mb-4">
                        Key Tips from {player.name}
                      </h3>
                      <div className="space-y-4">
                        {player.tips.map((tip, idx) => (
                          <div key={idx} className="flex gap-4">
                            <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                              {idx + 1}
                            </div>
                            <div>
                              <h4 className="font-bold text-slate-800">{tip.title}</h4>
                              <p className="text-slate-600 text-sm mt-1">{tip.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="flex justify-center mt-12">
                <div className="h-1 w-[90%] bg-slate-100 rounded-full"></div>
              </div>
            </div>
          )}

          {/* ========== WIN PREDICTION PANEL ========== */}
          {isAuthenticated && activePanel === 'win-prediction' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="flex justify-center mb-8 mt-12">
                <div className="h-1 w-[90%] bg-slate-100 rounded-full"></div>
              </div>

              <div className="flex flex-col items-center gap-4 mb-6">
                <h2 className="text-3xl font-bold text-slate-100 whitespace-nowrap">
                  Win Prediction
                </h2>
                <p className="text-slate-400 text-lg italic">Does your previous game result predict your next one?</p>
              </div>

              {/* Methodology Section */}
              <div className="bg-slate-800 border border-slate-700 p-5 rounded-xl text-sm max-w-2xl mx-auto">
                <p className="font-bold text-slate-200 mb-3">How This Analysis Works</p>
                <div className="space-y-3 text-slate-400">
                  <p>
                    We use <span className="text-slate-200 font-medium">logistic regression</span>, a statistical model that predicts the probability of a binary outcome (win or not win) based on input variables.
                  </p>
                  <p>
                    <span className="text-slate-200 font-medium">Variables tested:</span> (1) previous game result, (2) time of day (2-hour blocks), (3) day balance (cumulative wins minus losses), and (4) minutes since last game.
                  </p>
                  <p>
                    The model estimates: <span className="text-slate-300 font-mono text-xs bg-slate-700 px-2 py-1 rounded">P(win) = 1 / (1 + e^-(b₀ + b₁×prev + b₂×hour + b₃×balance + b₄×gap))</span>
                  </p>
                  <p>
                    The <span className="text-slate-200 font-medium">odds ratio</span> (e^bᵢ) tells you how much your odds of winning change per unit increase in each variable. An odds ratio of 1.2 means your odds increase by 20%.
                  </p>
                  <p>
                    We use a <span className="text-slate-200 font-medium">likelihood ratio test</span> to determine statistical significance: we compare the model with predictors against a baseline model. If the improvement is unlikely to occur by chance (p &lt; 0.05), the effect is significant.
                  </p>
                  <p>
                    <span className="text-slate-200 font-medium">Autocorrelation</span> measures how correlated a variable is with its previous value. High autocorrelation (&gt;0.5) may inflate significance, so we display it for transparency.
                  </p>
                </div>
              </div>

              {/* Horizontal separator */}
              <div className="flex justify-center my-6">
                <div className="h-px w-full max-w-2xl bg-slate-600"></div>
              </div>

              {!data ? (
                <div className="bg-slate-100 border border-slate-300 p-8 rounded-xl shadow-sm max-w-2xl mx-auto text-center">
                  <TrendingUp className="w-16 h-16 text-slate-400 mx-auto mb-4" />
                  <p className="text-slate-500 text-lg italic">
                    Fetch your data first to see win prediction analysis.
                  </p>
                </div>
              ) : data.win_prediction?.error ? (
                <div className="bg-slate-100 border border-slate-300 p-8 rounded-xl shadow-sm max-w-2xl mx-auto text-center">
                  <TrendingUp className="w-16 h-16 text-slate-400 mx-auto mb-4" />
                  <p className="text-slate-500 text-lg italic">
                    {data.win_prediction.error}
                  </p>
                  <p className="text-slate-400 text-sm mt-2">
                    Game pairs analyzed: {data.win_prediction.sample_size}
                  </p>
                </div>
              ) : data.win_prediction ? (
                <div className="space-y-6 max-w-2xl mx-auto">
                  {/* Header Stats */}
                  <div className="bg-slate-100 border border-slate-300 p-6 rounded-xl shadow-sm">
                    <p className="text-slate-500 text-center mb-4">
                      Based on <span className="font-bold text-slate-800">{formatNumber(data.win_prediction.sample_size)}</span> consecutive same-day {data.time_class} games
                    </p>

                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div className="bg-green-50 p-4 rounded-lg">
                        <p className="text-slate-500 text-sm">After a Win</p>
                        <p className="text-2xl font-bold text-green-600">{data.win_prediction.win_rate_after_win}%</p>
                        <p className="text-xs text-slate-400">{formatNumber(data.win_prediction.games_after_win || 0)} games</p>
                      </div>
                      <div className="bg-red-50 p-4 rounded-lg">
                        <p className="text-slate-500 text-sm">After a Loss</p>
                        <p className="text-2xl font-bold text-red-500">{data.win_prediction.win_rate_after_loss}%</p>
                        <p className="text-xs text-slate-400">{formatNumber(data.win_prediction.games_after_loss || 0)} games</p>
                      </div>
                      <div className="bg-yellow-50 p-4 rounded-lg">
                        <p className="text-slate-500 text-sm">After a Draw</p>
                        <p className="text-2xl font-bold text-yellow-600">{data.win_prediction.win_rate_after_draw ?? 'N/A'}%</p>
                        <p className="text-xs text-slate-400">{formatNumber(data.win_prediction.games_after_draw || 0)} games</p>
                      </div>
                    </div>

                    {/* Statistical Summary - All 4 Variables */}
                    <div className="mt-6 pt-4 border-t border-slate-200">
                      <p className="text-xs text-slate-500 text-center mb-3">Logistic Regression Results</p>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        {/* Previous Result Factor */}
                        <div className="bg-slate-50 p-3 rounded-lg">
                          <p className="text-slate-600 font-medium mb-2">Previous Result</p>
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Odds Ratio:</span>
                            <span className="font-bold text-slate-800">{data.win_prediction.odds_ratio}x</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Significant:</span>
                            <span className={`font-bold ${data.win_prediction.is_significant ? 'text-green-600' : 'text-slate-400'}`}>
                              {data.win_prediction.is_significant ? 'Yes' : 'No'}
                            </span>
                          </div>
                        </div>
                        {/* Hour of Day Factor */}
                        <div className="bg-slate-50 p-3 rounded-lg">
                          <p className="text-slate-600 font-medium mb-2">Time of Day</p>
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Best:</span>
                            <span className="font-bold text-green-600">
                              {data.win_prediction.best_hour !== undefined ? `${data.win_prediction.best_hour}:00-${data.win_prediction.best_hour + 2}:00` : 'N/A'}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Significant:</span>
                            <span className={`font-bold ${data.win_prediction.is_hour_significant ? 'text-green-600' : 'text-slate-400'}`}>
                              {data.win_prediction.is_hour_significant ? 'Yes' : 'No'}
                            </span>
                          </div>
                        </div>
                        {/* Day Balance Factor */}
                        <div className="bg-slate-50 p-3 rounded-lg">
                          <p className="text-slate-600 font-medium mb-2">Day Balance</p>
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Odds Ratio:</span>
                            <span className="font-bold text-slate-800">
                              {data.win_prediction.odds_ratio_day_balance !== undefined ? `${data.win_prediction.odds_ratio_day_balance}x` : 'N/A'}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Significant:</span>
                            <span className={`font-bold ${data.win_prediction.is_balance_significant ? 'text-green-600' : 'text-slate-400'}`}>
                              {data.win_prediction.is_balance_significant ? 'Yes' : 'No'}
                            </span>
                          </div>
                        </div>
                        {/* Minutes Gap Factor */}
                        <div className="bg-slate-50 p-3 rounded-lg">
                          <p className="text-slate-600 font-medium mb-2">Minutes Gap</p>
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Odds Ratio:</span>
                            <span className="font-bold text-slate-800">
                              {data.win_prediction.odds_ratio_minutes !== undefined ? `${data.win_prediction.odds_ratio_minutes}x` : 'N/A'}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Significant:</span>
                            <span className={`font-bold ${data.win_prediction.is_minutes_significant ? 'text-green-600' : 'text-slate-400'}`}>
                              {data.win_prediction.is_minutes_significant ? 'Yes' : 'No'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Autocorrelation Section */}
                    {data.win_prediction.autocorrelations && (
                      <div className="mt-4 pt-4 border-t border-slate-200">
                        <p className="text-xs text-slate-500 text-center mb-3">Autocorrelation (lag-1)</p>
                        <div className="grid grid-cols-4 gap-2 text-xs">
                          {Object.entries(data.win_prediction.autocorrelations).map(([key, ac]) => (
                            <div key={key} className="bg-slate-50 p-2 rounded text-center">
                              <p className="text-slate-500 truncate">{ac.name}</p>
                              <p className={`font-bold ${Math.abs(ac.value) > 0.5 ? 'text-amber-600' : 'text-slate-700'}`}>
                                {ac.value}
                              </p>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-slate-400 text-center mt-2 italic">
                          Values &gt;0.5 (amber) may have inflated significance due to serial correlation
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Insights Section */}
                  {data.win_prediction.insights && data.win_prediction.insights.length > 0 && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-bold text-slate-200 text-center">What We Found</h3>
                      {data.win_prediction.insights.map((insight, idx) => (
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

          {/* ========== IDENTIFY MY WEAKNESSES PANEL ========== */}
          {isAuthenticated && activePanel === 'weaknesses' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
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
                    <h2 className="text-xl font-bold mb-6 text-slate-800 text-center">Openings as White</h2>
                    <OpeningsChart data={data.openings.white} />
                  </div>

                  {/* Black Openings */}
                  <div className="bg-slate-100 border border-slate-300 p-6 rounded-xl shadow-sm">
                    <h2 className="text-xl font-bold mb-6 text-slate-800 text-center">Openings as Black</h2>
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

            {/* ========== ELO RATING SECTION ========== */}
            <div className="flex justify-center mb-8 mt-12">
              <div className="h-1 w-[90%] bg-slate-100 rounded-full"></div>
            </div>

            <div className="flex flex-col items-center gap-2 mb-6">
              <h2 className="text-3xl font-bold text-slate-100 whitespace-nowrap">
                Elo Rating
              </h2>
              <p className="text-slate-400 text-lg italic">How has your elo evolved over time?</p>
            </div>

            {processedEloHistory && processedEloHistory.length > 0 ? (
              <div className="bg-slate-100 border border-slate-300 p-6 rounded-xl shadow-sm">
                <h2 className="text-xl font-bold mb-6 text-slate-800 capitalize text-center">{data.time_class} Rating Over Time</h2>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="99%" height={320}>
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
                <h2 className="text-xl font-bold mb-6 text-slate-800 capitalize text-center">{data.time_class} Rating Over Time</h2>
                <p className="text-slate-500 italic text-center">No {data.time_class} games found.</p>
              </div>
            )}

            {/* ========== ALL GAMES PLAYED SECTION ========== */}
            <div className="flex justify-center mb-8 mt-12">
              <div className="h-1 w-[90%] bg-slate-100 rounded-full"></div>
            </div>

            <div className="flex flex-col items-center gap-2 mb-6">
              <h2 className="text-3xl font-bold text-slate-100 whitespace-nowrap">
                All Games Played
              </h2>
              <p className="text-slate-400 text-lg italic">How many games have you been playing?</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

              {/* History Chart */}
              <div className="bg-slate-100 border border-slate-300 p-6 rounded-xl shadow-sm lg:col-span-2">
                <h2 className="text-xl font-bold mb-6 text-slate-800 text-center">Games Played Per Week</h2>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="99%" height={320}>
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

            <div className="flex flex-col items-center gap-2 mb-6">
              <h2 className="text-3xl font-bold text-slate-100 whitespace-nowrap">
                Win Rate by Game Number
              </h2>
              <p className="text-slate-400 text-lg italic">Are your first or last games of the day better?</p>
            </div>

            {data.game_number_stats && data.game_number_stats.length > 0 ? (
              <div className="bg-slate-100 border border-slate-300 p-6 rounded-xl shadow-sm">
                <h2 className="text-xl font-bold mb-6 text-slate-800 text-center">Win Rate by Nth Game of the Day</h2>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="99%" height={320}>
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
                <h2 className="text-xl font-bold mb-6 text-slate-800 text-center">Win Rate by Nth Game of the Day</h2>
                <p className="text-slate-500 italic text-center">Not enough data to display.</p>
              </div>
            )}

            {/* ========== HOURLY WIN RATE SECTION ========== */}
            <div className="flex justify-center mb-8 mt-12">
              <div className="h-1 w-[90%] bg-slate-100 rounded-full"></div>
            </div>

            <div className="flex flex-col items-center gap-2 mb-6">
              <h2 className="text-3xl font-bold text-slate-100 whitespace-nowrap">
                Best Time to Play
              </h2>
              <p className="text-slate-400 text-lg italic">Are you an early riser or a night owl?</p>
            </div>

            {data.hourly_stats && data.hourly_stats.length > 0 ? (
              <div className="bg-slate-100 border border-slate-300 p-6 rounded-xl shadow-sm">
                <h2 className="text-xl font-bold mb-6 text-slate-800 text-center">Win Rate by Time of Day</h2>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="99%" height={320}>
                    <BarChart data={data.hourly_stats}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ccc" />
                      <XAxis
                        dataKey="hour_group"
                        stroke="#475569"
                        tick={{fill: '#475569'}}
                        tickFormatter={(group) => {
                          const start = group * 2;
                          return `${start}h-${start + 2}h`;
                        }}
                      />
                      <YAxis
                        stroke="#475569"
                        tick={{fill: '#475569'}}
                      />
                      <Tooltip
                        cursor={{fill: '#f1f5f9'}}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const d = payload[0].payload;
                            const isSignificant = d.sample_size >= 50;
                            const color = !isSignificant ? '#9ca3af' : d.win_rate >= 55 ? '#16a34a' : d.win_rate >= 50 ? '#4ade80' : d.win_rate >= 45 ? '#f87171' : '#dc2626';
                            const formatHour = (h: number) => h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
                            const timeLabel = `${formatHour(d.start_hour)} - ${formatHour(d.end_hour + 1)}`;
                            return (
                              <div className="bg-white p-3 border border-slate-200 shadow-xl rounded text-sm text-slate-800">
                                <p className="font-bold text-base mb-1">{timeLabel}</p>
                                <p>Win Rate: <span className="font-mono font-bold" style={{color}}>{d.win_rate}%</span></p>
                                <p>Games played: <span className="font-mono">{formatNumber(d.sample_size)}</span></p>
                                {!isSignificant && <p className="text-slate-400 italic text-xs mt-1">Not statistically significant (&lt;50 games)</p>}
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="sample_size" radius={[4, 4, 0, 0]}>
                        {data.hourly_stats.map((entry, index) => {
                          const isSignificant = entry.sample_size >= 50;
                          const color = !isSignificant ? '#d1d5db' : entry.win_rate >= 55 ? '#16a34a' : entry.win_rate >= 50 ? '#4ade80' : entry.win_rate >= 45 ? '#f87171' : '#dc2626';
                          return <Cell key={`cell-${index}`} fill={color} />;
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {/* Legend */}
                <div className="mt-4 flex flex-wrap justify-center gap-4 text-sm text-slate-700">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded" style={{backgroundColor: '#16a34a'}}></div>
                    <span>≥55%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded" style={{backgroundColor: '#4ade80'}}></div>
                    <span>50-55%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded" style={{backgroundColor: '#f87171'}}></div>
                    <span>45-50%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded" style={{backgroundColor: '#dc2626'}}></div>
                    <span>&lt;45%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded" style={{backgroundColor: '#d1d5db'}}></div>
                    <span className="italic">Not significant (&lt;50 games)</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-100 border border-slate-300 p-6 rounded-xl shadow-sm">
                <h2 className="text-xl font-bold mb-6 text-slate-800 text-center">Win Rate by Time of Day</h2>
                <p className="text-slate-500 italic text-center">Not enough data to display.</p>
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
const OpeningsChart = ({ data }: { data: OpeningData[] }) => {
  if (!data || data.length === 0) return <p className="text-slate-500 italic text-center">No data available.</p>;

  return (
    <div className="h-[500px] w-full">
      <ResponsiveContainer width="99%" height={320}>
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
  // Format month from "2024-01" to "January 2024"
  const formatProgressMonth = (month: string) => {
    if (!month) return null;
    const [year, monthNum] = month.split('-');
    const date = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
    const monthName = date.toLocaleString('en-US', { month: 'long' });
    return `${monthName} ${year}`;
  };

  // Handle cached data - show brief loading message
  if (progress?.cached) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <Loader2 className="animate-spin w-10 h-10 text-blue-500" />
        <div className="text-slate-300 text-lg">Loading...</div>
      </div>
    );
  }

  const percentage = progress && progress.total > 0 ? (progress.current / progress.total) * 100 : 0;
  const formattedMonth = formatProgressMonth(progress?.month || '');

  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <Loader2 className="animate-spin w-10 h-10 text-blue-500" />
      <div className="text-slate-300 text-lg">
        {formattedMonth ? `Fetching data from ${formattedMonth}...` : 'Fetching data from...'}
      </div>
      {progress && progress.total > 0 && (
        <>
          <div className="w-64 h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <div className="text-slate-400 text-sm">
            {progress.current} / {progress.total} months processed
          </div>
        </>
      )}
    </div>
  );
};

export default App;