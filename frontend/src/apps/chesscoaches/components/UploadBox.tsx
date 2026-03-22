// Shared upload box — consistent dashed-border drop zone across all panels

import type { ReactNode } from 'react';

interface UploadBoxProps {
  onClick: () => void;
  onDrop?: (e: React.DragEvent) => void;
  icon: ReactNode;
  title: string;
  hint: string;
}

export function UploadBox({ onClick, onDrop, icon, title, hint }: UploadBoxProps) {
  return (
    <div
      onClick={onClick}
      onDrop={onDrop}
      onDragOver={onDrop ? (e => e.preventDefault()) : undefined}
      className="border-2 border-dashed border-slate-600 rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer hover:border-blue-500 transition-colors max-w-lg mx-auto"
    >
      {icon}
      <p className="text-slate-300 font-medium">{title}</p>
      <p className="text-slate-500 text-sm">{hint}</p>
    </div>
  );
}
