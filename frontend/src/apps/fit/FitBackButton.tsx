import { ArrowLeft } from 'lucide-react';

// The app's single "Précédent" back link: small and discreet, top-left of a
// screen. Used directly by FitShell and by screens that lay out their own header.
export function FitBackButton({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`self-start inline-flex items-center gap-1.5 py-1 text-xs text-slate-300 transition-colors hover:text-white ${className}`}
    >
      <ArrowLeft className="h-4 w-4" />
      <span>Précédent</span>
    </button>
  );
}
