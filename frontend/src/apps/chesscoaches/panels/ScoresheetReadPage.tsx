// Scoresheet reader page

import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, Loader2, ImageIcon } from 'lucide-react';
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

export function ScoresheetReadPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ScoresheetResult | null>(null);
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
    setError('');
    setResult(null);

    // Preview
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);

    // Upload
    analyzeImage(file);
  };

  const analyzeImage = async (file: File) => {
    setLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch('/api/coach/read-scoresheet', { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Analysis failed');
      setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col pt-2">
          <button
            onClick={() => navigate('/coach')}
            className="flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors text-base px-2 md:px-4"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Previous</span>
          </button>
          <h1 className="text-lg font-bold text-slate-100 text-center mt-1">{t('coaches.navScoresheets')}</h1>
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
                  onClick={() => { setPreview(null); setResult(null); setError(''); fileInputRef.current?.click(); }}
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

              {/* Results */}
              {result && (
                <div className="space-y-4">
                  {/* Game info */}
                  <div className="bg-slate-700 rounded-xl p-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
                    {result.white_player && (
                      <div><span className="text-slate-400">White:</span> <span className="text-slate-100 font-medium">{result.white_player}</span></div>
                    )}
                    {result.black_player && (
                      <div><span className="text-slate-400">Black:</span> <span className="text-slate-100 font-medium">{result.black_player}</span></div>
                    )}
                    {result.event && (
                      <div><span className="text-slate-400">Event:</span> <span className="text-slate-100 font-medium">{result.event}</span></div>
                    )}
                    {result.date && (
                      <div><span className="text-slate-400">Date:</span> <span className="text-slate-100 font-medium">{result.date}</span></div>
                    )}
                    {result.result && result.result !== '*' && (
                      <div><span className="text-slate-400">Result:</span> <span className="text-slate-100 font-medium">{result.result}</span></div>
                    )}
                  </div>

                  {/* Moves table */}
                  <div className="bg-slate-700 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-600">
                          <th className="px-4 py-3 text-slate-400 font-medium text-center w-16">#</th>
                          <th className="px-4 py-3 text-slate-400 font-medium text-left">White</th>
                          <th className="px-4 py-3 text-slate-400 font-medium text-left">Black</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.moves.map((move) => (
                          <tr key={move.number} className="border-b border-slate-600/50 last:border-0">
                            <td className="px-4 py-2 text-slate-500 text-center font-mono">{move.number}</td>
                            <td className="px-4 py-2 text-slate-100 font-mono">{move.white}</td>
                            <td className="px-4 py-2 text-slate-100 font-mono">{move.black || ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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
