// Scoresheet reader page — runs 5 Gemini models in parallel, streams results via SSE

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, ImageIcon, Clock } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';

interface Move {
  number: number;
  white: string;
  black?: string;
  white_legal?: boolean;
  black_legal?: boolean;
}

interface ScoresheetResult {
  white_player: string;
  black_player: string;
  event: string;
  date: string;
  result: string;
  moves: Move[];
}

interface ModelResult {
  name: string;
  result?: ScoresheetResult;
  error?: string;
  elapsed: number;
  warnings?: string[];
}

export function ScoresheetReadPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [modelResults, setModelResults] = useState<Record<string, ModelResult>>({});
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [showImageModal, setShowImageModal] = useState(false);

  const closeModal = useCallback(() => setShowImageModal(false), []);
  useEffect(() => {
    if (!showImageModal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showImageModal, closeModal]);

  // Build disagreement map: moveNumber -> { white: Set of values, black: Set of values }
  const disagreements = useMemo(() => {
    const results = Object.values(modelResults).filter(m => m.result);
    if (results.length < 2) return new Map<number, { white: boolean; black: boolean }>();

    const map = new Map<number, { white: boolean; black: boolean }>();
    const maxMoves = Math.max(...results.map(m => m.result!.moves.length));

    for (let i = 0; i < maxMoves; i++) {
      const whites = new Set<string>();
      const blacks = new Set<string>();
      for (const m of results) {
        const move = m.result!.moves[i];
        if (move) {
          whites.add(move.white);
          blacks.add(move.black || '');
        } else {
          whites.add('');
          blacks.add('');
        }
      }
      if (whites.size > 1 || blacks.size > 1) {
        map.set(i + 1, { white: whites.size > 1, black: blacks.size > 1 });
      }
    }
    return map;
  }, [modelResults]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setModelResults({});
    setModels([]);

    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);

    analyzeImage(file);
  };

  const analyzeImage = async (file: File) => {
    setError('');
    setModelResults({});
    setModels([]);

    try {
      const formData = new FormData();
      formData.append('image', file);

      const res = await fetch('/api/coaches/read-scoresheet', {
        method: 'POST',
        body: formData,
      });

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
            setModels(payload.models);
            setStartTime(Date.now());
          } else if (payload.type === 'result') {
            const { model_id, name, result, error: err, elapsed, warnings } = payload;
            setModelResults(prev => ({
              ...prev,
              [model_id]: { name, result, error: err, elapsed, warnings },
            }));
          } else if (payload.type === 'done') {
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="max-w-[1600px] mx-auto">
        <div className="flex flex-col pt-2">
          <button
            onClick={() => navigate('/coach')}
            className="flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors text-base px-2 md:px-4"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Previous</span>
          </button>
          <div className="border-t border-slate-700 mt-2" />
          <h1 className="text-lg font-bold text-slate-100 text-center mt-2">{t('coaches.navScoresheets')}</h1>
        </div>
        <div className="border-t border-slate-700 mt-2 mb-6" />

        {/* Upload area */}
        <div className="px-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />

          {!preview ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-slate-600 rounded-xl p-12 flex flex-col items-center gap-3 hover:border-blue-500 hover:bg-slate-750 transition-colors cursor-pointer"
            >
              <ImageIcon className="w-12 h-12 text-slate-500" />
              <span className="text-slate-300 font-medium">{t('coaches.uploadPrompt')}</span>
              <span className="text-slate-500 text-sm">{t('coaches.uploadHint')}</span>
            </button>
          ) : (
            <div className="space-y-4">
              {/* Preview + replace */}
              <div className="relative">
                <img
                  src={preview}
                  alt="Scoresheet"
                  className="rounded-xl max-h-80 mx-auto cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => setShowImageModal(true)}
                />
                <button
                  onClick={() => { setPreview(null); setModelResults({}); setModels([]); setError(''); fileInputRef.current?.click(); }}
                  className="absolute top-2 right-2 bg-slate-800/80 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  {t('coaches.replaceImage')}
                </button>
              </div>

              {/* Error */}
              {error && (
                <p className="text-red-400 text-center py-4">{error}</p>
              )}

              {/* Model results — 5 columns on desktop, show as they arrive */}
              {models.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-start">
                  {models.map((m) => {
                    const mr = modelResults[m.id];
                    if (!mr) return <ModelPanelLoading key={m.id} name={m.name} startTime={startTime} />;
                    return <ModelPanel key={m.id} model={mr} disagreements={disagreements} onMovesUpdate={(moves) => {
                      setModelResults(prev => ({
                        ...prev,
                        [m.id]: { ...prev[m.id], result: { ...prev[m.id].result!, moves } },
                      }));
                    }} />;
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen image modal */}
      {showImageModal && preview && (
        <div
          onClick={closeModal}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-[1.5px] cursor-pointer"
        >
          <img
            src={preview}
            alt="Scoresheet"
            className="max-w-[90vw] max-h-[90vh] rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

function ModelPanelLoading({ name, startTime }: { name: string; startTime: number | null }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startTime) return;
    setElapsed(Math.round((Date.now() - startTime) / 1000));
    const id = setInterval(() => setElapsed(Math.round((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(id);
  }, [startTime]);

  return (
    <div className="bg-slate-700/50 rounded-xl overflow-hidden self-start">
      <div className="px-2 py-2 border-b border-slate-600 flex items-center justify-between">
        <span className="text-slate-100 font-medium text-xs">{name}</span>
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3 text-slate-400" />
          <span className="text-slate-400 text-xs">{elapsed}s</span>
        </div>
      </div>
      <div className="flex items-center justify-center py-12">
        <span className="text-slate-500 text-xs">Analyzing...</span>
      </div>
    </div>
  );
}

const WARNING_LABELS: Record<string, string> = {
  json_repaired: 'JSON repaired',
  unwrapped_array: 'Unwrapped array',
};

function ModelPanel({ model, disagreements, onMovesUpdate }: {
  model: ModelResult;
  disagreements: Map<number, { white: boolean; black: boolean }>;
  onMovesUpdate: (moves: Move[]) => void;
}) {
  const moves = model.result?.moves || [];
  const [editing, setEditing] = useState<{ moveIdx: number; color: 'white' | 'black'; value: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  const handleSave = async () => {
    if (!editing || !model.result) return;
    const updated = model.result.moves.map((m, i) =>
      i === editing.moveIdx ? { ...m, [editing.color]: editing.value } : { ...m }
    );
    setEditing(null);
    // Re-validate all moves
    try {
      const res = await fetch('/api/coaches/validate-moves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moves: updated }),
      });
      if (res.ok) {
        const json = await res.json();
        onMovesUpdate(json.moves);
      }
    } catch { /* keep local update */ }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') setEditing(null);
  };

  return (
    <div className="bg-slate-700/50 rounded-xl overflow-hidden self-start">
      {/* Model header */}
      <div className="px-2 py-2 border-b border-slate-600 flex items-center justify-between">
        <span className="text-slate-100 font-medium text-xs">{model.name}</span>
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3 text-slate-400" />
          <span className="text-slate-400 text-xs">{model.elapsed}s</span>
        </div>
      </div>

      {/* Warnings — always rendered for vertical alignment */}
      <div className="px-2 py-1 border-b border-slate-600/50 text-[10px] text-amber-400 min-h-[22px]">
        {model.warnings && model.warnings.length > 0
          ? model.warnings.map(w => WARNING_LABELS[w] || w).join(' · ')
          : '\u00A0'}
      </div>

      {/* Error */}
      {model.error && (
        <p className="text-red-400 text-center py-3 text-xs px-2">{model.error}</p>
      )}

      {/* Game info — always show two lines: players + result */}
      {model.result && (
        <div className="px-2 py-1.5 border-b border-slate-600/50 text-[10px]">
          <div className="flex flex-wrap gap-x-3">
            <div><span className="text-slate-400">W:</span> <span className="text-slate-200">{model.result.white_player || ''}</span></div>
            <div><span className="text-slate-400">B:</span> <span className="text-slate-200">{model.result.black_player || ''}</span></div>
          </div>
          <div>
            <span className="text-slate-400">Result:</span> <span className="text-slate-200">{model.result.result && model.result.result !== '*' ? model.result.result : ''}</span>
          </div>
        </div>
      )}

      {/* Moves table — no scroll, full height */}
      {moves.length > 0 && (
        <table className="w-full text-[11px]">
          <thead className="bg-slate-700">
            <tr className="border-b border-slate-600">
              <th className="px-1.5 py-1 text-slate-400 font-medium text-center w-6">#</th>
              <th className="px-1.5 py-1 text-slate-400 font-medium text-left">W</th>
              <th className="px-1.5 py-1 text-slate-400 font-medium text-left">B</th>
            </tr>
          </thead>
          <tbody>
            {moves.map((move, idx) => {
              const d = disagreements.get(move.number);
              return (
                <tr key={move.number} className="border-b border-slate-600/30 last:border-0">
                  <td className="px-1.5 py-0.5 text-slate-500 text-center font-mono">{move.number}</td>
                  <MoveCell
                    value={move.white}
                    legal={move.white_legal}
                    highlight={d?.white}
                    onClick={() => setEditing({ moveIdx: idx, color: 'white', value: move.white })}
                  />
                  <MoveCell
                    value={move.black || ''}
                    legal={move.black_legal}
                    highlight={d?.black}
                    onClick={() => move.black !== undefined ? setEditing({ moveIdx: idx, color: 'black', value: move.black || '' }) : undefined}
                  />
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Edit modal */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-[1.5px]"
          onClick={() => setEditing(null)}
        >
          <div
            className="bg-slate-800 rounded-xl p-4 min-w-[260px] shadow-xl border border-slate-600"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-slate-400 text-xs mb-2">
              Move {moves[editing.moveIdx]?.number} · {editing.color === 'white' ? 'White' : 'Black'}
            </div>
            <input
              ref={inputRef}
              value={editing.value}
              onChange={e => setEditing({ ...editing, value: e.target.value })}
              onKeyDown={handleKeyDown}
              className="w-full bg-slate-700 text-slate-100 font-mono text-sm px-3 py-2 rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none"
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleSave}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs py-1.5 rounded-lg transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => setEditing(null)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs py-1.5 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MoveCell({ value, legal, highlight, onClick }: {
  value: string;
  legal?: boolean;
  highlight?: boolean;
  onClick: () => void;
}) {
  return (
    <td
      className={`px-1.5 py-0.5 font-mono cursor-pointer hover:bg-slate-600/50 ${highlight ? 'bg-red-900/50 text-red-200' : 'text-slate-100'}`}
      onClick={onClick}
    >
      <span className="inline-flex items-center gap-1">
        {value}
        {legal === true && <span className="text-green-400 text-[9px]">&#10003;</span>}
        {legal === false && <span className="text-red-400 text-[9px]">&#10007;</span>}
      </span>
    </td>
  );
}
