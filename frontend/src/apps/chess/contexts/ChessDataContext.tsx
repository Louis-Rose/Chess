// Chess data context - manages all chess-related state

import { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useStreamingStats } from '../hooks/useStreamingStats';
import { fetchYouTubeVideos, fetchFatigueAnalysis } from '../hooks/api';
import { getSavedPlayers, savePlayer, getChessPrefs, saveChessPrefs } from '../utils/constants';
import type {
  TimeClass,
  SavedPlayer,
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

  // Data
  data: ApiResponse | null;
  loading: boolean;
  error: string;
  progress: StreamProgress | null;
  myPlayerData: ApiResponse | null;

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

  // UI state
  const [usernameInput, setUsernameInput] = useState(prefs.chess_username || '');
  const [searchedUsername, setSearchedUsername] = useState(prefs.chess_username || '');
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

      const savedUsername = getChessPrefs().chess_username;

      // If this matches the saved chess username, update myPlayerData
      if (savedUsername?.toLowerCase() === data.player.username.toLowerCase()) {
        setMyPlayerData(data);
      }

      // First-time user: save their first search as their username
      if (!savedUsername && !myPlayerData) {
        saveChessPrefs({ chess_username: data.player.username });
        setMyPlayerData(data);
      }
    }
  }, [data?.player, myPlayerData]);

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
    saveChessPrefs({ preferred_time_class: newTimeClass });
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
    data,
    loading,
    error,
    progress,
    myPlayerData,
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
