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
  crop_data_url?: string;
  white_player?: string;
  black_player?: string;
  diagram_number?: number | null;
  active_color?: 'w' | 'b';
  has_labels?: boolean;
  orientation?: 'white_bottom' | 'black_bottom';
}

export interface DiagramExtract {
  fen: string;
  white_player?: string;
  black_player?: string;
  region?: DiagramRegion;
  diagram_number?: number | null;
  crop_data_url?: string;
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
  locateCount?: number;
  debugRawLocate?: string;
  debugRawReads?: Record<number, { raw: string; attempt?: number; timedOut?: boolean; timeoutSeconds?: number; partialChars?: number }>;
  debugRawRereads?: Record<number, string[]>;
  rereading: boolean;
  rereadDone: number;
  rereadTotal: number;
  rereadStartTime: number | null;
}

const DIAGRAM_INITIAL: DiagramState = {
  preview: null, imageFile: null, models: [], modelResults: {}, analyzing: false, startTime: null, error: '',
  rereading: false, rereadDone: 0, rereadTotal: 0, rereadStartTime: null,
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
  diagramRereadStart: (total: number) => void;
  diagramRereadTick: () => void;
  diagramRereadEnd: () => void;
  diagramRereadRawAdd: (originIdx: number, raw: string) => void;

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
  const diagramAbortRef = useRef<AbortController | null>(null);

  const diagramSetImage = useCallback((file: File, preview: string) => {
    diagramAbortRef.current?.abort();
    diagramAbortRef.current = null;
    setDiagram({ ...DIAGRAM_INITIAL, preview, imageFile: file });
  }, []);

  const diagramClear = useCallback(() => {
    diagramAbortRef.current?.abort();
    diagramAbortRef.current = null;
    setDiagram(DIAGRAM_INITIAL);
  }, []);

  const diagramRereadStart = useCallback((total: number) => {
    setDiagram(prev => ({ ...prev, rereading: true, rereadDone: 0, rereadTotal: total, rereadStartTime: Date.now() }));
  }, []);

  const diagramRereadRawAdd = useCallback((originIdx: number, raw: string) => {
    setDiagram(prev => {
      const existing = prev.debugRawRereads?.[originIdx] ?? [];
      return {
        ...prev,
        debugRawRereads: { ...(prev.debugRawRereads || {}), [originIdx]: [...existing, raw] },
      };
    });
  }, []);

  const diagramRereadTick = useCallback(() => {
    setDiagram(prev => ({ ...prev, rereadDone: prev.rereadDone + 1 }));
  }, []);

  const diagramRereadEnd = useCallback(() => {
    setDiagram(prev => ({ ...prev, rereading: false }));
  }, []);

  const diagramAnalyze = useCallback(async () => {
    const file = diagram.imageFile;
    if (!file) return;

    // Cancel any previous in-flight analyze so its SSE events can't leak into this run.
    diagramAbortRef.current?.abort();
    const controller = new AbortController();
    diagramAbortRef.current = controller;
    const { signal } = controller;

    setDiagram(prev => ({ ...prev, error: '', modelResults: {}, models: [], analyzing: true, startTime: Date.now(), locateCount: 0 }));

    try {
      const formData = new FormData();
      formData.append('image', file);

      const res = await fetch('/api/coaches/read-diagram', { method: 'POST', body: formData, signal });

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
        if (signal.aborted) { reader.cancel(); break; }
        const { done, value } = await reader.read();
        if (done) break;
        if (signal.aborted) { reader.cancel(); break; }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (signal.aborted) { streamDone = true; break; }
          if (!line.startsWith('data: ')) continue;
          const payload = JSON.parse(line.slice(6));

          if (payload.type === 'done') {
            streamDone = true;
            reader.cancel();
            break;
          } else if (payload.type === 'models') {
            setDiagram(prev => ({ ...prev, models: payload.models }));
          } else if (payload.type === 'locate_progress') {
            setDiagram(prev => ({ ...prev, locateCount: payload.count }));
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
                    [payload.index]: {
                      raw: payload.raw,
                      attempt: payload.attempt,
                      timedOut: payload.timed_out,
                      timeoutSeconds: payload.timeout_seconds,
                      partialChars: payload.partial_chars,
                    },
                  },
                };
              }
              return prev;
            });
          }
        }
      }
    } catch (e) {
      if (signal.aborted) return;
      setDiagram(prev => ({ ...prev, error: e instanceof Error ? e.message : 'Unknown error' }));
    } finally {
      if (!signal.aborted) {
        setDiagram(prev => ({ ...prev, analyzing: false }));
      }
      if (diagramAbortRef.current === controller) diagramAbortRef.current = null;
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
      diagram, diagramSetImage, diagramAnalyze, diagramClear, diagramRereadStart, diagramRereadTick, diagramRereadEnd, diagramRereadRawAdd,
      mistakes: mistakesState, mistakesSetFile, mistakesAnalyze, mistakesClear, mistakesSetExpanded,
    }}>
      {children}
    </CoachesDataContext.Provider>
  );
}
