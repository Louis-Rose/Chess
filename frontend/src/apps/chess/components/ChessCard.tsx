import type { ReactNode } from 'react';

export function ChessCard({ title, action, children }: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="bg-slate-700 rounded-xl p-2 sm:p-5 select-text">
      {(title || action) && (
        <div className="relative z-10 flex items-center justify-center py-3">
          {title && <h2 className="text-lg font-bold text-slate-100 text-center select-text">{title}</h2>}
          {action && <div className="absolute right-0">{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
