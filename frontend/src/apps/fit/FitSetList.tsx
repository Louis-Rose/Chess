import { formatSet } from './format';

// The sets logged for an exercise, shown as a bordered two-column table —
// échauffement | travail — one set per row, each column padded to the same
// number of rows. Warmups are dimmed, working sets stand out. Shared by
// FitSessionDetail and FitExerciseRecent.

export interface DisplaySet { reps: number; weight: number | null; warmup: boolean; reps_right?: number | null; }

const cell = 'border border-slate-700 px-2 py-1 text-center';

export function FitSetList({ sets }: { sets: DisplaySet[] }) {
  const warmups = sets.filter(s => s.warmup);
  const work = sets.filter(s => !s.warmup);
  const rows = Math.max(warmups.length, work.length);
  return (
    <table className="mt-2 w-full table-fixed border-collapse text-sm">
      <thead>
        <tr>
          <th className={`${cell} w-1/2 text-xs font-normal uppercase tracking-wide text-slate-500`}>Échauffement</th>
          <th className={`${cell} w-1/2 text-xs font-normal uppercase tracking-wide text-white`}>Travail</th>
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }, (_, i) => (
          <tr key={i}>
            <td className={`${cell} text-slate-400`}>
              {warmups[i] ? formatSet(warmups[i].weight, warmups[i].reps, false, warmups[i].reps_right) : ''}
            </td>
            <td className={`${cell} font-medium text-slate-100`}>
              {work[i] ? formatSet(work[i].weight, work[i].reps, false, work[i].reps_right) : ''}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
