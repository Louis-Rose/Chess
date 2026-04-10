// Coaches data context — holds all panel state so it persists across tab switches

import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../../../contexts/AuthContext';

// ── Shared types ──

// ── Diagram types ──

export interface DiagramRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DiagramExtract {
  fen: string;
  white_player?: string;
  black_player?: string;
  region?: DiagramRegion;
}

export interface DiagramModelResult {
  name: string;
  diagrams?: DiagramExtract[];
  error?: string;
  elapsed: number;
}

export interface DiagramState {
  preview: string | null;
  imageFile: File | null;
  models: { id: string; name: string; avg_elapsed?: number | null }[];
  modelResults: Record<string, DiagramModelResult>;
  analyzing: boolean;
  startTime: number | null;
  error: string;
  regions?: DiagramRegion[];
  regionCount?: number;
  regionsRead?: number;
}

const DIAGRAM_INITIAL: DiagramState = {
  preview: null, imageFile: null, models: [], modelResults: {}, analyzing: false, startTime: null, error: '',
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
  white_time?: number;
  black_time?: number;
  white_confirmed?: boolean;
  black_confirmed?: boolean;
}

export interface ScoresheetResult {
  white_player: string;
  black_player: string;
  event: string;
  date: string;
  result: string;
  notation: string;
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
  consensusOverrides: ScoresheetMove[] | null;
}

const SCORESHEET_INITIAL: ScoresheetState = {
  preview: null, fileName: null, imageFile: null, error: '',
  modelResults: {}, reReads: {}, models: [],
  startTime: null, analyzing: false, azureResult: null, azureGrid: null,
  consensusOverrides: null,
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

// ── Context type ──

interface CoachesDataContextType {
  // Scoresheet panel
  scoresheet: ScoresheetState;
  scoresheetSetImage: (file: File, preview: string, fileName: string) => void;
  scoresheetStartOneRead: (notation?: string) => void;
  scoresheetCancel: () => void;
  scoresheetClear: () => void;
  scoresheetSetOverrides: (overrides: ScoresheetMove[] | null) => void;

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

export function CoachesDataProvider({ children }: { children: ReactNode }) {
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

  const scoresheetSetOverrides = useCallback((overrides: ScoresheetMove[] | null) => {
    setScoresheet(prev => ({ ...prev, consensusOverrides: overrides }));
  }, []);


  const scoresheetAnalyzeImage = useCallback(async (file: File, signal: AbortSignal, notation?: string) => {
    setScoresheet(prev => ({ ...prev, error: '', modelResults: {}, reReads: {}, models: [], analyzing: true }));
    retryInfoRef.current = {};
    try {
      const formData = new FormData();
      formData.append('image', file);
      if (notation) formData.append('notation', notation);
      if (import.meta.env.DEV) console.log(`[Scoresheet] Uploading image: ${file.name} (${(file.size / 1024).toFixed(0)} KB, ${file.type})`);
      const res = await fetch('/api/coaches/read-scoresheet', { method: 'POST', body: formData, signal });
      if (import.meta.env.DEV) console.log(`[Scoresheet] Upload complete, status: ${res.status}`);
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
          try { payload = JSON.parse(line.slice(6)); } catch { if (import.meta.env.DEV) console.warn('[Scoresheet] Failed to parse SSE line:', line); continue; }
          if (import.meta.env.DEV) console.log(`[Scoresheet] SSE event:`, payload.type, payload.model_id || '');
          if (payload.type === 'models') {
            setScoresheet(prev => ({ ...prev, models: payload.models, startTime: Date.now() }));
          } else if (payload.type === 'azure_grid') {
            setScoresheet(prev => ({ ...prev, azureGrid: payload.grid }));
          } else if (payload.type === 'retry') {
            // Store retry info — will be merged into modelResults when the final result arrives
            const { model_id, free_error, free_elapsed } = payload;
            retryInfoRef.current[model_id] = { free_error, free_elapsed };
            if (import.meta.env.DEV) console.log(`[Scoresheet] ${model_id} retrying after free key failed (${free_elapsed}s)`);
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
      if (import.meta.env.DEV) console.log('[Scoresheet] SSE stream complete');
    } catch (e) {
      if (signal.aborted) { if (import.meta.env.DEV) console.log('[Scoresheet] Cancelled by user'); return; }
      if (import.meta.env.DEV) console.error('[Scoresheet] Error:', e);
      setScoresheet(prev => ({ ...prev, error: e instanceof Error ? e.message : 'Unknown error' }));
    } finally {
      setScoresheet(prev => ({ ...prev, analyzing: false }));
    }
  }, []);

  // Azure DI analysis — disabled, kept for future use
  // const scoresheetAnalyzeAzure = useCallback(async (file: File, signal: AbortSignal) => { ... }, []);

  const scoresheetCancel = useCallback(() => {
    if (import.meta.env.DEV) console.log('[Scoresheet] Cancelling analysis...');
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

  const scoresheetStartOneRead = useCallback((notation?: string) => {
    const file = scoresheet.imageFile;
    if (!file) return;
    if (scoresheetAnalyzeAbortRef.current) scoresheetAnalyzeAbortRef.current.abort();
    const controller = new AbortController();
    scoresheetAnalyzeAbortRef.current = controller;
    setScoresheet(prev => ({ ...prev, modelResults: {}, reReads: {}, azureResult: null, azureGrid: null }));
    scoresheetAnalyzeImage(file, controller.signal, notation);
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

    setDiagram(prev => ({ ...prev, error: '', modelResults: {}, models: [], analyzing: true, startTime: Date.now() }));

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
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = JSON.parse(line.slice(6));

          if (payload.type === 'done') {
            streamDone = true;
            reader.cancel();
            break;
          } else if (payload.type === 'models') {
            setDiagram(prev => ({ ...prev, models: payload.models }));
          } else if (payload.type === 'regions') {
            setDiagram(prev => ({ ...prev, regions: payload.regions, regionCount: payload.count, regionsRead: 0 }));
          } else if (payload.type === 'diagram') {
            // Stream individual diagram as it's read
            const { diagram: d } = payload;
            setDiagram(prev => {
              const modelId = prev.models[0]?.id || 'default';
              const existing = prev.modelResults[modelId];
              const diagrams = [...(existing?.diagrams || []), d];
              return {
                ...prev,
                regionsRead: (prev.regionsRead || 0) + 1,
                modelResults: { ...prev.modelResults, [modelId]: { ...existing, name: existing?.name || modelId, diagrams, elapsed: 0 } },
              };
            });
          } else if (payload.type === 'result') {
            const { model_id, name, diagrams, error: err, elapsed } = payload;
            setDiagram(prev => ({
              ...prev,
              modelResults: { ...prev.modelResults, [model_id]: { name, diagrams, error: err, elapsed } },
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
      scoresheet, scoresheetSetImage, scoresheetStartOneRead, scoresheetCancel, scoresheetClear, scoresheetSetOverrides,
      diagram, diagramSetImage, diagramAnalyze, diagramClear,
      mistakes: mistakesState, mistakesSetFile, mistakesAnalyze, mistakesClear, mistakesSetExpanded,
    }}>
      {children}
    </CoachesDataContext.Provider>
  );
}
