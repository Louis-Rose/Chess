import type { ReactNode } from 'react';
import { AppSidebar } from './AppSidebar';
import { AppHeader } from './AppHeader';
import { AppTitle } from './AppTitle';
import { LangToggle } from './LangToggle';

// Shared shell for the LUMNA sub-apps: a fixed left sidebar on desktop, and the
// compact AppHeader as a top bar on mobile. `contentClassName` sets the main
// area background (e.g. YC uses near-black).
export function SidebarLayout({
  title,
  contentClassName = 'bg-slate-100 dark:bg-slate-900',
  langToggle = false,
  children,
}: {
  title?: string;
  contentClassName?: string;
  // Activate the FR/EN toggle (default off: most SidebarLayout apps aren't
  // translated, so an active toggle would be a no-op). Translated apps opt in.
  langToggle?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh bg-slate-100 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      <AppSidebar className="sticky top-0 hidden h-dvh md:flex" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="px-4 pt-4 md:hidden">
          <AppHeader title={title} langToggle={langToggle} />
        </div>
        <main className={`min-w-0 flex-1 ${contentClassName}`}>
          {/* Header strip: shown when there's a title, or when only the language
              toggle is active (e.g. the chooser, which has no title but still
              lets you set the global FR/EN preference). */}
          {(title || langToggle) && (
            <div className="relative hidden border-b border-slate-200 px-6 py-5 dark:border-slate-800 md:block">
              <AppTitle title={title} />
              <div className="absolute right-6 top-1/2 -translate-y-1/2">
                <LangToggle disabled={!langToggle} />
              </div>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
