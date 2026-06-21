import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { ChevronRight, Loader2 } from 'lucide-react';
import { fitRequest } from './fitAuth';
import { leafLabel, muscleOf, MUSCLE_ORDER, sortLabels, isSignedExercise } from './programData';
import { FitBackButton } from './FitBackButton';
import { FitSessionDetail } from './FitSessionDetail';
import { useCustomExercises } from './useCustomExercises';

// Suivi tab: one entry per exercise the user has worked. Tap an exercise to see
// its tracking table — one row per working weight (heaviest on top), columns most
// recent first, each cell the working reps done at that weight that session. Tap
// a cell to open the session it came from.

interface WeightReps { weight: number | null; reps: number; sets: number; }
interface SessionPerf { id: number; number: number | null; date: string | null; weights: WeightReps[]; }
interface ExercisePerf { exercise: string; sessions: SessionPerf[]; }

export function FitPerformances() {
  useCustomExercises();   // so muscleOf groups custom exercises correctly
  const [exercises, setExercises] = useState<ExercisePerf[]>([]);
  const [programLeaves, setProgramLeaves] = useState<Set<string>>(new Set());
  const [workWeights, setWorkWeights] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);

  useEffect(() => {
    // Show only exercises currently in the program, so fetch the logged
    // performances, the program's selected exercises, and the deduced working
    // weights (the threshold above which a set is a "higher weight" attempt).
    Promise.all([
      fitRequest(() => axios.get<{ exercises: ExercisePerf[] }>('/api/fit/performances')),
      fitRequest(() => axios.get<{ selections: Record<string, string[]> }>('/api/fit/exercises')),
      fitRequest(() => axios.get<{ weights: Record<string, number> }>('/api/fit/work-weights')),
    ])
      .then(([perfRes, exRes, wwRes]) => {
        setExercises(perfRes.data.exercises ?? []);
        const leaves = new Set<string>();
        for (const arr of Object.values(exRes.data.selections ?? {})) for (const l of arr) leaves.add(l);
        setProgramLeaves(leaves);
        setWorkWeights(wwRes.data.weights ?? {});
      })
      .catch(() => { /* show empty */ })
      .finally(() => setLoading(false));
  }, []);

  // A tapped cell opens that session, showing only this exercise's section;
  // "Précédent" returns to the table.
  if (sessionId != null)
    return <FitSessionDetail sessionId={sessionId} exercise={selected ?? undefined} onBack={() => setSessionId(null)} />;

  const current = selected != null ? exercises.find(e => e.exercise === selected) ?? null : null;
  if (current) return <PerformanceDetail perf={current} workWeight={workWeights[current.exercise] ?? null} onBack={() => setSelected(null)} onOpenSession={setSessionId} />;

  // Group worked exercises by muscle, in catalogue order, sorted within.
  // Only exercises currently in the program are shown.
  const byMuscle = new Map<string, string[]>();
  for (const e of exercises) {
    if (!programLeaves.has(e.exercise)) continue;
    const m = muscleOf(e.exercise);
    if (!m) continue;
    if (!byMuscle.has(m)) byMuscle.set(m, []);
    byMuscle.get(m)!.push(e.exercise);
  }
  const groups = MUSCLE_ORDER
    .filter(m => byMuscle.has(m))
    .map(m => ({ name: m, leaves: sortLabels(byMuscle.get(m)!) }));

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem-1px)] w-full max-w-md flex-col px-5 pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <h1 className="text-center text-2xl font-semibold">Progrès</h1>

      {loading ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      ) : groups.length === 0 ? (
        <p className="mt-10 text-center text-sm text-slate-400">Aucune performance enregistrée pour le moment.</p>
      ) : (
        <div className="mx-auto mt-8 flex w-full max-w-[22rem] flex-col gap-6">
          {groups.map(g => (
            <section key={g.name}>
              <h2 className="text-center text-xs uppercase tracking-wide text-slate-500">{g.name}</h2>
              <div className="mt-2 flex flex-col gap-2">
                {g.leaves.map(leaf => (
                  <button
                    key={leaf}
                    type="button"
                    onClick={() => setSelected(leaf)}
                    className="relative rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3 text-center font-medium text-slate-100 transition-colors active:bg-slate-800"
                  >
                    {leafLabel(leaf)}
                    <ChevronRight className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// Bodyweight (null or 0) reads "0 kg" for signed exercises (the reference between
// aide and lest), else "PdC"; signed positives carry a leading "+".
const weightLabel = (w: number | null, signed: boolean) =>
  w == null || w === 0 ? (signed ? '0 kg' : 'PdC') : signed && w > 0 ? `+${w} kg` : `${w} kg`;

// Cell sizing (px) — used to wrap a too-long weight row into several rows so the
// table only ever scrolls vertically. Keep in sync with the w-/label classes.
const LABEL_PX = 64;   // w-16
const CELL_PX = 81;    // w-20 (80px) + 1px cushion so we never overflow

// Wrap a weight's sessions (given oldest → newest) into rows of n, most recent
// row on top. Chunking from the oldest keeps every row complete except the last
// (newest) chunk; reversing puts that — the only possibly-incomplete row — on
// top. Within each row, oldest stays on the left and newest on the right.
function wrapRows<T>(arr: T[], n: number): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < arr.length; i += n) groups.push(arr.slice(i, i + n));
  return groups.reverse();
}

function PerformanceDetail({ perf, workWeight, onBack, onOpenSession }: {
  perf: ExercisePerf;
  workWeight: number | null;   // deduced working weight; sessions above it are "higher weight" attempts
  onBack: () => void;
  onOpenSession: (id: number) => void;
}) {
  // Below the deduced working weight, the working weight climbs: track its
  // running max over the sessions (oldest → newest). Every session is placed in
  // the row of the working weight in force at the time; a session whose heaviest
  // set was below it (a down day) still sits in that row but is flagged "Lower
  // weight". A session ABOVE the deduced working weight is a "higher weight"
  // attempt: it sits in the working-weight row, never raises the running max,
  // and is flagged "Higher weight" instead of its reps.
  const lift = (w: number | null) => w ?? 0;   // bodyweight counts as 0
  const signed = isSignedExercise(perf.exercise);
  // Bodyweight is stored as null on old sets and 0 on newer ones — collapse both
  // to one row (0 for signed exercises, null otherwise) so it isn't split in two.
  const bodyKey: number | null = signed ? 0 : null;
  const ceiling = workWeight;                   // null when no working weight known yet
  let maxLift = -Infinity;
  let curRow: number | null = null;
  const cells = perf.sessions.flatMap(s => {
    if (s.weights.length === 0) return [];
    const top = s.weights.reduce((a, b) => (lift(b.weight) > lift(a.weight) ? b : a));
    // actualWeight = the session's own top weight (shown on higher/lower cells,
    // which sit in a row whose header weight differs from what was actually done).
    if (ceiling != null && lift(top.weight) > lift(ceiling)) {
      const rowW = lift(ceiling) === 0 ? bodyKey : ceiling;
      return [{ id: s.id, number: s.number, reps: top.reps, sets: top.sets, rowWeight: rowW, lower: false, higher: true, actualWeight: top.weight }];
    }
    let lower = false;
    if (lift(top.weight) >= maxLift) { maxLift = lift(top.weight); curRow = lift(top.weight) === 0 ? bodyKey : top.weight; }
    else lower = true;
    return [{ id: s.id, number: s.number, reps: top.reps, sets: top.sets, rowWeight: curRow, lower, higher: false, actualWeight: top.weight }];
  });

  // Rows = the distinct working weights, heaviest first (bodyweight last).
  const weights = Array.from(new Set(cells.map(c => c.rowWeight)))
    .sort((a, b) => lift(b) - lift(a));

  // A weight's sessions, oldest first → newest.
  const cellsFor = (w: number | null) => cells.filter(c => c.rowWeight === w);

  // How many session cells fit one row at the current width; a longer weight
  // wraps onto more rows (same weight) so the table only scrolls vertically.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(2);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setCols(Math.max(1, Math.floor((el.clientWidth - LABEL_PX) / CELL_PX)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem-1px)] w-full max-w-md flex-col px-5 pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <FitBackButton onClick={onBack} />

      <h1 className="mt-4 text-center text-2xl font-semibold">{leafLabel(perf.exercise)}</h1>
      <p className="mt-2 text-center text-sm text-slate-400">Total de répétitions par séance</p>

      {/* Collapsed borders so only real cells are outlined. A weight with more
          sessions than fit one row wraps onto more rows (same weight, via the
          row-spanning label), so the table only scrolls vertically. */}
      <div ref={wrapRef} className="mt-8">
        <table className="border-collapse">
          <tbody>
            {weights.flatMap(w => {
              const rows = wrapRows(cellsFor(w), cols);
              return rows.map((row, ri) => (
                <tr key={`${w}-${ri}`}>
                  {ri === 0 && (
                    <th
                      rowSpan={rows.length}
                      className="h-[4.5rem] w-16 whitespace-nowrap border border-slate-700 border-b-slate-600 bg-slate-800 px-1.5 text-sm font-semibold text-slate-200"
                    >
                      {weightLabel(w, signed)}
                    </th>
                  )}
                  {row.map(e => (
                    <td key={e.id} className={`h-[4.5rem] w-20 border border-slate-700 bg-slate-900 p-0 align-middle ${ri === rows.length - 1 ? 'border-b-slate-600' : ''}`}>
                      <button
                        type="button"
                        onClick={() => onOpenSession(e.id)}
                        className="flex h-full w-full flex-col items-center justify-center gap-0.5 px-1 transition-colors active:bg-slate-800"
                      >
                        {e.higher ? (
                          <>
                            <span className="whitespace-nowrap text-[11px] tabular-nums text-amber-300">{e.reps} × {weightLabel(e.actualWeight, signed)}</span>
                            <span className="whitespace-nowrap text-center text-[10px] font-medium leading-tight text-amber-300">Higher weight</span>
                          </>
                        ) : e.lower ? (
                          <>
                            <span className="whitespace-nowrap text-[11px] tabular-nums text-emerald-400">{e.reps} × {weightLabel(e.actualWeight, signed)}</span>
                            <span className="whitespace-nowrap text-center text-[10px] font-medium leading-tight text-emerald-400">Lower weight</span>
                          </>
                        ) : (
                          <>
                            <span className="whitespace-nowrap text-sm tabular-nums text-slate-100">{e.reps}</span>
                            <span className="whitespace-nowrap text-xs text-white">({e.sets} série{e.sets > 1 ? 's' : ''})</span>
                          </>
                        )}
                        {e.number != null && <span className="whitespace-nowrap text-[11px] text-slate-500">Séance {e.number}</span>}
                      </button>
                    </td>
                  ))}
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
