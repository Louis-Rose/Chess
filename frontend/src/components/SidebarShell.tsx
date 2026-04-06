import type { ReactNode } from 'react';

interface SidebarShellProps {
  children: ReactNode;
  bottomContent?: ReactNode;
  fullWidth?: boolean;
}

export function SidebarShell({ children, bottomContent, fullWidth }: SidebarShellProps) {
  return (
    <div className={`dark ${fullWidth ? 'w-full' : 'w-64'} bg-slate-900 h-screen p-4 flex flex-col gap-2 sticky top-0`}>
      <div className={`flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 ${fullWidth ? 'max-w-xs md:max-w-lg mx-auto w-full' : ''}`}>
        {children}
      </div>
      {bottomContent && (
        <div className="flex-shrink-0 border-t border-slate-700">
          <div className="px-2 pt-3 pb-1">{bottomContent}</div>
        </div>
      )}
    </div>
  );
}
