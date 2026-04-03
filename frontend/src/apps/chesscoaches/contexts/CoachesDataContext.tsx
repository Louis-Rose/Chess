// Coaches data context — holds all panel state so it persists across tab switches

import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../../../contexts/AuthContext';

// ── Shared types ──

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

// ── Diagram types ──

export interface DiagramModelResult {
  name: string;
  fen?: string;
  error?: string;
  elapsed: number;
}

export interface DiagramState {
  preview: string | null;
  imageFile: File | null;
  models: { id: string; name: string; avg_elapsed?: number | null }[];
  modelResults: Record<string, DiagramModelResult>;
  analyzing: boolean;
  error: string;
}

const DIAGRAM_INITIAL: DiagramState = {
  preview: null, imageFile: null, models: [], modelResults: {}, analyzing: false, error: '',
};

// ── Scoresheet types ──

export interface ScoresheetMove {
  number: number;
  white: string;
  black?: string;
  white_legal?: boolean;
  black_legal?: boolean;
  white_reason?: string;
  black_reason?: string;
  white_confidence?: 'high' | 'medium' | 'low';
  black_confidence?: 'high' | 'medium' | 'low';
}

export interface ScoresheetResult {
  white_player: string;
  black_player: string;
  event: string;
  date: string;
  result: string;
  moves: ScoresheetMove[];
}

export interface ScoresheetModelResult {
  name: string;
  result?: ScoresheetResult;
  error?: string;
  elapsed: number;
  warnings?: string[];
  rereading?: boolean;
  tier?: string;
  retry?: { free_error: string; free_elapsed: number };
}

export interface ScoresheetReadEntry {
  moves: ScoresheetMove[];
  elapsed: number;
  warnings?: string[];
  error?: string;
  rereading?: boolean;
  corrections?: Set<string>;
}

export interface ScoresheetAzureResult {
  moves: ScoresheetMove[];
  elapsed: number;
  loading: boolean;
  error?: string;
  rawLines?: string[];
  rawTables?: { index: number; rowCount: number; columnCount: number; rows: string[][] }[];
}

export interface ScoresheetState {
  preview: string | null;
  fileName: string | null;
  imageFile: File | null;
  error: string;
  modelResults: Record<string, ScoresheetModelResult>;
  reReads: Record<string, ScoresheetReadEntry[]>;
  models: { id: string; name: string; avg_elapsed?: number | null }[];
  startTime: number | null;
  analyzing: boolean;
  azureResult: ScoresheetAzureResult | null;
  azureGrid: { top: number; bottom: number; tilt: number; col_dividers: number[]; col_count?: number; row_count?: number; first_move_row?: number; cells?: Record<string, { x1: number; y1: number; x2: number; y2: number }> } | null;
}

const SCORESHEET_INITIAL: ScoresheetState = {
  preview: null, fileName: null, imageFile: null, error: '',
  modelResults: {}, reReads: {}, models: [],
  startTime: null, analyzing: false, azureResult: null, azureGrid: null,
};

// ── Mistakes types ──

export interface ParsedMove {
  number: number;
  side: 'white' | 'black';
  san: string;
  clk: number;
  timeSpent: number;
  remainingBefore: number;
  fractionSpent: number;
}

export interface Mistake {
  move: ParsedMove;
  percentSpent: number;
}

export interface GameHeader {
  white: string;
  black: string;
  event: string;
  date: string;
  result: string;
  timeControl: string;
}

export interface MistakesState {
  pgnText: string;
  fileName: string;
  mistakes: Mistake[] | null;
  gameHeaders: GameHeader | null;
  allMoves: ParsedMove[];
  error: string;
  expandedMistake: number | null;
}

const MISTAKES_INITIAL: MistakesState = {
  pgnText: '', fileName: '', mistakes: null, gameHeaders: null, allMoves: [], error: '', expandedMistake: null,
};

// ── Preferences ──

const PREFS_KEY = 'coaches_preferences';
const PLAYERS_KEY = 'coaches_saved_players';

interface CoachesPrefs {
  chess_username: string | null;
  lichess_username: string | null;
  onboarding_done: boolean;
  lesson_rate: number | null;
  lesson_currency: string;
  scoresheet_success: boolean;
}

const DEFAULT_PREFS: CoachesPrefs = { chess_username: null, lichess_username: null, onboarding_done: false, lesson_rate: null, lesson_currency: 'EUR', scoresheet_success: false };

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

// ── Context type ──

interface CoachesDataContextType {
  // Onboarding / player
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

  // Scoresheet panel
  scoresheet: ScoresheetState;
  scoresheetSetImage: (file: File, preview: string, fileName: string) => void;
  scoresheetStartOneRead: () => void;
  scoresheetHandleEditSave: (modelId: string, readIdx: number, confirmed: ScoresheetMove[], correctionKey: string) => void;
  scoresheetReread: (modelId: string) => void;
  scoresheetCancel: () => void;
  scoresheetClear: () => void;

  // Diagram panel
  diagram: DiagramState;
  diagramSetImage: (file: File, preview: string) => void;
  diagramAnalyze: () => void;
  diagramClear: () => void;

  // Mistakes panel
  mistakes: MistakesState;
  mistakesSetFile: (pgnText: string, fileName: string) => void;
  mistakesAnalyze: (parseFn: (pgn: string) => { headers: GameHeader; moves: ParsedMove[] } | null, findFn: (moves: ParsedMove[], threshold: number) => Mistake[], noClockMsg: string) => void;
  mistakesClear: () => void;
  mistakesSetExpanded: (idx: number | null) => void;
}

const CoachesDataContext = createContext<CoachesDataContextType | null>(null);

export function useCoachesData() {
  const context = useContext(CoachesDataContext);
  if (!context) throw new Error('useCoachesData must be used within a CoachesDataProvider');
  return context;
}

export { getPrefs as getCoachesPrefs, savePrefs as saveCoachesPrefs };

// Check URL for ?u= param (used to transfer username between browsers)
function getUrlUsername(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const u = params.get('u');
    if (u) {
      const url = new URL(window.location.href);
      url.searchParams.delete('u');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
      return u;
    }
  } catch {}
  return null;
}

export function CoachesDataProvider({ children }: { children: ReactNode }) {
  const prefs = getPrefs();
  const urlUsername = getUrlUsername();

  if (urlUsername && !prefs.chess_username) {
    prefs.chess_username = urlUsername;
    prefs.onboarding_done = true;
    savePrefs(prefs);
  }

  // ── Onboarding / player state ──
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

  useEffect(() => {
    if (prefs.onboarding_done && prefs.chess_username) {
      fetchPlayerInfo(prefs.chess_username);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Scoresheet state ──
  const [scoresheet, setScoresheet] = useState<ScoresheetState>(SCORESHEET_INITIAL);
  const scoresheetAnalyzeAbortRef = useRef<AbortController | null>(null);
  const retryInfoRef = useRef<Record<string, { free_error: string; free_elapsed: number }>>({});

  // ── Clear scoresheet on logout ──
  const { user } = useAuth();
  const prevUserRef = useRef(user);
  useEffect(() => {
    if (prevUserRef.current && !user) {
      if (scoresheetAnalyzeAbortRef.current) { scoresheetAnalyzeAbortRef.current.abort(); scoresheetAnalyzeAbortRef.current = null; }
      setScoresheet(SCORESHEET_INITIAL);
    }
    prevUserRef.current = user;
  }, [user]);

  const scoresheetSetImage = useCallback((file: File, preview: string, fileName: string) => {
    setScoresheet({ ...SCORESHEET_INITIAL, preview, imageFile: file, fileName });
  }, []);

  const scoresheetClear = useCallback(() => {
    if (scoresheetAnalyzeAbortRef.current) { scoresheetAnalyzeAbortRef.current.abort(); scoresheetAnalyzeAbortRef.current = null; }
    setScoresheet(SCORESHEET_INITIAL);
  }, []);

  const scoresheetDoReread = useCallback(async (file: File, modelId: string, confirmedMoves: ScoresheetMove[], signal?: AbortSignal) => {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('confirmed_moves', JSON.stringify(confirmedMoves));
    formData.append('model_id', modelId);
    try {
      const res = await fetch('/api/coaches/reread-scoresheet', { method: 'POST', body: formData, signal });
      if (res.ok) {
        const json = await res.json();
        return { moves: json.result.moves as ScoresheetMove[], elapsed: json.elapsed as number, warnings: json.warnings as string[] | undefined };
      }
    } catch { /* ignore */ }
    return null;
  }, []);

  const scoresheetHandleEditSave = useCallback(async (modelId: string, _readIdx: number, confirmed: ScoresheetMove[], correctionKey: string) => {
    // Update the model result in-place (no re-read)
    const prevCorrections = new Set<string>();
    setScoresheet(prev => {
      const mr = prev.modelResults[modelId];
      if (!mr?.result) return prev;
      const corr = new Set<string>(prev.reReads[modelId]?.[0]?.corrections);
      corr.add(correctionKey);
      corr.forEach(c => prevCorrections.add(c));
      return {
        ...prev,
        modelResults: {
          ...prev.modelResults,
          [modelId]: { ...mr, result: { ...mr.result, moves: confirmed } },
        },
        reReads: { ...prev.reReads, [modelId]: [{ moves: confirmed, elapsed: 0, rereading: false, corrections: corr }] },
      };
    });

    // Re-validate legality of all moves
    try {
      const res = await fetch('/api/coaches/validate-moves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moves: confirmed }),
      });
      if (res.ok) {
        const json = await res.json();
        setScoresheet(prev => {
          const mr = prev.modelResults[modelId];
          if (!mr?.result) return prev;
          return {
            ...prev,
            modelResults: {
              ...prev.modelResults,
              [modelId]: { ...mr, result: { ...mr.result, moves: json.moves } },
            },
            reReads: { ...prev.reReads, [modelId]: [{ ...prev.reReads[modelId]?.[0]!, moves: json.moves }] },
          };
        });
      }
    } catch { /* validation failed silently */ }
  }, []);

  const scoresheetReread = useCallback(async (modelId: string) => {
    const mr = scoresheet.modelResults[modelId];
    const confirmed = mr?.result?.moves;
    if (!confirmed) return;

    setScoresheet(prev => {
      const mr2 = prev.modelResults[modelId];
      if (!mr2) return prev;
      return {
        ...prev,
        modelResults: { ...prev.modelResults, [modelId]: { ...mr2, rereading: true } },
      };
    });

    const file = scoresheet.imageFile;
    if (!file) return;
    try {
      const result = await scoresheetDoReread(file, modelId, confirmed);
      if (result) {
        setScoresheet(prev => {
          const mr2 = prev.modelResults[modelId];
          if (!mr2) return prev;
          return {
            ...prev,
            modelResults: {
              ...prev.modelResults,
              [modelId]: { ...mr2, result: { ...mr2.result!, moves: result.moves }, elapsed: result.elapsed, rereading: false },
            },
            reReads: { ...prev.reReads, [modelId]: [{ ...prev.reReads[modelId]?.[0]!, moves: result.moves, elapsed: result.elapsed, rereading: false }] },
          };
        });
      } else {
        setScoresheet(prev => {
          const mr2 = prev.modelResults[modelId];
          if (!mr2) return prev;
          return {
            ...prev,
            modelResults: { ...prev.modelResults, [modelId]: { ...mr2, rereading: false, error: 'Re-read failed' } },
            reReads: { ...prev.reReads, [modelId]: [{ ...prev.reReads[modelId]?.[0]!, rereading: false, error: 'Re-read failed' }] },
          };
        });
      }
    } catch {
      setScoresheet(prev => {
        const mr2 = prev.modelResults[modelId];
        if (!mr2) return prev;
        return {
          ...prev,
          modelResults: { ...prev.modelResults, [modelId]: { ...mr2, rereading: false, error: 'Re-read failed' } },
          reReads: { ...prev.reReads, [modelId]: [{ ...prev.reReads[modelId]?.[0]!, rereading: false, error: 'Re-read failed' }] },
        };
      });
    }
  }, [scoresheet.imageFile, scoresheet.modelResults, scoresheetDoReread]);

  const scoresheetAnalyzeImage = useCallback(async (file: File, signal: AbortSignal) => {
    setScoresheet(prev => ({ ...prev, error: '', modelResults: {}, reReads: {}, models: [], analyzing: true }));
    retryInfoRef.current = {};
    try {
      const formData = new FormData();
      formData.append('image', file);
      console.log(`[Scoresheet] Uploading image: ${file.name} (${(file.size / 1024).toFixed(0)} KB, ${file.type})`);
      const res = await fetch('/api/coaches/read-scoresheet', { method: 'POST', body: formData, signal });
      console.log(`[Scoresheet] Upload complete, status: ${res.status}`);
      if (!res.ok) {
        const text = await res.text();
        try { const json = JSON.parse(text); throw new Error(json.error || 'Analysis failed'); }
        catch { throw new Error('Analysis failed'); }
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error('Streaming not supported');
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let payload;
          try { payload = JSON.parse(line.slice(6)); } catch { console.warn('[Scoresheet] Failed to parse SSE line:', line); continue; }
          console.log(`[Scoresheet] SSE event:`, payload.type, payload.model_id || '');
          if (payload.type === 'models') {
            setScoresheet(prev => ({ ...prev, models: payload.models, startTime: Date.now() }));
          } else if (payload.type === 'azure_grid') {
            setScoresheet(prev => ({ ...prev, azureGrid: payload.grid }));
          } else if (payload.type === 'retry') {
            // Store retry info — will be merged into modelResults when the final result arrives
            const { model_id, free_error, free_elapsed } = payload;
            retryInfoRef.current[model_id] = { free_error, free_elapsed };
            console.log(`[Scoresheet] ${model_id} retrying after free key failed (${free_elapsed}s)`);
          } else if (payload.type === 'result') {
            const { model_id, name, result, error: err, elapsed, warnings, tier, retry } = payload;
            const retryInfo = retry || retryInfoRef.current[model_id] || undefined;
            setScoresheet(prev => ({
              ...prev,
              modelResults: { ...prev.modelResults, [model_id]: { ...prev.modelResults[model_id], name, result, error: err, elapsed, warnings, tier, retry: retryInfo } },
            }));
          }
        }
      }
      console.log('[Scoresheet] SSE stream complete');
    } catch (e) {
      if (signal.aborted) { console.log('[Scoresheet] Cancelled by user'); return; }
      console.error('[Scoresheet] Error:', e);
      setScoresheet(prev => ({ ...prev, error: e instanceof Error ? e.message : 'Unknown error' }));
    } finally {
      setScoresheet(prev => ({ ...prev, analyzing: false }));
    }
  }, []);

  // Azure DI analysis — disabled, kept for future use
  // const scoresheetAnalyzeAzure = useCallback(async (file: File, signal: AbortSignal) => { ... }, []);

  const scoresheetCancel = useCallback(() => {
    console.log('[Scoresheet] Cancelling analysis...');
    if (scoresheetAnalyzeAbortRef.current) { scoresheetAnalyzeAbortRef.current.abort(); scoresheetAnalyzeAbortRef.current = null; }
    setScoresheet(prev => ({
      ...prev,
      analyzing: false,
      startTime: null,
      models: prev.models.map(m => {
        if (prev.modelResults[m.id]) return m;
        // Mark models without results as cancelled
        return m;
      }),
      modelResults: {
        ...prev.modelResults,
        ...Object.fromEntries(
          prev.models
            .filter(m => !prev.modelResults[m.id])
            .map(m => [m.id, { name: m.name, error: 'Cancelled', elapsed: 0 }])
        ),
      },
      azureResult: prev.azureResult?.loading ? { moves: [], elapsed: 0, loading: false, error: 'Cancelled' } : prev.azureResult,
    }));
  }, []);

  const scoresheetStartOneRead = useCallback(() => {
    const file = scoresheet.imageFile;
    if (!file) return;
    if (scoresheetAnalyzeAbortRef.current) scoresheetAnalyzeAbortRef.current.abort();
    const controller = new AbortController();
    scoresheetAnalyzeAbortRef.current = controller;
    setScoresheet(prev => ({ ...prev, modelResults: {}, reReads: {}, azureResult: null, azureGrid: null }));
    scoresheetAnalyzeImage(file, controller.signal);
  }, [scoresheet.imageFile, scoresheetAnalyzeImage]);


  // ── Diagram state ──
  const [diagram, setDiagram] = useState<DiagramState>(DIAGRAM_INITIAL);

  const diagramSetImage = useCallback((file: File, preview: string) => {
    setDiagram({ ...DIAGRAM_INITIAL, preview, imageFile: file });
  }, []);

  const diagramClear = useCallback(() => {
    setDiagram(DIAGRAM_INITIAL);
  }, []);

  const diagramAnalyze = useCallback(async () => {
    const file = diagram.imageFile;
    if (!file) return;

    setDiagram(prev => ({ ...prev, error: '', modelResults: {}, models: [], analyzing: true }));

    try {
      const formData = new FormData();
      formData.append('image', file);

      const res = await fetch('/api/coaches/read-diagram', { method: 'POST', body: formData });

      if (!res.ok) {
        const text = await res.text();
        try { const json = JSON.parse(text); throw new Error(json.error || 'Analysis failed'); }
        catch { throw new Error('Analysis failed'); }
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('Streaming not supported');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = JSON.parse(line.slice(6));

          if (payload.type === 'models') {
            setDiagram(prev => ({ ...prev, models: payload.models }));
          } else if (payload.type === 'result') {
            const { model_id, name, fen, error: err, elapsed } = payload;
            setDiagram(prev => ({
              ...prev,
              modelResults: { ...prev.modelResults, [model_id]: { name, fen, error: err, elapsed } },
            }));
          }
        }
      }
    } catch (e) {
      setDiagram(prev => ({ ...prev, error: e instanceof Error ? e.message : 'Unknown error' }));
    } finally {
      setDiagram(prev => ({ ...prev, analyzing: false }));
    }
  }, [diagram.imageFile]);

  // ── Mistakes state ──
  const [mistakesState, setMistakesState] = useState<MistakesState>(MISTAKES_INITIAL);

  const mistakesSetFile = useCallback((pgnText: string, fileName: string) => {
    setMistakesState({ ...MISTAKES_INITIAL, pgnText, fileName });
  }, []);

  const mistakesClear = useCallback(() => {
    setMistakesState(MISTAKES_INITIAL);
  }, []);

  const mistakesSetExpanded = useCallback((idx: number | null) => {
    setMistakesState(prev => ({ ...prev, expandedMistake: idx }));
  }, []);

  const mistakesAnalyze = useCallback((
    parseFn: (pgn: string) => { headers: GameHeader; moves: ParsedMove[] } | null,
    findFn: (moves: ParsedMove[], threshold: number) => Mistake[],
    noClockMsg: string,
  ) => {
    setMistakesState(prev => {
      const result = parseFn(prev.pgnText);
      if (!result || result.moves.length === 0) {
        return { ...prev, error: noClockMsg, mistakes: null, expandedMistake: null };
      }
      const hasClocks = result.moves.some(m => m.clk > 0);
      if (!hasClocks) {
        return { ...prev, error: noClockMsg, mistakes: null, expandedMistake: null };
      }
      return {
        ...prev,
        error: '',
        gameHeaders: result.headers,
        allMoves: result.moves,
        mistakes: findFn(result.moves, 0.20),
        expandedMistake: null,
      };
    });
  }, []);

  return (
    <CoachesDataContext.Provider value={{
      usernameInput, setUsernameInput,
      savedPlayers, showUsernameDropdown, setShowUsernameDropdown, dropdownRef,
      handleSelectSavedUsername, handleRemoveSavedPlayer,
      playerInfo, playerInfoLoading, playerInfoError,
      handleSubmit, onboardingDone, completeOnboarding,
      scoresheet, scoresheetSetImage, scoresheetStartOneRead, scoresheetHandleEditSave, scoresheetReread, scoresheetCancel, scoresheetClear,
      diagram, diagramSetImage, diagramAnalyze, diagramClear,
      mistakes: mistakesState, mistakesSetFile, mistakesAnalyze, mistakesClear, mistakesSetExpanded,
    }}>
      {children}
    </CoachesDataContext.Provider>
  );
}
