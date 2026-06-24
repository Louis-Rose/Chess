import type { ReactNode } from 'react';
import { AppSidebar } from './AppSidebar';
import { AppHeader } from './AppHeader';

// Shared shell for the LUMNA sub-apps: a fixed left sidebar on desktop, and the
// compact AppHeader as a top bar on mobile. `contentClassName` sets the main
// area background (e.g. YC uses near-black).
export function SidebarLayout({
  title,
  contentClassName = 'bg-slate-900',
  children,
}: {
  title?: string;
  contentClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh bg-slate-900 text-slate-100">
      <AppSidebar className="sticky top-0 hidden h-dvh md:flex" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="px-4 pt-4 md:hidden">
          <AppHeader title={title} />
        </div>
        <main className={`min-w-0 flex-1 ${contentClassName}`}>
          {title && (
            <div className="hidden border-b border-slate-800 px-6 py-4 md:block">
              <h1 className="text-center text-lg font-semibold">{title}</h1>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
