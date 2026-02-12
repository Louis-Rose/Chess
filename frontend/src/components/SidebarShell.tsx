// Shared sidebar shell used by both Investing and Chess sidebars
// Provides consistent layout, sticky positioning, and bottom toggles

import type { ReactNode } from 'react';
import { ThemeToggle } from './ThemeToggle';
import { LanguageToggle } from './LanguageToggle';

interface SidebarShellProps {
  children: ReactNode;
}

export function SidebarShell({ children }: SidebarShellProps) {
  return (
    <div className="dark w-64 bg-slate-900 h-screen p-4 flex flex-col gap-2 sticky top-0">
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
        {children}
      </div>

      {/* Theme & Language - pinned at bottom */}
      <div className="flex-shrink-0 px-2 pt-2 pb-2 border-t border-slate-700">
        <div className="flex items-center justify-center gap-2">
          <ThemeToggle />
          <LanguageToggle />
        </div>
      </div>
    </div>
  );
}
