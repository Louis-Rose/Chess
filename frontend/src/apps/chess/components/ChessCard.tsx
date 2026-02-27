import type { ReactNode } from 'react';

export function ChessCard({ title, action, leftAction, children }: {
  title?: string;
  action?: ReactNode;
  leftAction?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="bg-slate-700 rounded-xl p-2 sm:p-5 select-text">
      {(title || action || leftAction) && (
        <div className="z-10 py-3">
          {/* On mobile: action on top right-aligned, then title + leftAction below */}
          {/* On desktop: single row with leftAction | title | action */}
          {action && (
            <div className="flex justify-end md:hidden mb-2">{action}</div>
          )}
          <div className="relative flex items-center justify-center">
            {leftAction && <div className="absolute left-0">{leftAction}</div>}
            {title && <h2 className="text-lg font-bold text-slate-100 text-center select-text">{title}</h2>}
            {action && <div className="absolute right-0 hidden md:block">{action}</div>}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
