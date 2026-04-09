// Diagram → FEN panel — thin view, state lives in CoachesDataContext

import { useState, useRef, useEffect, useCallback } from 'react';
import { ImageIcon, Clock, Copy, Check, X } from 'lucide-react';
import { ImageZoomModal } from '../components/ImageZoomModal';
import { Chess } from 'chess.js';
import { useLanguage } from '../../../contexts/LanguageContext';
import { PanelShell } from '../components/PanelShell';
import { useCoachesData } from '../contexts/CoachesDataContext';
import { compressImage } from '../utils/compressImage';
import type { DiagramModelResult } from '../contexts/CoachesDataContext';

export function DiagramToFenPanel() {
  const { t } = useLanguage();
  const fileRef = useRef<HTMLInputElement>(null);
  const { diagram, diagramSetImage, diagramAnalyze, diagramClear } = useCoachesData();
  const { preview, models, modelResults, analyzing, error } = diagram;
  const [showImageModal, setShowImageModal] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const uploadFromFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const { file: compressed, preview: dataUrl } = await compressImage(file);
    diagramSetImage(compressed, dataUrl);
  }, [diagramSetImage]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFromFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFromFile(file);
  };

  // Paste-from-clipboard support — only active while the empty state is showing
  useEffect(() => {
    if (preview) return;
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith('image/'));
      const file = item?.getAsFile();
      if (file) uploadFromFile(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [preview, uploadFromFile]);

  return (
    <PanelShell title={t('coaches.navDiagram')}>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />

          {!preview ? (
            <div className="max-w-2xl mx-auto space-y-4">
              <div className="text-white text-lg text-center px-2 space-y-1">
                <p>{t('coaches.diagram.explainer')}</p>
                <p>{t('coaches.diagram.explainerNote')}</p>
              </div>
              <div
                onClick={() => fileRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                className={`border-2 border-dashed rounded-xl min-h-[50vh] flex flex-col items-center justify-center gap-4 cursor-pointer transition-colors ${
                  dragOver
                    ? 'border-blue-500 bg-blue-500/5'
                    : 'border-slate-600 hover:border-blue-500 hover:bg-slate-800/30'
                }`}
              >
                <ImageIcon className="w-16 h-16 text-slate-400" />
                <p className="text-slate-200 font-medium text-lg">{t('coaches.diagram.uploadPrompt')}</p>
                <p className="text-slate-500 text-sm">{t('coaches.diagram.dropHint')}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {(models.length > 0 || analyzing) && (
                <div className="flex justify-center">
                  <button
                    onClick={diagramClear}
                    className="bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              <img
                src={preview}
                alt="Diagram"
                className="rounded-xl max-h-80 mx-auto cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => setShowImageModal(true)}
              />

              {!analyzing && models.length === 0 && (
                <div className="flex justify-center">
                  <button
                    onClick={diagramAnalyze}
                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
                  >
                    {t('coaches.diagram.analyze')}
                  </button>
                </div>
              )}

              {analyzing && (
                <div className="flex items-center justify-center gap-2 text-slate-400 animate-pulse py-4">
                  <Clock className="w-4 h-4 animate-spin" />
                  <span className="text-sm">{t('coaches.diagram.analyzing')}</span>
                </div>
              )}

              {error && <p className="text-red-400 text-center py-4">{error}</p>}

              {models.length > 0 && (
                <div className="flex flex-col gap-4 items-center max-w-xl mx-auto">
                  {models.map((m) => {
                    const mr = modelResults[m.id];
                    return (
                      <FenResultCard
                        key={m.id}
                        name={mr?.name || m.name}
                        fens={mr?.fens}
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

      {showImageModal && preview && (
        <ImageZoomModal src={preview} alt="Diagram" onClose={() => setShowImageModal(false)} />
      )}
    </PanelShell>
  );
}

function FenResultCard({ name, fens, error, elapsed, loading }: DiagramModelResult & { loading: boolean }) {
  return (
    <div className="bg-slate-700/50 rounded-xl overflow-hidden w-full">
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
      ) : fens && fens.length > 0 ? (
        <div className="p-3 space-y-4">
          {fens.map((fen, i) => (
            <FenEntry key={i} fen={fen} index={i} total={fens.length} />
          ))}
        </div>
      ) : (
        <p className="text-slate-500 text-center py-4 px-3 text-xs">No diagram detected</p>
      )}
    </div>
  );
}

function FenEntry({ fen, index, total }: { fen: string; index: number; total: number }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
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

  const validFen = (() => {
    try { new Chess(fen); return true; } catch { return false; }
  })();

  return (
    <div className="space-y-3">
      {total > 1 && (
        <p className="text-slate-400 text-[11px] font-medium">Diagram {index + 1} / {total}</p>
      )}
      <div className="bg-slate-800 rounded-lg px-3 py-2">
        <p className="text-slate-400 text-[10px] mb-1">FEN</p>
        <p className="text-slate-100 font-mono text-xs break-all select-all">{fen}</p>
      </div>

      {validFen && <StaticBoard fen={fen} />}

      <button
        onClick={handleCopy}
        className="w-full px-2 py-2 text-center text-xs text-slate-400 hover:bg-slate-600/40 hover:text-slate-200 transition-colors flex items-center justify-center gap-1.5 rounded-lg"
      >
        {copied ? <><Check className="w-3 h-3" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy FEN</>}
      </button>
    </div>
  );
}

import { pieceImageUrl, BOARD_LIGHT as LIGHT, BOARD_DARK as DARK } from '../utils/pieces';

function StaticBoard({ fen }: { fen: string }) {
  const rows = fen.split(' ')[0].split('/');
  const board: (string | null)[][] = rows.map(row => {
    const squares: (string | null)[] = [];
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') for (let i = 0; i < parseInt(ch); i++) squares.push(null);
      else squares.push(ch);
    }
    return squares;
  });

  return (
    <div className="mx-auto rounded-lg overflow-hidden shadow-lg" style={{ maxWidth: 400 }}>
      <div className="grid grid-cols-8 grid-rows-8 aspect-square">
        {board.map((row, r) =>
          row.map((piece, c) => {
            const isLight = (r + c) % 2 === 0;
            return (
              <div
                key={`${r}-${c}`}
                className="relative select-none"
                style={{ backgroundColor: isLight ? LIGHT : DARK }}
              >
                {c === 0 && (
                  <span className="absolute top-0.5 left-0.5 text-[0.6rem] font-bold leading-none pointer-events-none" style={{ color: isLight ? DARK : LIGHT }}>
                    {8 - r}
                  </span>
                )}
                {r === 7 && (
                  <span className="absolute bottom-0.5 right-1 text-[0.6rem] font-bold leading-none pointer-events-none" style={{ color: isLight ? DARK : LIGHT }}>
                    {'abcdefgh'[c]}
                  </span>
                )}
                {piece && (
                  <img
                    src={pieceImageUrl(piece)}
                    alt=""
                    className="absolute inset-[5%] w-[90%] h-[90%] pointer-events-none"
                    draggable={false}
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
