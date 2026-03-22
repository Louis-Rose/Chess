// Diagram → FEN panel — upload a chess diagram image, extract FEN with Gemini

import { useState, useRef, useCallback } from 'react';
import { Upload, ImageIcon, Clock, Copy, Check, X } from 'lucide-react';
import { Chess } from 'chess.js';
import { useLanguage } from '../../../contexts/LanguageContext';
import { PanelHeader } from '../components/PanelHeader';
import { Chessboard } from '../components/Chessboard';

interface ModelResult {
  name: string;
  fen?: string;
  error?: string;
  elapsed: number;
}

export function DiagramToFenPanel() {
  const { t } = useLanguage();
  const fileRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [modelResults, setModelResults] = useState<Record<string, ModelResult>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [showImageModal, setShowImageModal] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setModelResults({});
    setModels([]);
    setImageFile(file);

    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const analyze = useCallback(async (file: File) => {
    setError('');
    setModelResults({});
    setModels([]);
    setAnalyzing(true);

    try {
      const formData = new FormData();
      formData.append('image', file);

      const res = await fetch('/api/coaches/read-diagram', {
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
          } else if (payload.type === 'result') {
            const { model_id, name, fen, error: err, elapsed } = payload;
            setModelResults(prev => ({
              ...prev,
              [model_id]: { name, fen, error: err, elapsed },
            }));
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setAnalyzing(false);
    }
  }, []);

  const handleClear = () => {
    setPreview(null);
    setImageFile(null);
    setModelResults({});
    setModels([]);
    setError('');
    setAnalyzing(false);
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="max-w-[1600px] mx-auto">
        <PanelHeader title={t('coaches.navDiagram')} />

        <div className="px-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />

          {!preview ? (
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full md:max-w-xl md:mx-auto border-2 border-dashed border-slate-600 rounded-xl p-12 flex flex-col items-center gap-3 hover:border-blue-500 hover:bg-slate-750 transition-colors cursor-pointer"
            >
              <ImageIcon className="w-12 h-12 text-slate-500" />
              <span className="text-slate-300 font-medium">{t('coaches.diagram.uploadPrompt')}</span>
              <span className="text-slate-500 text-sm">{t('coaches.diagram.uploadHint')}</span>
            </button>
          ) : (
            <div className="space-y-4">
              {/* Replace + preview */}
              <div className="flex justify-center gap-2">
                <button
                  onClick={() => { handleClear(); fileRef.current?.click(); }}
                  className="bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  {t('coaches.replaceImage')}
                </button>
                {(models.length > 0 || analyzing) && (
                  <button
                    onClick={handleClear}
                    className="bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <img
                src={preview}
                alt="Diagram"
                className="rounded-xl max-h-80 mx-auto cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => setShowImageModal(true)}
              />

              {/* Analyze button */}
              {!analyzing && models.length === 0 && (
                <div className="flex justify-center">
                  <button
                    onClick={() => imageFile && analyze(imageFile)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
                  >
                    {t('coaches.diagram.analyze')}
                  </button>
                </div>
              )}

              {/* Analyzing spinner */}
              {analyzing && (
                <div className="flex items-center justify-center gap-2 text-slate-400 animate-pulse py-4">
                  <Clock className="w-4 h-4 animate-spin" />
                  <span className="text-sm">{t('coaches.diagram.analyzing')}</span>
                </div>
              )}

              {error && <p className="text-red-400 text-center py-4">{error}</p>}

              {/* Results */}
              {models.length > 0 && (
                <div className="flex flex-col gap-4 items-center max-w-md mx-auto">
                  {models.map((m) => {
                    const mr = modelResults[m.id];
                    return (
                      <FenResultCard
                        key={m.id}
                        name={mr?.name || m.name}
                        fen={mr?.fen}
                        error={mr?.error}
                        elapsed={mr?.elapsed}
                        loading={!mr}
                      />
                    );
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
          onClick={() => setShowImageModal(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-[1.5px] cursor-pointer"
        >
          <img src={preview} alt="Diagram" className="max-w-[90vw] max-h-[90vh] rounded-xl object-contain" />
        </div>
      )}
    </div>
  );
}

function FenResultCard({ name, fen, error, elapsed, loading }: {
  name: string;
  fen?: string;
  error?: string;
  elapsed?: number;
  loading: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!fen) return;
    try { await navigator.clipboard.writeText(fen); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = fen;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Try to validate the FEN
  const validFen = fen && (() => {
    try {
      new Chess(fen);
      return true;
    } catch { return false; }
  })();

  return (
    <div className="bg-slate-700/50 rounded-xl overflow-hidden self-start min-w-[240px] max-w-[320px]">
      <div className="px-3 py-2 border-b border-slate-600 flex items-center justify-center gap-2">
        <span className="text-slate-100 font-medium text-xs">{name}</span>
        {elapsed !== undefined && (
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-slate-400" />
            <span className="text-slate-400 text-xs">{elapsed}s</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <span className="text-slate-500 text-xs animate-pulse">Analyzing diagram...</span>
        </div>
      ) : error ? (
        <p className="text-red-400 text-center py-4 px-3 text-xs">{error}</p>
      ) : fen ? (
        <div className="p-3 space-y-3">
          {/* FEN string */}
          <div className="bg-slate-800 rounded-lg px-3 py-2">
            <p className="text-slate-400 text-[10px] mb-1">FEN</p>
            <p className="text-slate-100 font-mono text-xs break-all select-all">{fen}</p>
          </div>

          {/* Board preview */}
          {validFen && (
            <div className="max-w-[260px] mx-auto">
              <Chessboard pgn={`[FEN "${fen}"]\n[SetUp "1"]\n*`} initialPly={0} />
            </div>
          )}

          {/* Copy button */}
          <button
            onClick={handleCopy}
            className="w-full px-2 py-2 text-center text-xs text-slate-400 hover:bg-slate-600/40 hover:text-slate-200 transition-colors flex items-center justify-center gap-1.5 rounded-lg"
          >
            {copied ? <><Check className="w-3 h-3" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy FEN</>}
          </button>
        </div>
      ) : null}
    </div>
  );
}
