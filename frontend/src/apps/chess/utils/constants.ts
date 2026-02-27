// Chess app constants

import type { ProPlayer, SavedPlayer } from './types';
import { fetchChessGoal, saveChessGoal, fetchChessUserPrefs, saveOnboardingDone } from '../hooks/api';
import type { TimeClass } from './types';

// localStorage helpers for chess preferences (username + time class)
export const CHESS_PREFS_KEY = 'chess_preferences';

interface ChessPrefs {
  chess_username: string | null;
  preferred_time_class: string | null;
  onboarding_done: boolean;
  elo_goal: number | null;
  elo_goal_start_elo: number | null;
  elo_goal_start_date: string | null;
  elo_goal_months: number;
}

const DEFAULT_PREFS: ChessPrefs = { chess_username: null, preferred_time_class: null, onboarding_done: false, elo_goal: null, elo_goal_start_elo: null, elo_goal_start_date: null, elo_goal_months: 3 };

export const getChessPrefs = (): ChessPrefs => {
  try {
    const saved = localStorage.getItem(CHESS_PREFS_KEY);
    if (!saved) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...JSON.parse(saved) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
};

export const saveChessPrefs = (prefs: Partial<ChessPrefs>) => {
  try {
    const current = getChessPrefs();
    const merged = { ...current, ...prefs };
    localStorage.setItem(CHESS_PREFS_KEY, JSON.stringify(merged));
    window.dispatchEvent(new Event('chess-prefs-change'));

    // Sync goal to server if goal fields changed and we have a username
    const goalChanged = 'elo_goal' in prefs || 'elo_goal_start_elo' in prefs || 'elo_goal_start_date' in prefs || 'elo_goal_months' in prefs;
    const timeClass = (merged.preferred_time_class || 'rapid') as TimeClass;
    if (goalChanged && merged.chess_username && merged.elo_goal && merged.elo_goal_start_elo && merged.elo_goal_start_date) {
      saveChessGoal(merged.chess_username, timeClass, {
        elo_goal: merged.elo_goal,
        elo_goal_start_elo: merged.elo_goal_start_elo,
        elo_goal_start_date: merged.elo_goal_start_date,
        elo_goal_months: merged.elo_goal_months,
      }).catch(() => { /* silent — localStorage is the fallback */ });
    }

    // Sync onboarding_done to server
    if ('onboarding_done' in prefs && prefs.onboarding_done && merged.chess_username) {
      saveOnboardingDone(merged.chess_username, timeClass).catch(() => {});
    }

    // Sync preferred_time_class to server (if changed independently of onboarding)
    if ('preferred_time_class' in prefs && merged.chess_username && merged.onboarding_done) {
      saveOnboardingDone(merged.chess_username, timeClass).catch(() => {});
    }
  } catch {
    // Ignore localStorage errors
  }
};

/** Load goal from server and merge into localStorage. Call on username search or page mount. */
export const syncGoalFromServer = async (username: string, timeClass: TimeClass) => {
  try {
    const goal = await fetchChessGoal(username, timeClass);
    const current = getChessPrefs();
    if (goal) {
      localStorage.setItem(CHESS_PREFS_KEY, JSON.stringify({ ...current, ...goal }));
      window.dispatchEvent(new Event('chess-prefs-change'));
    } else if (current.elo_goal !== null) {
      // Server has no goal (deleted) — clear local goal
      localStorage.setItem(CHESS_PREFS_KEY, JSON.stringify({
        ...current,
        elo_goal: null,
        elo_goal_start_elo: null,
        elo_goal_start_date: null,
        elo_goal_months: 3,
      }));
      window.dispatchEvent(new Event('chess-prefs-change'));
    }
  } catch {
    // silent — use whatever localStorage has
  }
};

/** Check server for onboarding status and preferences, merge into localStorage. */
export const syncOnboardingFromServer = async (username: string) => {
  try {
    const serverPrefs = await fetchChessUserPrefs(username);
    if (serverPrefs.onboarding_done) {
      const current = getChessPrefs();
      const updates: Partial<ChessPrefs> = {};
      if (!current.onboarding_done) updates.onboarding_done = true;
      if (serverPrefs.preferred_time_class && !current.preferred_time_class) {
        updates.preferred_time_class = serverPrefs.preferred_time_class;
      }
      if (Object.keys(updates).length > 0) {
        localStorage.setItem(CHESS_PREFS_KEY, JSON.stringify({ ...current, ...updates }));
        window.dispatchEvent(new Event('chess-prefs-change'));
      }
    }
  } catch {
    // silent
  }
};

// localStorage helpers for username history
export const STORAGE_KEY = 'chess_stats_usernames';
export const MAX_USERNAMES = 10;

export const getSavedPlayers = (): SavedPlayer[] => {
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

export const savePlayer = (username: string, avatar: string | null) => {
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

export const removePlayer = (username: string) => {
  try {
    const existing = getSavedPlayers();
    const filtered = existing.filter(p => p.username.toLowerCase() !== username.toLowerCase());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch {
    // Ignore localStorage errors
  }
};

// Top 3 FIDE rated players with their tips and videos
export const PRO_PLAYERS: ProPlayer[] = [
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
