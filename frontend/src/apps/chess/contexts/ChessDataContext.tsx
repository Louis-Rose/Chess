// Chess data context - manages all chess-related state

import { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useStreamingStats } from '../hooks/useStreamingStats';
import { fetchYouTubeVideos, fetchFatigueAnalysis } from '../hooks/api';
import posthog from 'posthog-js';
import { getSavedPlayers, savePlayer, removePlayer, getChessPrefs, saveChessPrefs, syncGoalFromServer, syncOnboardingFromServer } from '../utils/constants';

const POSTHOG_EXCLUDED_CHESS_USERNAMES = ['akyrosu'];
const checkPostHogExclusion = (username: string) => {
  if (POSTHOG_EXCLUDED_CHESS_USERNAMES.includes(username.toLowerCase())) {
    posthog.opt_out_capturing();
    try { localStorage.setItem('posthog-excluded', 'true'); } catch {}
  }
};
import type {
  TimeClass,
  SavedPlayer,
  PlayerData,
  ApiResponse,
  VideoData,
  FatigueAnalysis,
  OpeningData,
  StreamProgress
} from '../utils/types';

interface ChessDataContextType {
  // UI State
  usernameInput: string;
  setUsernameInput: (value: string) => void;
  searchedUsername: string;
  setSearchedUsername: (value: string) => void;
  selectedTimeClass: TimeClass;
  setSelectedTimeClass: (value: TimeClass) => void;
  selectedOpening: string;
  setSelectedOpening: (value: string) => void;
  selectedPro: string;
  setSelectedPro: (value: string) => void;

  // Username dropdown
  savedPlayers: SavedPlayer[];
  showUsernameDropdown: boolean;
  setShowUsernameDropdown: (value: boolean) => void;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  handleSelectSavedUsername: (player: SavedPlayer) => void;
  handleRemoveSavedPlayer: (username: string) => void;

  // Player info (lightweight, for onboarding)
  playerInfo: PlayerData | null;
  playerInfoLoading: boolean;
  playerInfoError: string;

  // Data
  data: ApiResponse | null;
  loading: boolean;
  error: string;
  progress: StreamProgress | null;
  myPlayerData: ApiResponse | null;

  // Actions
  triggerFullFetch: () => void;

  // YouTube videos
  videos: VideoData[];
  videosLoading: boolean;
  videosError: Error | null;

  // Fatigue analysis
  fatigueAnalysis: FatigueAnalysis | undefined;
  fatigueLoading: boolean;
  fatigueError: Error | null;
  handleAnalyzeFatigue: () => void;

  // Processed data
  processedHistory: Array<{ date: string; games_played: number; periodLabel: string }> | undefined;
  processedEloHistory: Array<{ date: string; elo: number; periodLabel: string }> | undefined;
  allOpenings: Array<OpeningData & { side: 'White' | 'Black' }>;

  // Actions
  handleSubmit: (e: React.FormEvent) => void;
  handleTimeClassChange: (newTimeClass: TimeClass) => void;
  handleOpeningSelect: (value: string) => void;
}

const ChessDataContext = createContext<ChessDataContextType | null>(null);

export function useChessData() {
  const context = useContext(ChessDataContext);
  if (!context) {
    throw new Error('useChessData must be used within a ChessDataProvider');
  }
  return context;
}


interface ChessDataProviderProps {
  children: ReactNode;
}

export function ChessDataProvider({ children }: ChessDataProviderProps) {
  // Load saved preferences from localStorage on init
  const prefs = getChessPrefs();
  if (prefs.chess_username) checkPostHogExclusion(prefs.chess_username);

  // UI state — don't pre-fill the search bar during onboarding
  const [usernameInput, setUsernameInput] = useState(prefs.onboarding_done ? (prefs.chess_username || '') : '');
  const [searchedUsername, setSearchedUsername] = useState(prefs.onboarding_done ? (prefs.chess_username || '') : '');
  const [selectedOpening, setSelectedOpening] = useState<string>('');
  const [selectedTimeClass, setSelectedTimeClass] = useState<TimeClass>((prefs.preferred_time_class as TimeClass) || 'rapid');
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

  // Lightweight player info (for onboarding)
  const [playerInfo, setPlayerInfo] = useState<PlayerData | null>(null);
  const [playerInfoLoading, setPlayerInfoLoading] = useState(false);
  const [playerInfoError, setPlayerInfoError] = useState('');

  const fetchPlayerInfo = async (username: string) => {
    setPlayerInfoLoading(true);
    setPlayerInfoError('');
    try {
      const res = await fetch(`/api/player-info?username=${encodeURIComponent(username)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch player info');
      setPlayerInfo(json.player);
      setUsernameInput(json.player.username);
      savePlayer(json.player.username, json.player.avatar);
      setSavedPlayers(getSavedPlayers());
      const savedUsername = getChessPrefs().chess_username;
      if (!savedUsername) {
        saveChessPrefs({ chess_username: json.player.username });
        checkPostHogExclusion(json.player.username);
      }
    } catch (e) {
      setPlayerInfoError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setPlayerInfoLoading(false);
    }
  };

  // Player stats with streaming progress
  const {
    data,
    loading,
    error: statsError,
    progress,
    fetchStats
  } = useStreamingStats(searchedUsername, selectedTimeClass);

  // Trigger full stats fetch (called after onboarding)
  const triggerFullFetch = () => {
    if (searchedUsername) {
      fetchStats();
    }
  };

  // YouTube videos query - cached by opening + side
  const [openingName, openingSide] = selectedOpening ? selectedOpening.split('-') : ['', ''];
  const {
    data: videos = [],
    isLoading: videosLoading,
    error: videosError,
  } = useQuery({
    queryKey: ['youtubeVideos', openingName, openingSide],
    queryFn: () => fetchYouTubeVideos(openingName, openingSide),
    enabled: !!selectedOpening,
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

  // Counter to re-trigger the fetch useEffect after async onboarding sync
  const [fetchTrigger, setFetchTrigger] = useState(0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (usernameInput.trim()) {
      const username = usernameInput.trim();
      setSearchedUsername(username);
      setShowUsernameDropdown(false);
      (document.activeElement as HTMLElement)?.blur();
      window.scrollTo({ top: 0 });
      // Check server for onboarding status before deciding
      if (!getChessPrefs().onboarding_done) {
        await syncOnboardingFromServer(username);
        const updated = getChessPrefs();
        if (updated.preferred_time_class) {
          setSelectedTimeClass(updated.preferred_time_class as TimeClass);
        }
        // Bump trigger so the fetch useEffect re-runs with updated onboarding state
        setFetchTrigger(n => n + 1);
      }
      if (!getChessPrefs().onboarding_done) {
        fetchPlayerInfo(username);
      }
    }
  };

  // On mount: sync prefs from server if needed
  useEffect(() => {
    if (prefs.chess_username && !prefs.onboarding_done) {
      // Onboarding not done locally — check server
      syncOnboardingFromServer(prefs.chess_username).then(() => {
        const updated = getChessPrefs();
        if (updated.onboarding_done) {
          // Server confirmed onboarding is done — restore state
          setUsernameInput(prefs.chess_username!);
          setSearchedUsername(prefs.chess_username!);
          if (updated.preferred_time_class) {
            setSelectedTimeClass(updated.preferred_time_class as TimeClass);
          }
          setFetchTrigger(n => n + 1);
        }
      });
    } else if (prefs.chess_username && prefs.onboarding_done && !prefs.preferred_time_class) {
      // Already onboarded but missing time class (new feature) — sync from server
      syncOnboardingFromServer(prefs.chess_username).then(() => {
        const updated = getChessPrefs();
        if (updated.preferred_time_class) {
          setSelectedTimeClass(updated.preferred_time_class as TimeClass);
        }
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Trigger full fetch when username changes or after onboarding sync (only after onboarding)
  // Time class changes are handled by useStreamingStats' internal useEffect (localStorage swap or SSE)
  useEffect(() => {
    if (searchedUsername && getChessPrefs().onboarding_done) {
      fetchStats();
    }
  }, [searchedUsername, fetchTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save player with avatar after successful fetch
  useEffect(() => {
    if (data?.player) {
      // Use API's correctly-cased username
      setSearchedUsername(data.player.username);
      setUsernameInput(data.player.username);
      savePlayer(data.player.username, data.player.avatar);
      setSavedPlayers(getSavedPlayers());

      const savedUsername = getChessPrefs().chess_username;

      // If this matches the saved chess username, update myPlayerData
      if (savedUsername?.toLowerCase() === data.player.username.toLowerCase()) {
        setMyPlayerData(data);
      }

      // First-time user: save their first search as their username
      if (!savedUsername && !myPlayerData) {
        saveChessPrefs({ chess_username: data.player.username });
        checkPostHogExclusion(data.player.username);
        setMyPlayerData(data);
      }

      // Sync goal from server (merges into localStorage if server has a goal)
      syncGoalFromServer(data.player.username, selectedTimeClass);
    }
  }, [data?.player, myPlayerData]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectSavedUsername = async (player: SavedPlayer) => {
    setUsernameInput(player.username);
    setSearchedUsername(player.username);
    setShowUsernameDropdown(false);
    (document.activeElement as HTMLElement)?.blur();
    if (!getChessPrefs().onboarding_done) {
      await syncOnboardingFromServer(player.username);
      const updated = getChessPrefs();
      if (updated.preferred_time_class) {
        setSelectedTimeClass(updated.preferred_time_class as TimeClass);
      }
      setFetchTrigger(n => n + 1);
    }
    if (!getChessPrefs().onboarding_done) {
      fetchPlayerInfo(player.username);
    }
  };

  const handleRemoveSavedPlayer = (username: string) => {
    removePlayer(username);
    setSavedPlayers(getSavedPlayers());
  };

  const handleOpeningSelect = (value: string) => {
    setSelectedOpening(value);
  };

  const handleTimeClassChange = (newTimeClass: TimeClass) => {
    setSelectedTimeClass(newTimeClass);
    saveChessPrefs({ preferred_time_class: newTimeClass });
    // Sync goal for the new time class
    if (searchedUsername) {
      syncGoalFromServer(searchedUsername, newTimeClass);
    }
  };

  // Pre-process the history data to include the label directly
  const processedHistory = data?.history.map(item => ({
    ...item,
    periodLabel: item.date ?? ''
  }));

  // Pre-process the Elo history data
  const processedEloHistory = data?.elo_history.map(item => ({
    ...item,
    periodLabel: item.date ?? ''
  }));

  // Get all openings for dropdown
  const allOpenings = data ? [
    ...data.openings.white.map(o => ({ ...o, side: 'White' as const })),
    ...data.openings.black.map(o => ({ ...o, side: 'Black' as const }))
  ] : [];

  const value: ChessDataContextType = {
    usernameInput,
    setUsernameInput,
    searchedUsername,
    setSearchedUsername,
    selectedTimeClass,
    setSelectedTimeClass,
    selectedOpening,
    setSelectedOpening,
    selectedPro,
    setSelectedPro,
    savedPlayers,
    showUsernameDropdown,
    setShowUsernameDropdown,
    dropdownRef,
    handleSelectSavedUsername,
    handleRemoveSavedPlayer,
    playerInfo,
    playerInfoLoading,
    playerInfoError,
    data,
    loading,
    error,
    progress,
    myPlayerData,
    triggerFullFetch,
    videos,
    videosLoading,
    videosError: videosError as Error | null,
    fatigueAnalysis,
    fatigueLoading,
    fatigueError: fatigueError as Error | null,
    handleAnalyzeFatigue,
    processedHistory,
    processedEloHistory,
    allOpenings,
    handleSubmit,
    handleTimeClassChange,
    handleOpeningSelect,
  };

  return (
    <ChessDataContext.Provider value={value}>
      {children}
    </ChessDataContext.Provider>
  );
}
