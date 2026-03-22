// Shared panel shell — consistent layout for all coach panels
// Wraps PanelHeader + content area so every panel looks identical structurally.

import type { ReactNode } from 'react';
import { PanelHeader } from './PanelHeader';

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
