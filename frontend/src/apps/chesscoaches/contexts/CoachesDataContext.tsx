// Coaches data context - lightweight, handles Chess.com username login only

import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';

interface SavedPlayer {
  username: string;
  avatar: string | null;
}

interface PlayerData {
  name: string;
  username: string;
  avatar: string | null;
  followers: number;
  joined: number;
  rapid_rating?: number | null;
  blitz_rating?: number | null;
  bullet_rating?: number | null;
}

const PREFS_KEY = 'coaches_preferences';
const PLAYERS_KEY = 'coaches_saved_players';

interface CoachesPrefs {
  chess_username: string | null;
  onboarding_done: boolean;
}

const DEFAULT_PREFS: CoachesPrefs = { chess_username: null, onboarding_done: false };

const getPrefs = (): CoachesPrefs => {
  try {
    const saved = localStorage.getItem(PREFS_KEY);
    if (!saved) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...JSON.parse(saved) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
};

const savePrefs = (prefs: Partial<CoachesPrefs>) => {
  try {
    const current = getPrefs();
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...current, ...prefs }));
    window.dispatchEvent(new Event('coaches-prefs-change'));
  } catch {}
};

const getSavedPlayers = (): SavedPlayer[] => {
  try {
    const saved = localStorage.getItem(PLAYERS_KEY);
    if (!saved) return [];
    return JSON.parse(saved);
  } catch {
    return [];
  }
};

const savePlayer = (username: string, avatar: string | null) => {
  try {
    const existing = getSavedPlayers();
    const filtered = existing.filter(p => p.username.toLowerCase() !== username.toLowerCase());
    const updated = [{ username, avatar }, ...filtered].slice(0, 10);
    localStorage.setItem(PLAYERS_KEY, JSON.stringify(updated));
  } catch {}
};

const removePlayer = (username: string) => {
  try {
    const existing = getSavedPlayers();
    localStorage.setItem(PLAYERS_KEY, JSON.stringify(existing.filter(p => p.username.toLowerCase() !== username.toLowerCase())));
  } catch {}
};

interface CoachesDataContextType {
  usernameInput: string;
  setUsernameInput: (value: string) => void;
  savedPlayers: SavedPlayer[];
  showUsernameDropdown: boolean;
  setShowUsernameDropdown: (value: boolean) => void;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  handleSelectSavedUsername: (player: SavedPlayer) => void;
  handleRemoveSavedPlayer: (username: string) => void;
  playerInfo: PlayerData | null;
  playerInfoLoading: boolean;
  playerInfoError: string;
  handleSubmit: (e: React.FormEvent) => void;
  onboardingDone: boolean;
  completeOnboarding: () => void;
}

const CoachesDataContext = createContext<CoachesDataContextType | null>(null);

export function useCoachesData() {
  const context = useContext(CoachesDataContext);
  if (!context) throw new Error('useCoachesData must be used within a CoachesDataProvider');
  return context;
}

export { getPrefs as getCoachesPrefs, savePrefs as saveCoachesPrefs };

export function CoachesDataProvider({ children }: { children: ReactNode }) {
  const prefs = getPrefs();

  const [usernameInput, setUsernameInput] = useState(prefs.onboarding_done ? (prefs.chess_username || '') : '');
  const [onboardingDone, setOnboardingDone] = useState(prefs.onboarding_done && !!prefs.chess_username);
  const [savedPlayers, setSavedPlayers] = useState<SavedPlayer[]>([]);
  const [showUsernameDropdown, setShowUsernameDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [playerInfo, setPlayerInfo] = useState<PlayerData | null>(null);
  const [playerInfoLoading, setPlayerInfoLoading] = useState(false);
  const [playerInfoError, setPlayerInfoError] = useState('');

  useEffect(() => { setSavedPlayers(getSavedPlayers()); }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node))
        setShowUsernameDropdown(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchPlayerInfo = useCallback(async (username: string) => {
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
      const saved = getPrefs().chess_username;
      if (!saved) savePrefs({ chess_username: json.player.username });
    } catch (e) {
      setPlayerInfoError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setPlayerInfoLoading(false);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (usernameInput.trim()) {
      setShowUsernameDropdown(false);
      (document.activeElement as HTMLElement)?.blur();
      fetchPlayerInfo(usernameInput.trim());
    }
  };

  const handleSelectSavedUsername = (player: SavedPlayer) => {
    setUsernameInput(player.username);
    setShowUsernameDropdown(false);
    (document.activeElement as HTMLElement)?.blur();
    fetchPlayerInfo(player.username);
  };

  const handleRemoveSavedPlayer = (username: string) => {
    removePlayer(username);
    setSavedPlayers(getSavedPlayers());
  };

  const completeOnboarding = () => {
    savePrefs({ onboarding_done: true, chess_username: playerInfo?.username || usernameInput.trim() });
    setOnboardingDone(true);
  };

  return (
    <CoachesDataContext.Provider value={{
      usernameInput, setUsernameInput,
      savedPlayers, showUsernameDropdown, setShowUsernameDropdown, dropdownRef,
      handleSelectSavedUsername, handleRemoveSavedPlayer,
      playerInfo, playerInfoLoading, playerInfoError,
      handleSubmit, onboardingDone, completeOnboarding,
    }}>
      {children}
    </CoachesDataContext.Provider>
  );
}
