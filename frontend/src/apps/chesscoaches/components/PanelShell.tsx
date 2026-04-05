// Shared panel shell — consistent layout for all coach panels
// Wraps PanelHeader + content area so every panel looks identical structurally.

import type { ReactNode } from 'react';
import { PanelHeader } from './PanelHeader';

// Shared button class helpers for consistent sizing across panels
// Color varies per page — pass 'emerald', 'purple', 'blue', etc.
const BTN_COLORS: Record<string, string> = {
  emerald: 'bg-emerald-600 hover:bg-emerald-500',
  purple: 'bg-purple-600 hover:bg-purple-500',
  blue: 'bg-blue-600 hover:bg-blue-500',
};
const BTN_BASE = 'px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors';
export const btnPrimary = (color: string = 'emerald') =>
  `${BTN_BASE} ${BTN_COLORS[color] || BTN_COLORS.emerald}`;
export const BTN_GHOST = 'px-4 py-2 text-slate-400 hover:text-slate-200 text-sm transition-colors';

interface PanelShellProps {
  title: string;
  children: ReactNode;
  onBack?: () => void;
}

export function PanelShell({ title, children, onBack }: PanelShellProps) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 mt-2">
      <PanelHeader title={title} onBack={onBack} />
      <div className="mx-[5%] md:mx-auto">
        {children}
      </div>
    </div>
  );
}
