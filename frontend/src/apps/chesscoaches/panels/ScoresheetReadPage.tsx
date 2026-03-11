// Scoresheet reader page — runs 4 Gemini models in parallel

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, Loader2, ImageIcon, Clock } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';

interface Move {
  number: number;
  white: string;
  black?: string;
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
}

export function ScoresheetReadPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [modelResults, setModelResults] = useState<Record<string, ModelResult>>({});
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
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
    setLoading(true);
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

      const json = await res.json();
      setModels(json.models);
      setModelResults(json.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const hasResults = Object.keys(modelResults).length > 0;

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

              {/* Loading */}
              {loading && (
                <div className="flex items-center justify-center gap-3 py-8">
                  <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                  <span className="text-slate-300">{t('coaches.analyzing')}</span>
                </div>
              )}

              {/* Error */}
              {error && (
                <p className="text-red-400 text-center py-4">{error}</p>
              )}

              {/* Model results — 5 columns on desktop */}
              {hasResults && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                  {models.map((m) => {
                    const mr = modelResults[m.id];
                    if (!mr) return null;
                    return <ModelPanel key={m.id} model={mr} disagreements={disagreements} />;
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

function ModelPanel({ model, disagreements }: { model: ModelResult; disagreements: Map<number, { white: boolean; black: boolean }> }) {
  const moves = model.result?.moves || [];

  return (
    <div className="bg-slate-700/50 rounded-xl overflow-hidden">
      {/* Model header */}
      <div className="px-2 py-2 border-b border-slate-600 flex items-center justify-between">
        <span className="text-slate-100 font-medium text-xs">{model.name}</span>
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3 text-slate-400" />
          <span className="text-slate-400 text-xs">{model.elapsed}s</span>
        </div>
      </div>

      {/* Error */}
      {model.error && (
        <p className="text-red-400 text-center py-3 text-xs px-2">{model.error}</p>
      )}

      {/* Game info */}
      {model.result && (
        <div className="px-2 py-1.5 border-b border-slate-600/50 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
          {model.result.white_player && (
            <div><span className="text-slate-400">W:</span> <span className="text-slate-200">{model.result.white_player}</span></div>
          )}
          {model.result.black_player && (
            <div><span className="text-slate-400">B:</span> <span className="text-slate-200">{model.result.black_player}</span></div>
          )}
          {model.result.result && model.result.result !== '*' && (
            <div><span className="text-slate-400">Result:</span> <span className="text-slate-200">{model.result.result}</span></div>
          )}
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
            {moves.map((move) => {
              const d = disagreements.get(move.number);
              return (
                <tr key={move.number} className="border-b border-slate-600/30 last:border-0">
                  <td className="px-1.5 py-0.5 text-slate-500 text-center font-mono">{move.number}</td>
                  <td className={`px-1.5 py-0.5 font-mono ${d?.white ? 'bg-red-900/50 text-red-200' : 'text-slate-100'}`}>{move.white}</td>
                  <td className={`px-1.5 py-0.5 font-mono ${d?.black ? 'bg-red-900/50 text-red-200' : 'text-slate-100'}`}>{move.black || ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
