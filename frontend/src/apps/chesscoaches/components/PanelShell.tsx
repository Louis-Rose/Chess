// Shared panel shell — consistent layout for all coach panels
// Wraps PanelHeader + content area so every panel looks identical structurally.

import type { ReactNode } from 'react';
import { PanelHeader } from './PanelHeader';

// Shared button class constants for consistent styling across panels
export const BTN_PRIMARY = 'px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors';
export const BTN_GHOST = 'px-4 py-2 text-slate-400 hover:text-slate-200 text-sm transition-colors';

interface PanelShellProps {
  title: string;
  children: ReactNode;
}

export function PanelShell({ title, children }: PanelShellProps) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 mt-2">
      <PanelHeader title={title} />
      <div className="mx-[5%] md:mx-auto">
        {children}
      </div>
    </div>
  );
}
