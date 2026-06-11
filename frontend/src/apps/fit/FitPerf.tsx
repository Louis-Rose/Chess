// Performance status of an exercise vs its personal record: '+' record broken,
// '=' neutral, '-' regression. Shared display helpers for the Calendrier counts
// and the per-exercise badge in the session detail.

export type PerfStatus = '+' | '=' | '-';

// "+2 =1 −1" — the session's record/neutral/regression counts, zeros hidden.
export function PerfCounts({ plus, equal, minus, className }: {
  plus: number;
  equal: number;
  minus: number;
  className?: string;
}) {
  if (!plus && !equal && !minus) return null;
  return (
    <span className={`inline-flex items-center gap-2 tabular-nums ${className ?? ''}`}>
      {plus > 0 && <span className="text-emerald-400">+{plus}</span>}
      {equal > 0 && <span className="text-slate-400">={equal}</span>}
      {minus > 0 && <span className="text-red-400">−{minus}</span>}
    </span>
  );
}

// A small round badge for one exercise's status.
export function PerfBadge({ status }: { status: PerfStatus }) {
  const cls =
    status === '+' ? 'border-emerald-500/60 text-emerald-400'
    : status === '=' ? 'border-slate-600 text-slate-400'
    : 'border-red-500/60 text-red-400';
  return (
    <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${cls}`}>
      {status === '-' ? '−' : status}
    </span>
  );
}
