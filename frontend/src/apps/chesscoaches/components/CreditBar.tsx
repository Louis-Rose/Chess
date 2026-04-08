export function CreditBar({ consumed, total }: { consumed: number; total: number }) {
  const pct = total > 0 ? Math.min((consumed / total) * 100, 100) : 0;
  const remaining = total - consumed;
  const full = remaining <= 0;
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${full ? 'bg-slate-500' : 'bg-emerald-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs font-medium tabular-nums ${full ? 'text-slate-500' : 'text-emerald-400'}`}>
        {consumed}/{total}
      </span>
    </div>
  );
}
