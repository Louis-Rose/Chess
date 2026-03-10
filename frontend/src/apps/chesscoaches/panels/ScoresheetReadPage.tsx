// Scoresheet reader page — runs 3 Gemini models in parallel

import { useState, useRef, useEffect, useCallback } from 'react';
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

interface ModelState {
  id: string;
  name: string;
  moves: Move[];
  result: ScoresheetResult | null;
  elapsed: number | null;
  error: string | null;
  loading: boolean;
}

export function ScoresheetReadPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [models, setModels] = useState<ModelState[]>([]);
  const [showImageModal, setShowImageModal] = useState(false);

  const closeModal = useCallback(() => setShowImageModal(false), []);
  useEffect(() => {
    if (!showImageModal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showImageModal, closeModal]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setModels([]);

    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);

    analyzeImage(file);
  };

  const analyzeImage = async (file: File) => {
    setLoading(true);
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
          const data = JSON.parse(line.slice(6));

          if (data.type === 'models') {
            setModels(data.models.map((m: { id: string; name: string }) => ({
              id: m.id,
              name: m.name,
              moves: [],
              result: null,
              elapsed: null,
              error: null,
              loading: true,
            })));
          } else if (data.type === 'move') {
            setModels(prev => prev.map(m =>
              m.id === data.model ? { ...m, moves: [...m.moves, data.move] } : m
            ));
          } else if (data.type === 'done') {
            setModels(prev => prev.map(m =>
              m.id === data.model ? { ...m, result: data.result, elapsed: data.elapsed, loading: false } : m
            ));
          } else if (data.type === 'error') {
            setModels(prev => prev.map(m =>
              m.id === data.model ? { ...m, error: data.error, elapsed: data.elapsed, loading: false } : m
            ));
          }
        }
      }
    } catch (e) {
      console.error('Stream error:', e);
    } finally {
      setLoading(false);
    }
  };

  const hasAnyResults = models.some(m => m.moves.length > 0 || m.result || m.error);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="max-w-7xl mx-auto">
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
                  onClick={() => { setPreview(null); setModels([]); fileInputRef.current?.click(); }}
                  className="absolute top-2 right-2 bg-slate-800/80 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  {t('coaches.replaceImage')}
                </button>
              </div>

              {/* Loading before any results */}
              {loading && !hasAnyResults && (
                <div className="flex items-center justify-center gap-3 py-8">
                  <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                  <span className="text-slate-300">{t('coaches.analyzing')}</span>
                </div>
              )}

              {/* 3 model results */}
              {hasAnyResults && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {models.map((model) => (
                    <ModelPanel key={model.id} model={model} />
                  ))}
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

function ModelPanel({ model }: { model: ModelState }) {
  const displayMoves = model.result ? model.result.moves : model.moves;

  return (
    <div className="bg-slate-700/50 rounded-xl overflow-hidden">
      {/* Model header */}
      <div className="px-4 py-3 border-b border-slate-600 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-slate-100 font-medium text-sm">{model.name}</span>
          {model.loading && <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />}
        </div>
        {model.elapsed !== null && (
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400 text-sm">{model.elapsed}s</span>
          </div>
        )}
      </div>

      {/* Error */}
      {model.error && (
        <p className="text-red-400 text-center py-4 text-sm px-3">{model.error}</p>
      )}

      {/* Game info */}
      {model.result && (
        <div className="px-4 py-2 border-b border-slate-600/50 flex flex-wrap gap-x-4 gap-y-1 text-xs">
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

      {/* Moves table */}
      {displayMoves.length > 0 && (
        <div className="max-h-[500px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-700">
              <tr className="border-b border-slate-600">
                <th className="px-3 py-2 text-slate-400 font-medium text-center w-10">#</th>
                <th className="px-3 py-2 text-slate-400 font-medium text-left">White</th>
                <th className="px-3 py-2 text-slate-400 font-medium text-left">Black</th>
              </tr>
            </thead>
            <tbody>
              {displayMoves.map((move) => (
                <tr key={move.number} className="border-b border-slate-600/30 last:border-0">
                  <td className="px-3 py-1 text-slate-500 text-center font-mono">{move.number}</td>
                  <td className="px-3 py-1 text-slate-100 font-mono">{move.white}</td>
                  <td className="px-3 py-1 text-slate-100 font-mono">{move.black || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty loading state */}
      {model.loading && displayMoves.length === 0 && !model.error && (
        <div className="flex items-center justify-center gap-2 py-8">
          <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
          <span className="text-slate-400 text-sm">Processing...</span>
        </div>
      )}
    </div>
  );
}
