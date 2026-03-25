// Shared upload box — consistent dashed-border drop zone across all panels
// On mobile: tapping shows a custom action sheet with Photo Library, Camera, Files, and Paste options
// On desktop: tapping opens the standard file picker

import { useState, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Image, Camera, FolderOpen, ClipboardPaste } from 'lucide-react';

interface UploadBoxProps {
  onClick: () => void;
  onDrop?: (e: React.DragEvent) => void;
  onPaste?: (file: File) => void;
  icon: ReactNode;
  title: string;
  hint: string;
  pasteLabel?: string;
  pasteHint?: string;
  photoLibraryLabel?: string;
  takePhotoLabel?: string;
  chooseFileLabel?: string;
  cancelLabel?: string;
}

const isMobile = () => typeof window !== 'undefined' && 'ontouchstart' in window;

export function UploadBox({
  onClick, onDrop, onPaste, icon, title, hint,
  pasteLabel, pasteHint, photoLibraryLabel, takePhotoLabel, chooseFileLabel, cancelLabel,
}: UploadBoxProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showPasteZone, setShowPasteZone] = useState(false);
  const [pasteError, setPasteError] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const pasteZoneRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showMenu]);

  // When paste zone is shown, focus it and listen for paste events
  useEffect(() => {
    if (!showPasteZone) return;
    const el = pasteZoneRef.current;
    if (!el) return;

    // Focus after a tick so iOS registers it
    const focusTimer = setTimeout(() => el.focus(), 100);

    const handlePasteEvent = (e: ClipboardEvent) => {
      e.preventDefault();
      const items = e.clipboardData?.items;
      if (items) {
        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            const blob = item.getAsFile();
            if (blob) {
              setShowPasteZone(false);
              setPasteError('');
              onPaste?.(new File([blob], 'pasted-image.jpg', { type: item.type }));
              return;
            }
          }
        }
      }
      setPasteError('❌');
    };

    el.addEventListener('paste', handlePasteEvent);
    return () => {
      clearTimeout(focusTimer);
      el.removeEventListener('paste', handlePasteEvent);
    };
  }, [showPasteZone, onPaste]);

  const handlePasteAction = () => {
    setShowMenu(false);
    setPasteError('');
    setShowPasteZone(true);
  };

  const handleBoxClick = () => {
    if (onPaste && isMobile()) {
      setShowMenu(true);
      setPasteError('');
    } else {
      onClick();
    }
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onPaste?.(file);
    e.target.value = '';
  };

  const menuItems = [
    { label: photoLibraryLabel || 'Photo Library', icon: Image, action: () => { setShowMenu(false); photoRef.current?.click(); } },
    { label: takePhotoLabel || 'Take a photo', icon: Camera, action: () => { setShowMenu(false); cameraRef.current?.click(); } },
    { label: chooseFileLabel || 'Choose file', icon: FolderOpen, action: () => { setShowMenu(false); fileRef.current?.click(); } },
    { label: (pasteLabel || 'Paste from clipboard') + (pasteError ? ` ${pasteError}` : ''), icon: ClipboardPaste, action: handlePasteAction },
  ];

  return (
    <div className="max-w-lg mx-auto relative">
      {/* Hidden file inputs for mobile action sheet */}
      {onPaste && (
        <>
          <input ref={photoRef} type="file" accept="image/*" onChange={handleFileSelected} className="hidden" />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleFileSelected} className="hidden" />
          <input ref={fileRef} type="file" accept="image/*,.jpg,.jpeg,.png,.webp" onChange={handleFileSelected} className="hidden" />
        </>
      )}

      {/* Normal upload box or paste zone */}
      {showPasteZone ? (
        <div
          ref={pasteZoneRef}
          contentEditable
          suppressContentEditableWarning
          onBlur={() => setTimeout(() => setShowPasteZone(false), 200)}
          className="border-2 border-dashed border-blue-500 bg-blue-500/10 rounded-xl p-10 flex flex-col items-center gap-3 cursor-text outline-none min-h-[180px] justify-center caret-transparent [&>*]:pointer-events-none"
          style={{ WebkitUserSelect: 'text', userSelect: 'text' }}
        >
          <ClipboardPaste className="w-10 h-10 text-blue-400" />
          <p className="text-blue-300 font-medium text-center">{pasteHint || 'Tap and hold here, then tap "Paste"'}</p>
          <button
            onClick={(e) => { e.stopPropagation(); setShowPasteZone(false); }}
            className="mt-2 text-slate-400 text-sm underline pointer-events-auto"
          >
            {cancelLabel || 'Cancel'}
          </button>
        </div>
      ) : (
        <div
          onClick={handleBoxClick}
          onDrop={onDrop}
          onDragOver={onDrop ? (e => e.preventDefault()) : undefined}
          className="border-2 border-dashed border-slate-600 rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer hover:border-blue-500 transition-colors"
        >
          {icon}
          <p className="text-slate-300 font-medium">{title}</p>
          <p className="text-slate-500 text-sm">{hint}</p>
        </div>
      )}

      {/* Mobile action sheet — iOS-style */}
      {showMenu && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setShowMenu(false)}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
          {/* Sheet */}
          <div
            ref={menuRef}
            className="relative w-[calc(100%-24px)] max-w-sm mb-2 animate-in slide-in-from-bottom-4 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="bg-[#2c2c2e]/95 backdrop-blur-xl rounded-[14px] overflow-hidden">
              {menuItems.map(({ label, icon: Icon, action }, i) => (
                <button
                  key={i}
                  onClick={action}
                  className={`w-full px-4 py-[14px] flex items-center gap-3 text-[#f5f5f7] text-[17px] active:bg-white/10 ${
                    i > 0 ? 'border-t border-white/8' : ''
                  }`}
                >
                  <Icon className="w-[22px] h-[22px] text-[#8e8e93] flex-shrink-0" />
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowMenu(false)}
              className="w-full mt-2 py-[14px] bg-[#2c2c2e]/95 backdrop-blur-xl rounded-[14px] text-[#0a84ff] text-[17px] font-semibold active:bg-white/10"
            >
              {cancelLabel || 'Cancel'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
