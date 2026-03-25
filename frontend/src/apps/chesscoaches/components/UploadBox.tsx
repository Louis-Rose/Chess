// Shared upload box — dashed-border drop zone that opens the native file picker

import type { ReactNode } from 'react';

interface UploadBoxProps {
  onClick: () => void;
  onDrop?: (e: React.DragEvent) => void;
  icon: ReactNode;
  title: string;
  hint?: string;
}

export function UploadBox({ onClick, onDrop, icon, title, hint }: UploadBoxProps) {
  return (
    <div className="max-w-lg mx-auto">
      <div
        onClick={onClick}
        onDrop={onDrop}
        onDragOver={onDrop ? (e => e.preventDefault()) : undefined}
        className="border-2 border-dashed border-slate-600 rounded-xl py-5 px-5 flex items-center justify-center gap-4 cursor-pointer hover:border-blue-500 transition-colors"
      >
        <div className="flex-shrink-0 [&>svg]:w-6 [&>svg]:h-6 text-slate-400">{icon}</div>
        <div>
          <p className="text-slate-300 font-medium">{title}</p>
          {hint && <p className="text-slate-500 text-sm">{hint}</p>}
        </div>
      </div>
    </div>
  );
}
