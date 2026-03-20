// Mistake Finder panel — upload PGN, find time-management mistakes

import { useState, useCallback, useRef } from 'react';
import { Upload, Search, Clock, AlertTriangle, ChevronDown, ChevronUp, X } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { Chessboard } from '../components/Chessboard';
import { PanelHeader } from '../components/PanelHeader';

/* ── Types ── */

interface ParsedMove {
  number: number;
  side: 'white' | 'black';
  san: string;
  clk: number; // remaining seconds after this move
  timeSpent: number; // seconds spent on this move
  remainingBefore: number; // clock before this move
  fractionSpent: number; // timeSpent / remainingBefore
}

interface Mistake {
  move: ParsedMove;
  percentSpent: number;
}

interface GameHeader {
  white: string;
  black: string;
  event: string;
  date: string;
  result: string;
  timeControl: string;
}

/* ── PGN parsing ── */

function parseClk(token: string): number | null {
  // [%clk h:mm:ss] or [%clk h:mm:ss.d]
  const m = token.match(/\[%clk\s+(\d+):(\d+):(\d+)(?:\.(\d+))?\]/);
  if (!m) return null;
  return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]);
}

function parseTimeControl(tc: string): number | null {
  // "600" or "600+5" or "180+2" etc → base time in seconds
  const m = tc.match(/^(\d+)/);
  return m ? parseInt(m[1]) : null;
}

function parsePgn(pgn: string): { headers: GameHeader; moves: ParsedMove[] } | null {
  const lines = pgn.split('\n');

  // Extract headers
  const headerMap: Record<string, string> = {};
  for (const line of lines) {
    const m = line.match(/^\[(\w+)\s+"(.*)"\]$/);
    if (m) headerMap[m[1]] = m[2];
  }

  const headers: GameHeader = {
    white: headerMap['White'] || '?',
    black: headerMap['Black'] || '?',
    event: headerMap['Event'] || '?',
    date: headerMap['Date'] || '?',
    result: headerMap['Result'] || '*',
    timeControl: headerMap['TimeControl'] || '?',
  };

  // Get movetext (everything after headers)
  const movetext = lines
    .filter(l => !l.startsWith('[') && l.trim())
    .join(' ')
    .replace(/\{[^}]*\}/g, match => {
      // Preserve %clk annotations, remove other comments
      const clks = match.match(/\[%clk\s+\d+:\d+:\d+(?:\.\d+)?\]/g);
      return clks ? clks.join(' ') : '';
    });

  // Tokenize: move numbers, SANs, and clock annotations
  const tokens = movetext.match(/\d+\.\s*(?:\.\.)?|[A-Ka-kNBRQO][^\s]*|[%clk\s\d:.[\]]+|\S+/g);
  if (!tokens) return null;

  const moves: ParsedMove[] = [];
  let currentNumber = 1;
  let currentSide: 'white' | 'black' = 'white';
  let lastSan = '';

  // Determine starting clock from TimeControl header
  const baseTime = parseTimeControl(headers.timeControl);

  for (const token of tokens) {
    // Move number
    const numMatch = token.match(/^(\d+)\./);
    if (numMatch) {
      currentNumber = parseInt(numMatch[1]);
      if (token.includes('...')) {
        currentSide = 'black';
      } else {
        currentSide = 'white';
      }
      continue;
    }

    // Clock annotation
    const clk = parseClk(token);
    if (clk !== null && lastSan) {
      // Determine remaining time before this move
      let remainingBefore: number;
      if (moves.length === 0 && currentSide === 'white') {
        // First move of game
        remainingBefore = baseTime ?? clk;
      } else {
        // Find previous move by same side
        const prevBySide = [...moves].reverse().find(m => m.side === currentSide);
        remainingBefore = prevBySide ? prevBySide.clk : (baseTime ?? clk);
      }

      const timeSpent = Math.max(0, remainingBefore - clk);
      const fractionSpent = remainingBefore > 0 ? timeSpent / remainingBefore : 0;

      moves.push({
        number: currentNumber,
        side: currentSide,
        san: lastSan,
        clk,
        timeSpent,
        remainingBefore,
        fractionSpent,
      });

      if (currentSide === 'white') {
        currentSide = 'black';
      } else {
        currentSide = 'white';
        currentNumber++;
      }
      lastSan = '';
      continue;
    }

    // Game result
    if (['1-0', '0-1', '1/2-1/2', '*'].includes(token)) continue;

    // SAN move
    if (token.match(/^[A-Ka-kNBRQO]/)) {
      lastSan = token;
    }
  }

  return { headers, moves };
}

function findMistakes(moves: ParsedMove[], threshold: number): Mistake[] {
  return moves
    .filter(m => m.remainingBefore > 0 && m.fractionSpent >= threshold)
    .map(m => ({ move: m, percentSpent: Math.round(m.fractionSpent * 100) }));
}

/* ── Formatting helpers ── */

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/* ── Component ── */

const THRESHOLD = 0.20;

export function MistakeFinderPanel() {
  const { t } = useLanguage();
  const fileRef = useRef<HTMLInputElement>(null);

  const [pgnText, setPgnText] = useState('');
  const [fileName, setFileName] = useState('');
  const [mistakes, setMistakes] = useState<Mistake[] | null>(null);
  const [gameHeaders, setGameHeaders] = useState<GameHeader | null>(null);
  const [allMoves, setAllMoves] = useState<ParsedMove[]>([]);
  const [error, setError] = useState('');
  const [expandedMistake, setExpandedMistake] = useState<number | null>(null);

  const handleFile = useCallback((file: File) => {
    setError('');
    setMistakes(null);
    setGameHeaders(null);
    setAllMoves([]);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setPgnText(text);
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleAnalyze = () => {
    setError('');
    setMistakes(null);
    setExpandedMistake(null);

    const result = parsePgn(pgnText);
    if (!result || result.moves.length === 0) {
      setError(t('coaches.mistakes.noClockData'));
      return;
    }

    // Check that we actually have clock data
    const hasClocks = result.moves.some(m => m.clk > 0);
    if (!hasClocks) {
      setError(t('coaches.mistakes.noClockData'));
      return;
    }

    setGameHeaders(result.headers);
    setAllMoves(result.moves);
    setMistakes(findMistakes(result.moves, THRESHOLD));
  };

  const handleClear = () => {
    setPgnText('');
    setFileName('');
    setMistakes(null);
    setGameHeaders(null);
    setAllMoves([]);
    setError('');
    setExpandedMistake(null);
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 mt-2">
      <PanelHeader title={t('coaches.navMistakes')} />

      <div className="max-w-3xl mx-[5%] md:mx-auto">
      {/* Upload area */}
      {!pgnText ? (
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-slate-600 rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer hover:border-blue-500 transition-colors"
        >
          <Upload className="w-10 h-10 text-slate-400" />
          <p className="text-slate-300 font-medium">{t('coaches.mistakes.uploadPrompt')}</p>
          <p className="text-slate-500 text-sm">{t('coaches.mistakes.uploadHint')}</p>
          <input
            ref={fileRef}
            type="file"
            accept=".pgn,.txt"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {/* File loaded banner */}
          <div className="flex items-center justify-between bg-slate-700/50 rounded-lg px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <Upload className="w-5 h-5 text-blue-400 flex-shrink-0" />
              <span className="text-slate-200 text-sm truncate">{fileName}</span>
            </div>
            <button
              onClick={handleClear}
              className="text-slate-400 hover:text-slate-200 transition-colors ml-3 flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Chessboard */}
          <Chessboard pgn={pgnText} />

          {/* Analyze button */}
          {!mistakes && (
            <button
              onClick={handleAnalyze}
              className="bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 px-6 rounded-lg flex items-center gap-2 transition-colors mx-auto"
            >
              <Search className="w-5 h-5" />
              {t('coaches.mistakes.findButton')}
            </button>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Results */}
          {mistakes && gameHeaders && (
            <div className="space-y-4">
              {/* Game info */}
              <div className="bg-slate-700/30 rounded-lg px-4 py-3 space-y-1">
                <p className="text-white font-medium">
                  {gameHeaders.white} vs {gameHeaders.black}
                </p>
                <p className="text-slate-400 text-sm">
                  {gameHeaders.event} — {gameHeaders.date} — {gameHeaders.timeControl}
                </p>
                <p className="text-slate-400 text-sm">
                  {allMoves.length} {t('coaches.mistakes.movesWithClock')} — {gameHeaders.result}
                </p>
              </div>

              {/* Mistakes count */}
              <div className={`rounded-lg px-4 py-3 flex items-center gap-3 ${
                mistakes.length === 0
                  ? 'bg-green-900/30 border border-green-700'
                  : 'bg-amber-900/30 border border-amber-700'
              }`}>
                <AlertTriangle className={`w-5 h-5 flex-shrink-0 ${
                  mistakes.length === 0 ? 'text-green-400' : 'text-amber-400'
                }`} />
                <span className={mistakes.length === 0 ? 'text-green-300' : 'text-amber-300'}>
                  {mistakes.length === 0
                    ? t('coaches.mistakes.noMistakes')
                    : `${mistakes.length} ${mistakes.length === 1 ? t('coaches.mistakes.mistakeFound') : t('coaches.mistakes.mistakesFound')}`
                  }
                </span>
              </div>

              {/* Mistake details */}
              {mistakes.length > 0 && (
                <div className="space-y-2">
                  {mistakes.map((m, i) => (
                    <div key={i} className="bg-slate-700/40 border border-slate-600 rounded-lg overflow-hidden">
                      <button
                        onClick={() => setExpandedMistake(expandedMistake === i ? null : i)}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-700/60 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-amber-400 font-mono font-bold text-sm">
                            {m.move.number}.{m.move.side === 'black' ? '..' : ''} {m.move.san}
                          </span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            m.move.side === 'white' ? 'bg-white/10 text-white' : 'bg-slate-500/30 text-slate-300'
                          }`}>
                            {m.move.side === 'white' ? gameHeaders.white : gameHeaders.black}
                          </span>
                          <span className="text-red-400 font-bold text-sm">
                            {m.percentSpent}% {t('coaches.mistakes.ofClock')}
                          </span>
                        </div>
                        {expandedMistake === i
                          ? <ChevronUp className="w-4 h-4 text-slate-400" />
                          : <ChevronDown className="w-4 h-4 text-slate-400" />
                        }
                      </button>
                      {expandedMistake === i && (
                        <div className="px-4 pb-3 grid grid-cols-3 gap-3 text-sm border-t border-slate-600 pt-3">
                          <div>
                            <p className="text-slate-500 text-xs mb-0.5">{t('coaches.mistakes.clockBefore')}</p>
                            <p className="text-slate-200 font-mono flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              {formatTime(m.move.remainingBefore)}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500 text-xs mb-0.5">{t('coaches.mistakes.timeSpent')}</p>
                            <p className="text-red-400 font-mono font-bold">
                              {formatTime(m.move.timeSpent)}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500 text-xs mb-0.5">{t('coaches.mistakes.clockAfter')}</p>
                            <p className="text-slate-200 font-mono flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              {formatTime(m.move.clk)}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Analyze again */}
              <button
                onClick={handleClear}
                className="w-full bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium py-2.5 rounded-lg transition-colors text-sm"
              >
                {t('coaches.mistakes.analyzeAnother')}
              </button>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
