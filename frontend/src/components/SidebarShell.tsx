// Shared sidebar shell used by both Investing and Chess sidebars
// Provides consistent layout, sticky positioning, and bottom toggles

import type { ReactNode } from 'react';
import { ThemeToggle } from './ThemeToggle';
import { LanguageToggle } from './LanguageToggle';

interface SidebarShellProps {
  children: ReactNode;
  bottomContent?: ReactNode;
  hideThemeToggle?: boolean;
  hideLanguageToggle?: boolean;
  fullWidth?: boolean;
}

export function SidebarShell({ children, bottomContent, hideThemeToggle, hideLanguageToggle, fullWidth }: SidebarShellProps) {
  const showBottom = bottomContent || !hideThemeToggle || !hideLanguageToggle;

  return (
    <div className={`dark ${fullWidth ? 'w-full' : 'w-64'} bg-slate-900 h-screen p-4 flex flex-col gap-2 sticky top-0`}>
      <div className={`flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 ${fullWidth ? 'max-w-xs md:max-w-lg mx-auto w-full' : ''}`}>
        {children}
      </div>

      {/* Pinned bottom area */}
      {showBottom && (
        <div className="flex-shrink-0 border-t border-slate-700">
          {bottomContent && <div className="px-2 pt-3 pb-1">{bottomContent}</div>}
          {(!hideThemeToggle || !hideLanguageToggle) && (
            <div className="px-2 pt-2 pb-2">
              <div className="flex items-center justify-center gap-2">
                {!hideThemeToggle && <ThemeToggle />}
                {!hideLanguageToggle && <LanguageToggle />}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
