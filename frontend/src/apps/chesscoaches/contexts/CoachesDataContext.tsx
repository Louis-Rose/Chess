// Coaches data context — holds all panel state so it persists across tab switches

import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';

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
  models: { id: string; name: string }[];
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
  models: { id: string; name: string }[];
  autoRunning: boolean;
  startTime: number | null;
  analyzing: boolean;
  azureResult: ScoresheetAzureResult | null;
}

const SCORESHEET_INITIAL: ScoresheetState = {
  preview: null, fileName: null, imageFile: null, error: '',
  modelResults: {}, reReads: {}, models: [],
  autoRunning: false, startTime: null, analyzing: false, azureResult: null,
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
  scoresheetStartMultipleReads: (groundTruthMoves: ScoresheetMove[]) => void;
  scoresheetStopMultipleReads: () => void;
  scoresheetHandleEditSave: (modelId: string, readIdx: number, confirmed: ScoresheetMove[], correctionKey: string) => void;
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
  const scoresheetAutoCorrectRef = useRef(false);
  const scoresheetAutoCorrectDoneRef = useRef<Set<string>>(new Set());
  const scoresheetAbortRef = useRef<AbortController | null>(null);

  const scoresheetSetImage = useCallback((file: File, preview: string, fileName: string) => {
    setScoresheet({ ...SCORESHEET_INITIAL, preview, imageFile: file, fileName });
  }, []);

  const scoresheetClear = useCallback(() => {
    scoresheetAutoCorrectRef.current = false;
    if (scoresheetAbortRef.current) { scoresheetAbortRef.current.abort(); scoresheetAbortRef.current = null; }
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

  const scoresheetAnalyzeImage = useCallback(async (file: File) => {
    setScoresheet(prev => ({ ...prev, error: '', modelResults: {}, reReads: {}, models: [], analyzing: true }));
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch('/api/coaches/read-scoresheet', { method: 'POST', body: formData });
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
            setScoresheet(prev => ({ ...prev, models: payload.models, startTime: Date.now() }));
          } else if (payload.type === 'result') {
            const { model_id, name, result, error: err, elapsed, warnings } = payload;
            setScoresheet(prev => ({
              ...prev,
              modelResults: { ...prev.modelResults, [model_id]: { ...prev.modelResults[model_id], name, result, error: err, elapsed, warnings } },
            }));
          }
        }
      }
    } catch (e) {
      setScoresheet(prev => ({ ...prev, error: e instanceof Error ? e.message : 'Unknown error' }));
    } finally {
      setScoresheet(prev => ({ ...prev, analyzing: false }));
    }
  }, []);

  const scoresheetAnalyzeAzure = useCallback(async (file: File) => {
    setScoresheet(prev => ({ ...prev, azureResult: { moves: [], elapsed: 0, loading: true } }));
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch('/api/coaches/read-scoresheet-azure', { method: 'POST', body: formData });
      if (res.ok) {
        const json = await res.json();
        setScoresheet(prev => ({ ...prev, azureResult: { moves: json.moves, elapsed: json.elapsed, loading: false, rawLines: json.raw_lines, rawTables: json.raw_tables } }));
      } else {
        const json = await res.json().catch(() => ({ error: 'Failed' }));
        setScoresheet(prev => ({ ...prev, azureResult: { moves: [], elapsed: 0, loading: false, error: json.error } }));
      }
    } catch (e) {
      setScoresheet(prev => ({ ...prev, azureResult: { moves: [], elapsed: 0, loading: false, error: e instanceof Error ? e.message : 'Unknown error' } }));
    }
  }, []);

  const scoresheetStartOneRead = useCallback(() => {
    const file = scoresheet.imageFile;
    if (!file) return;
    scoresheetAutoCorrectRef.current = false;
    setScoresheet(prev => ({ ...prev, autoRunning: false, modelResults: {}, reReads: {}, azureResult: null }));
    scoresheetAnalyzeImage(file);
    scoresheetAnalyzeAzure(file);
  }, [scoresheet.imageFile, scoresheetAnalyzeImage, scoresheetAnalyzeAzure]);

  // Ref to hold ground truth moves for auto-correct loop
  const scoresheetGtRef = useRef<ScoresheetMove[] | null>(null);

  const scoresheetStartMultipleReads = useCallback((groundTruthMoves: ScoresheetMove[]) => {
    const file = scoresheet.imageFile;
    if (!file) return;
    scoresheetAutoCorrectRef.current = true;
    scoresheetAutoCorrectDoneRef.current = new Set();
    scoresheetGtRef.current = groundTruthMoves;
    setScoresheet(prev => ({ ...prev, autoRunning: true, modelResults: {}, reReads: {}, azureResult: null }));
    scoresheetAnalyzeImage(file);
    scoresheetAnalyzeAzure(file);
  }, [scoresheet.imageFile, scoresheetAnalyzeImage, scoresheetAnalyzeAzure]);

  const scoresheetStopMultipleReads = useCallback(() => {
    scoresheetAutoCorrectRef.current = false;
    if (scoresheetAbortRef.current) { scoresheetAbortRef.current.abort(); scoresheetAbortRef.current = null; }
    setScoresheet(prev => {
      const cleaned: Record<string, ScoresheetReadEntry[]> = {};
      for (const [modelId, reads] of Object.entries(prev.reReads)) {
        cleaned[modelId] = reads.filter(r => !r.rereading);
      }
      return { ...prev, autoRunning: false, reReads: cleaned };
    });
  }, []);

  const scoresheetHandleEditSave = useCallback(async (modelId: string, readIdx: number, confirmed: ScoresheetMove[], correctionKey: string) => {
    // Collect all corrections from previous reads + this new one
    setScoresheet(prev => {
      const allReads = prev.reReads[modelId] || [];
      const prevCorrections = new Set<string>();
      for (let i = 0; i <= readIdx; i++) {
        const read = readIdx === 0 && i === 0
          ? { corrections: undefined } // first read is from modelResults, no corrections
          : allReads[i - 1]; // reReads is 0-indexed, readIdx 0 = modelResults
        if (read?.corrections) read.corrections.forEach((c: string) => prevCorrections.add(c));
      }
      prevCorrections.add(correctionKey);
      const keepReReads = readIdx === 0 ? [] : allReads.slice(0, readIdx);
      return {
        ...prev,
        reReads: { ...prev.reReads, [modelId]: [...keepReReads, { moves: confirmed, elapsed: 0, rereading: true, corrections: prevCorrections }] },
      };
    });

    const file = scoresheet.imageFile;
    if (!file) return;
    try {
      const result = await scoresheetDoReread(file, modelId, confirmed);
      if (result) {
        setScoresheet(prev => {
          const reads = [...(prev.reReads[modelId] || [])];
          reads[reads.length - 1] = { ...reads[reads.length - 1], moves: result.moves, elapsed: result.elapsed, warnings: result.warnings, rereading: false };
          return { ...prev, reReads: { ...prev.reReads, [modelId]: reads } };
        });
      } else {
        setScoresheet(prev => {
          const reads = [...(prev.reReads[modelId] || [])];
          reads[reads.length - 1] = { ...reads[reads.length - 1], rereading: false, error: 'Re-read failed' };
          return { ...prev, reReads: { ...prev.reReads, [modelId]: reads } };
        });
      }
    } catch {
      setScoresheet(prev => {
        const reads = [...(prev.reReads[modelId] || [])];
        reads[reads.length - 1] = { ...reads[reads.length - 1], rereading: false, error: 'Re-read failed' };
        return { ...prev, reReads: { ...prev.reReads, [modelId]: reads } };
      });
    }
  }, [scoresheet.imageFile, scoresheetDoReread]);

  // Auto-correction effect — runs in context so it persists across tab switches
  useEffect(() => {
    if (!scoresheetAutoCorrectRef.current || !scoresheetGtRef.current || !scoresheet.imageFile) return;
    const groundTruthMoves = scoresheetGtRef.current;

    const controller = new AbortController();
    scoresheetAbortRef.current = controller;

    const findFirstMistake = (moves: ScoresheetMove[], gtMoves: ScoresheetMove[]) => {
      for (let i = 0; i < gtMoves.length; i++) {
        const gt = gtMoves[i];
        const mm = moves[i];
        if (!mm) return null;
        for (const color of ['white', 'black'] as const) {
          if (color === 'black' && !gt.black) continue;
          const gtVal = gt[color] || '';
          const mmVal = mm[color] || '';
          const match = gtVal === mmVal || gtVal.replace(/x/g, '') === mmVal.replace(/x/g, '');
          if (!match) return { moveIdx: i, color, correctValue: gtVal };
        }
      }
      return null;
    };

    for (const modelId of Object.keys(scoresheet.modelResults)) {
      if (scoresheetAutoCorrectDoneRef.current.has(modelId)) continue;
      const mr = scoresheet.modelResults[modelId];
      if (!mr?.result) continue;

      const extraReads = scoresheet.reReads[modelId] || [];
      const lastRead = extraReads.length > 0 ? extraReads[extraReads.length - 1] : { moves: mr.result.moves, elapsed: mr.elapsed };
      if ('rereading' in lastRead && lastRead.rereading) continue;

      const mistake = findFirstMistake(lastRead.moves, groundTruthMoves);
      if (!mistake) {
        scoresheetAutoCorrectDoneRef.current.add(modelId);
        if (Object.keys(scoresheet.modelResults).every(id => scoresheetAutoCorrectDoneRef.current.has(id))) {
          scoresheetAutoCorrectRef.current = false;
          setScoresheet(prev => ({ ...prev, autoRunning: false }));
        }
        continue;
      }

      const confirmed: ScoresheetMove[] = [];
      const allCorrections = new Set<string>();
      for (const r of extraReads) {
        if (r.corrections) r.corrections.forEach(c => allCorrections.add(c));
      }
      for (let i = 0; i <= mistake.moveIdx; i++) {
        const m = { ...lastRead.moves[i] };
        if (i === mistake.moveIdx) {
          (m as Record<string, unknown>)[mistake.color] = mistake.correctValue;
          if (mistake.color === 'white') { delete m.black; delete m.black_legal; }
        }
        delete m.white_legal; delete m.black_legal;
        confirmed.push(m);
      }
      const corrKey = `${lastRead.moves[mistake.moveIdx].number}-${mistake.color}`;
      allCorrections.add(corrKey);

      setScoresheet(prev => ({
        ...prev,
        reReads: { ...prev.reReads, [modelId]: [...(prev.reReads[modelId] || []), { moves: confirmed, elapsed: 0, rereading: true, corrections: allCorrections }] },
      }));

      ((mid) => {
        (async () => {
          const result = await scoresheetDoReread(scoresheet.imageFile!, mid, confirmed, controller.signal);
          if (!scoresheetAutoCorrectRef.current) return;
          if (result) {
            setScoresheet(prev => {
              const reads = [...(prev.reReads[mid] || [])];
              reads[reads.length - 1] = { ...reads[reads.length - 1], moves: result.moves, elapsed: result.elapsed, warnings: result.warnings, rereading: false };
              return { ...prev, reReads: { ...prev.reReads, [mid]: reads } };
            });
          } else {
            setScoresheet(prev => {
              const reads = [...(prev.reReads[mid] || [])];
              reads[reads.length - 1] = { ...reads[reads.length - 1], rereading: false, error: 'Re-read failed' };
              return { ...prev, reReads: { ...prev.reReads, [mid]: reads } };
            });
            scoresheetAutoCorrectDoneRef.current.add(mid);
            if (Object.keys(scoresheet.modelResults).every(id => scoresheetAutoCorrectDoneRef.current.has(id))) {
              scoresheetAutoCorrectRef.current = false;
              setScoresheet(prev => ({ ...prev, autoRunning: false }));
            }
          }
        })();
      })(modelId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoresheet.modelResults, scoresheet.reReads]);

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
      scoresheet, scoresheetSetImage, scoresheetStartOneRead, scoresheetStartMultipleReads, scoresheetStopMultipleReads, scoresheetHandleEditSave, scoresheetClear,
      diagram, diagramSetImage, diagramAnalyze, diagramClear,
      mistakes: mistakesState, mistakesSetFile, mistakesAnalyze, mistakesClear, mistakesSetExpanded,
    }}>
      {children}
    </CoachesDataContext.Provider>
  );
}
