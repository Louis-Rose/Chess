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
  hint: string;
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
      // Clear any text that iOS may have inserted
      el.textContent = '';
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

  return (
    <div className="max-w-lg mx-auto space-y-3">
      {/* Upload box */}
      <div
        onClick={onClick}
        onDrop={onDrop}
        onDragOver={onDrop ? (e => e.preventDefault()) : undefined}
        className="border-2 border-dashed border-slate-600 rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer hover:border-blue-500 transition-colors"
      >
        {icon}
        <p className="text-slate-300 font-medium">{title}</p>
        <p className="text-slate-500 text-sm">{hint}</p>
      </div>

      {/* Paste zone — contenteditable so iOS shows "Paste" on tap */}
      {onPaste && (
        <div
          ref={pasteRef}
          contentEditable
          suppressContentEditableWarning
          className="border-2 border-dashed border-slate-600 rounded-xl py-6 px-4 flex items-center justify-center gap-3 cursor-text outline-none hover:border-blue-500 transition-colors caret-transparent"
          style={{ WebkitUserSelect: 'text', userSelect: 'text' }}
        >
          <ClipboardPaste className="w-6 h-6 text-slate-400 flex-shrink-0 pointer-events-none" />
          <p className="text-slate-300 font-medium pointer-events-none">
            {pasteLabel || 'Paste from clipboard'}{pasteError ? ` ${pasteError}` : ''}
          </p>
        </div>
      )}
    </div>
  );
}
