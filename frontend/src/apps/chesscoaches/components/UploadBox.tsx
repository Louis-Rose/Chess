// Shared upload box — consistent dashed-border drop zone across all panels

import { useState } from 'react';
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
  const [pasteError, setPasteError] = useState('');

  const handlePaste = async () => {
    if (!onPaste) return;
    setPasteError('');
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find(t => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const file = new File([blob], 'pasted-image.jpg', { type: imageType });
          onPaste(file);
          return;
        }
      }
      setPasteError(pasteLabel ? '❌' : 'No image in clipboard');
    } catch {
      setPasteError(pasteLabel ? '❌' : 'Clipboard access denied');
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-3">
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
      {onPaste && (
        <button
          onClick={handlePaste}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white text-sm rounded-lg transition-colors"
        >
          <ClipboardPaste className="w-4 h-4" />
          {pasteLabel || 'Paste from clipboard'}
          {pasteError && <span className="text-red-400 ml-1">{pasteError}</span>}
        </button>
      )}
    </div>
  );
}
