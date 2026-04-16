// Shared processing progress bar used by the diagram panel.
// The caller supplies the progress math and any status copy shown below the bar.

import type { ReactNode } from 'react';
import { Clock, X } from 'lucide-react';

interface ProcessingProgressBarProps {
  title: string;
  pct: number;             // 0-100
  elapsedSec: number;
  maxAvgSec?: number;
  allDone: boolean;
  onCancel?: () => void;
  cancelLabel: string;
  statusNode?: ReactNode;
}

export function ProcessingProgressBar({
  title,
  pct,
  elapsedSec,
  maxAvgSec,
  allDone,
  onCancel,
  cancelLabel,
  statusNode,
}: ProcessingProgressBarProps) {
  return (
    <div className="flex justify-center">
      <div className="relative bg-slate-700/40 rounded-xl p-4 min-w-[300px] max-w-[400px] w-full">
        {onCancel && (
          <button
            onClick={onCancel}
            className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-600/80 hover:bg-red-600 text-slate-300 text-xs transition-colors"
          >
            <X className="w-3 h-3" />
            {cancelLabel}
          </button>
        )}
        <div className="flex items-center mb-1.5">
          <span className="text-sm text-slate-300 inline-flex items-center gap-1.5">
            {!allDone && <Clock className="w-3.5 h-3.5 animate-spin" />}
            {title}
          </span>
        </div>
        <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${
              allDone ? 'bg-emerald-500' : 'bg-blue-500'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="text-center mt-1">
          <span className={`text-sm font-medium ${allDone ? 'text-emerald-500' : 'text-blue-500'}`}>
            {pct}%
          </span>
        </div>
        <div className="text-center mt-0.5">
          <span className="text-xs text-slate-400">
            {elapsedSec}s
            {!allDone && maxAvgSec && maxAvgSec > 0 ? ` / ~${maxAvgSec}s` : ''}
          </span>
        </div>
        {statusNode && <div className="mt-2">{statusNode}</div>}
      </div>
    </div>
  );
}
