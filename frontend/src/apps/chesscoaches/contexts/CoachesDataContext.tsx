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
  tight_box?: { x: number; y: number; width: number; height: number };
  padded_box?: { x: number; y: number; width: number; height: number };
  selected_variant?: 'tight' | 'padded';
  crop_data_url?: string;
  white_player?: string;
  black_player?: string;
  diagram_number?: number | null;
  active_color?: 'w' | 'b';
}

export interface PixelGroupInfo {
  threshold: number | null;
  gap: number | null;
  min_gap: number;
  can_check: boolean;
  count_w: number;
  count_b: number;
  min_fill: number | null;
  max_fill: number | null;
}

export interface PixelDebug {
  means: Record<string, number>;
  dark_ratios: Record<string, number>;
  light_ref: number;
  dark_ref: number;
  dark_threshold: number;
  verdicts?: Record<string, 'ok' | 'flip?' | 'no-check'>;
  piece_groups?: Record<string, string>;
  groups?: Record<string, PixelGroupInfo>;
  board_box_px?: { left: number; top: number; right: number; bottom: number; crop_w: number; crop_h: number };
}

export interface DiagramExtract {
  fen: string;
  white_player?: string;
  black_player?: string;
  region?: DiagramRegion;
  diagram_number?: number | null;
  crop_data_url?: string;
  pixel_colors?: Record<string, 'w' | 'b'>;
  pixel_debug?: PixelDebug;
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
  debugRawLocate?: string;
  debugRawReads?: Record<number, { raw: string; attempt?: number }>;
}

const DIAGRAM_INITIAL: DiagramState = {
  preview: null, imageFile: null, models: [], modelResults: {}, analyzing: false, startTime: null, error: '',
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
}

const DEFAULT_PREFS: CoachesPrefs = { chess_username: null, lichess_username: null, onboarding_done: false, lesson_rate: null, lesson_currency: 'EUR' };

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
  // ── Clear all panel state on logout ──
  const { user } = useAuth();
  const prevUserRef = useRef(user);
  useEffect(() => {
    if (prevUserRef.current && !user) {
      setDiagram(DIAGRAM_INITIAL);
      setMistakesState(MISTAKES_INITIAL);
    }
    prevUserRef.current = user;
  }, [user]);

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
            // Stream individual diagram as it's read; place at its region index so
            // pending regions (not yet read) still occupy their slot in the list.
            const { index: regionIdx, diagram: d } = payload;
            setDiagram(prev => {
              const modelId = prev.models[0]?.id || 'default';
              const existing = prev.modelResults[modelId];
              const diagrams = [...(existing?.diagrams || [])];
              diagrams[regionIdx] = d;
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
          } else if (payload.type === 'debug') {
            setDiagram(prev => {
              if (payload.phase === 'locate') {
                return { ...prev, debugRawLocate: payload.raw };
              }
              if (payload.phase === 'read' && typeof payload.index === 'number') {
                return {
                  ...prev,
                  debugRawReads: {
                    ...(prev.debugRawReads || {}),
                    [payload.index]: { raw: payload.raw, attempt: payload.attempt },
                  },
                };
              }
              return prev;
            });
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
      diagram, diagramSetImage, diagramAnalyze, diagramClear,
      mistakes: mistakesState, mistakesSetFile, mistakesAnalyze, mistakesClear, mistakesSetExpanded,
    }}>
      {children}
    </CoachesDataContext.Provider>
  );
}
