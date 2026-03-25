// Shared upload box — consistent dashed-border drop zone across all panels
// On mobile: tapping shows a custom action sheet with Photo Library, Camera, Files, and Paste options
// On desktop: tapping opens the standard file picker; paste button shown separately

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
  photoLibraryLabel?: string;
  takePhotoLabel?: string;
  chooseFileLabel?: string;
  cancelLabel?: string;
}

const isMobile = () => typeof window !== 'undefined' && 'ontouchstart' in window;

export function UploadBox({
  onClick, onDrop, onPaste, icon, title, hint,
  pasteLabel, photoLibraryLabel, takePhotoLabel, chooseFileLabel, cancelLabel,
}: UploadBoxProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [waitingForPaste, setWaitingForPaste] = useState(false);
  const [pasteError, setPasteError] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const pasteTargetRef = useRef<HTMLDivElement>(null);
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

  // Listen for paste events on the hidden contenteditable div
  useEffect(() => {
    if (!waitingForPaste) return;
    const target = pasteTargetRef.current;
    if (!target) return;
    target.focus();

    const handlePasteEvent = (e: ClipboardEvent) => {
      e.preventDefault();
      setWaitingForPaste(false);
      const items = e.clipboardData?.items;
      if (items) {
        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            const blob = item.getAsFile();
            if (blob) {
              onPaste?.(new File([blob], 'pasted-image.jpg', { type: item.type }));
              return;
            }
          }
        }
      }
      setPasteError('❌');
    };

    // Also timeout after 5s if user dismisses the paste popup
    const timer = setTimeout(() => setWaitingForPaste(false), 5000);

    target.addEventListener('paste', handlePasteEvent);
    return () => {
      target.removeEventListener('paste', handlePasteEvent);
      clearTimeout(timer);
    };
  }, [waitingForPaste, onPaste]);

  const handlePaste = () => {
    if (!onPaste) return;
    setShowMenu(false);
    setPasteError('');
    setWaitingForPaste(true);
    // On iOS, focusing the contenteditable triggers the paste bar; user taps "Paste"
    setTimeout(() => pasteTargetRef.current?.focus(), 50);
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
    // Forward to the parent onClick handler by simulating the same file into the parent's input
    // We need to propagate the file — call onClick to trigger parent's file input won't work
    // Instead, we fire a custom event with the file
    const file = e.target.files?.[0];
    if (file) {
      // Dispatch the file through the onPaste callback (reused for all file sources)
      onPaste?.(file);
    }
    e.target.value = '';
  };

  const menuItems = [
    { label: photoLibraryLabel || 'Photo Library', icon: Image, action: () => { setShowMenu(false); photoRef.current?.click(); } },
    { label: takePhotoLabel || 'Take a photo', icon: Camera, action: () => { setShowMenu(false); cameraRef.current?.click(); } },
    { label: chooseFileLabel || 'Choose file', icon: FolderOpen, action: () => { setShowMenu(false); fileRef.current?.click(); } },
    { label: (pasteLabel || 'Paste from clipboard') + (pasteError ? ` ${pasteError}` : ''), icon: ClipboardPaste, action: handlePaste },
  ];

  return (
    <div className="max-w-lg mx-auto relative">
      {/* Hidden paste target — contenteditable div that receives paste events on iOS */}
      <div
        ref={pasteTargetRef}
        contentEditable
        suppressContentEditableWarning
        className="fixed -left-[9999px] w-0 h-0 opacity-0"
      />

      {/* Hidden file inputs for mobile action sheet */}
      {onPaste && (
        <>
          <input ref={photoRef} type="file" accept="image/*" onChange={handleFileSelected} className="hidden" />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleFileSelected} className="hidden" />
          <input ref={fileRef} type="file" accept="image/*,.jpg,.jpeg,.png,.webp" onChange={handleFileSelected} className="hidden" />
        </>
      )}

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
