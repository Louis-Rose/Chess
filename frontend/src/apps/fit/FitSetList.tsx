import { formatSet } from './format';

// The sets logged for an exercise, shown as a two-column table —
// échauffement | travail — under a separator. Warmups are dimmed, working sets
// stand out. Shared by FitSessionDetail and FitExerciseRecent.

export interface DisplaySet { reps: number; weight: number | null; warmup: boolean; }

// "reps × weight" with the "×" kept on a shared centerline; "reps" bodyweight.
function SetCell({ s }: { s: DisplaySet }) {
  if (s.weight == null) return <span>{formatSet(s.weight, s.reps, false)}</span>;
  return (
    <span className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-x-1.5">
      <span className="text-right">{s.reps}</span>
      <span>×</span>
      <span className="text-left">{s.weight} kg</span>
    </span>
  );
}

function SetColumn({ title, sets, className }: { title: string; sets: DisplaySet[]; className: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-xs uppercase tracking-wide text-slate-500">{title}</span>
      {sets.length === 0 ? (
        <span className="text-slate-600">—</span>
      ) : (
        sets.map((s, i) => <span key={i} className={className}><SetCell s={s} /></span>)
      )}
    </div>
  );
}

export function FitSetList({ sets }: { sets: DisplaySet[] }) {
  const warmups = sets.filter(s => s.warmup);
  const work = sets.filter(s => !s.warmup);
  return (
    <div className="mt-2 w-full">
      <div className="h-px w-full bg-slate-700" />
      <div className="mt-2 grid grid-cols-2 gap-x-4 text-sm">
        <SetColumn title="Échauffement" sets={warmups} className="text-slate-400" />
        <SetColumn title="Travail" sets={work} className="font-medium text-slate-100" />
      </div>
    </div>
  );
}
