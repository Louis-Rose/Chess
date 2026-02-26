export type TimePeriod = '1M' | '3M' | '6M' | '1Y' | '2Y' | 'ALL';

const TIME_PERIODS: TimePeriod[] = ['ALL', '2Y', '1Y', '6M', '3M', '1M'];

export function TimePeriodToggle({ selected, onChange }: { selected: TimePeriod; onChange: (p: TimePeriod) => void }) {
  return (
    <div className="inline-flex bg-slate-800 rounded-lg p-0.5 gap-0.5">
      {TIME_PERIODS.map(p => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
            selected === p
              ? 'bg-slate-600 text-white'
              : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

export function getDateCutoff(period: TimePeriod): string | null {
  if (period === 'ALL') return null;
  const now = new Date();
  const months: Record<Exclude<TimePeriod, 'ALL'>, number> = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12, '2Y': 24 };
  now.setMonth(now.getMonth() - months[period]);
  return now.toISOString().slice(0, 10);
}
