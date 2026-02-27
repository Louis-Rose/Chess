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
          {/* On mobile: leftAction + action on top row, title below */}
          {/* On desktop: single row with leftAction | title | action */}
          {(action || leftAction) && (
            <div className="flex items-center justify-between md:hidden mb-2">
              <div>{leftAction}</div>
              <div>{action}</div>
            </div>
          )}
          <div className="relative flex items-center justify-center">
            {leftAction && <div className="absolute left-0 hidden md:block">{leftAction}</div>}
            {title && <h2 className="text-lg font-bold text-slate-100 text-center select-text">{title}</h2>}
            {action && <div className="absolute right-0 hidden md:block">{action}</div>}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
