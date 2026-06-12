import type { ReactNode } from 'react';
import { FitBackButton } from './FitBackButton';

// Shared shell for the Programme step pages (split, exercises, and future ones).
// Owns the layout so every step is spaced identically by construction:
//   - fills the height below the header, reserves the bottom-bar height
//   - optional top-left "Précédent" back link
//   - centered title + optional counter
//   - 48px gap title -> question, 36px gap question -> options
//   - optional footer pinned to the bottom (e.g. a "Suivant" button)
interface FitShellProps {
  title?: string;         // omitted when the page owns its own heading (e.g. inside a card)
  question?: string;      // omitted on pages that aren't a question (e.g. the overview)
  counter?: string;       // e.g. "1 / 11"
  onBack?: () => void;    // renders a "Précédent" text link when provided
  footer?: ReactNode;     // pinned to the bottom
  children: ReactNode;    // the options / body
}

export function FitShell({ title, question, counter, onBack, footer, children }: FitShellProps) {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem-1px)] w-full max-w-md flex-col px-5 pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      {onBack && <FitBackButton onClick={onBack} />}

      {title && <h1 className={`text-center text-2xl font-semibold ${onBack ? 'mt-4' : ''}`}>{title}</h1>}
      {counter && <p className="mt-1 text-center text-xs text-slate-500">{counter}</p>}
      {question && <p className="mt-12 text-center text-lg text-white">{question}</p>}

      <div className={question ? 'mt-9' : 'mt-10'}>{children}</div>

      {footer && <div className="mt-auto flex justify-center">{footer}</div>}
    </div>
  );
}
