// Shared upload box — dashed-border drop zone + paste zone below it
// Upload box opens native file picker; paste zone is a contenteditable that receives iOS paste events

import { useRef, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ClipboardPaste } from 'lucide-react';

interface UploadBoxProps {
  onClick: () => void;
  onDrop?: (e: React.DragEvent) => void;
  onPaste?: (file: File) => void;
  icon: ReactNode;
  title: string;
  hint?: string;
  pasteLabel?: string;
}

export function UploadBox({ onClick, onDrop, onPaste, icon, title, hint, pasteLabel }: UploadBoxProps) {
  const pasteRef = useRef<HTMLDivElement>(null);
  const [pasteError, setPasteError] = useState('');

  // Listen for paste events on the contenteditable zone
  useEffect(() => {
    const el = pasteRef.current;
    if (!el || !onPaste) return;

    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      el.innerHTML = '&nbsp;';
      const items = e.clipboardData?.items;
      if (items) {
        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            const blob = item.getAsFile();
            if (blob) {
              setPasteError('');
              onPaste(new File([blob], 'pasted-image.jpg', { type: item.type }));
              return;
            }
          }
        }
      }
      setPasteError('❌');
    };

    el.addEventListener('paste', handlePaste);
    return () => el.removeEventListener('paste', handlePaste);
  }, [onPaste]);

  const rowClass = "border-2 border-dashed border-slate-600 rounded-xl py-5 px-5 flex items-center gap-4 hover:border-blue-500 transition-colors";

  return (
    <div className="max-w-lg mx-auto space-y-3">
      {/* Upload box */}
      <div
        onClick={onClick}
        onDrop={onDrop}
        onDragOver={onDrop ? (e => e.preventDefault()) : undefined}
        className={`${rowClass} cursor-pointer`}
      >
        <div className="flex-shrink-0 [&>svg]:w-6 [&>svg]:h-6 text-slate-400">{icon}</div>
        <div>
          <p className="text-slate-300 font-medium">{title}</p>
          {hint && <p className="text-slate-500 text-sm">{hint}</p>}
        </div>
      </div>

      {/* Paste zone — contenteditable so iOS shows "Paste" on tap */}
      {onPaste && (
        <div className="relative">
          {/* Visual label layer — not interactive */}
          <div className={`${rowClass} pointer-events-none`}>
            <ClipboardPaste className="w-6 h-6 text-slate-400 flex-shrink-0" />
            <p className="text-slate-300 font-medium">
              {pasteLabel || 'Paste from clipboard'}{pasteError ? ` ${pasteError}` : ''}
            </p>
          </div>
          {/* Invisible contenteditable on top — receives taps and paste events */}
          <div
            ref={pasteRef}
            contentEditable
            suppressContentEditableWarning
            className="absolute inset-0 outline-none caret-transparent opacity-0 cursor-text"
            style={{ WebkitUserSelect: 'text', userSelect: 'text', fontSize: '16px' }}
          >
            &nbsp;
          </div>
        </div>
      )}
    </div>
  );
}
