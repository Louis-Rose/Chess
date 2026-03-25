// Diagram → FEN panel — thin view, state lives in CoachesDataContext

import { useState, useRef } from 'react';
import { Upload, ImageIcon, Clock, Copy, Check, X } from 'lucide-react';
import { UploadBox } from '../components/UploadBox';
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const { file: compressed, preview: dataUrl } = await compressImage(file);
    diagramSetImage(compressed, dataUrl);
  };

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
            <UploadBox
              onClick={() => fileRef.current?.click()}
              onPaste={async (file) => {
                const { file: compressed, preview: dataUrl } = await compressImage(file);
                diagramSetImage(compressed, dataUrl);
              }}
              icon={<ImageIcon className="w-10 h-10 text-slate-400" />}
              title={t('coaches.diagram.uploadPrompt')}
              hint={t('coaches.diagram.uploadHint')}
              pasteLabel={t('coaches.pasteClipboard')}
            />
          ) : (
            <div className="space-y-4">
              <div className="flex justify-center gap-2">
                <button
                  onClick={() => { diagramClear(); fileRef.current?.click(); }}
                  className="bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  {t('coaches.replaceImage')}
                </button>
                {(models.length > 0 || analyzing) && (
                  <button
                    onClick={diagramClear}
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

      {showImageModal && preview && (
        <div
          onClick={() => setShowImageModal(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-[1.5px] cursor-pointer"
        >
          <img src={preview} alt="Diagram" className="max-w-[90vw] max-h-[90vh] rounded-xl object-contain" />
        </div>
      )}
    </PanelShell>
  );
}

function FenResultCard({ name, fen, error, elapsed, loading }: DiagramModelResult & { loading: boolean }) {
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

  const validFen = fen && (() => {
    try { new Chess(fen); return true; } catch { return false; }
  })();

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
      ) : fen ? (
        <div className="p-3 space-y-3">
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
      ) : null}
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
