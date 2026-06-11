import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { ArrowLeft, ChevronRight, Loader2, Plus } from 'lucide-react';
import { fitRequest } from './fitAuth';
import { leafLabel, muscleContribution, MUSCLE_ORDER } from './programData';
import { formatSessionDate } from './format';
import { FitSetList } from './FitSetList';
import { FitSessionExercise } from './FitSessionExercise';
import { FitExercisePicker } from './FitExercisePicker';
import { FitConfirm } from './FitConfirm';

interface Confirm { title: string; message?: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void; }

// Detail of a past session (reached from the Calendrier history): its date and
// the logged sets, grouped by exercise in workout order. When `editable`, each
// exercise can be tapped to add or remove sets, and exercises can be added.
// An optional focusBase scrolls the matching exercise to the centre and
// highlights it (used when arriving from the "Dernière fois" view, read-only).

interface SetRow { id: number; exercise: string; weight: number | null; reps: number; warmup: boolean; }
interface Session { id: number; started_at: string | null; ended_at: string | null; sets: SetRow[]; }

const baseOf = (leaf: string) => {
  const i = leaf.indexOf(' — ');
  return i === -1 ? leaf : leaf.slice(0, i);
};

function groupByExercise(sets: SetRow[]): { exercise: string; sets: SetRow[] }[] {
  const groups: { exercise: string; sets: SetRow[] }[] = [];
  const idx = new Map<string, number>();
  for (const s of sets) {
    if (!idx.has(s.exercise)) { idx.set(s.exercise, groups.length); groups.push({ exercise: s.exercise, sets: [] }); }
    groups[idx.get(s.exercise)!].sets.push(s);
  }
  return groups;
}

// Weighted work volume per muscle group, in catalogue order. Each working
// (non-warmup) set counts 1 for the exercise's primary group(s) and 0.5 for
// each secondary group. Totals are multiples of 0.5.
function workVolume(sets: SetRow[]): { muscle: string; sets: number }[] {
  const counts = new Map<string, number>();
  for (const s of sets) {
    if (s.warmup) continue;
    const c = muscleContribution(s.exercise);
    for (const m of c.primary) counts.set(m, (counts.get(m) ?? 0) + 1);
    for (const m of c.secondary) counts.set(m, (counts.get(m) ?? 0) + 0.5);
  }
  return MUSCLE_ORDER.filter(m => counts.has(m)).map(m => ({ muscle: m, sets: counts.get(m)! }));
}

// "4", "2.5" — drop the trailing .0 for whole numbers.
const fmtVolume = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function FitSessionDetail({ sessionId, onBack, focusBase, editable }: {
  sessionId: number;
  onBack: () => void;
  focusBase?: string;
  editable?: boolean;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);   // exercise leaf being edited, else overview
  const [picking, setPicking] = useState(false);
  const [program, setProgram] = useState<Record<string, string[]>>({});
  const [unlocked, setUnlocked] = useState(false);               // edits to this saved session confirmed once
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const focusRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const requests: [Promise<{ data: Session }>, Promise<{ data: { selections: Record<string, string[]> } }>?] = [
      fitRequest(() => axios.get<Session>(`/api/fit/sessions/${sessionId}`)),
    ];
    if (editable) requests[1] = fitRequest(() => axios.get<{ selections: Record<string, string[]> }>('/api/fit/exercises'));
    Promise.all(requests)
      .then(([sessionRes, exRes]) => {
        setSession(sessionRes.data);
        if (exRes) setProgram(exRes.data.selections ?? {});
      })
      .catch(() => { /* show empty */ })
      .finally(() => setLoading(false));
  }, [sessionId, editable]);

  async function addSet(exercise: string, weight: number | null, reps: number, warmup: boolean) {
    const res = await fitRequest(() =>
      axios.post<SetRow>(`/api/fit/sessions/${sessionId}/sets`, { exercise, weight, reps, warmup }));
    setSession(prev => prev && { ...prev, sets: [...prev.sets, res.data] });
  }

  async function updateSet(setId: number, weight: number | null, reps: number, warmup: boolean) {
    await fitRequest(() =>
      axios.patch(`/api/fit/sessions/${sessionId}/sets/${setId}`, { weight, reps, warmup }));
    setSession(prev => prev && { ...prev, sets: prev.sets.map(s => s.id === setId ? { ...s, weight, reps, warmup } : s) });
  }

  function deleteSet(setId: number) {
    fitRequest(() => axios.delete(`/api/fit/sessions/${sessionId}/sets/${setId}`)).catch(() => {});
    setSession(prev => prev && { ...prev, sets: prev.sets.filter(s => s.id !== setId) });
  }

  async function deleteExercise(leaf: string) {
    const ids = (session?.sets ?? []).filter(s => s.exercise === leaf).map(s => s.id);
    await Promise.all(ids.map(id =>
      fitRequest(() => axios.delete(`/api/fit/sessions/${sessionId}/sets/${id}`)).catch(() => {})));
    setSession(prev => prev && { ...prev, sets: prev.sets.filter(s => s.exercise !== leaf) });
    setEditing(null);
  }

  // Editing a saved session is gated: confirm once, then edit freely. Deletions
  // each ask separately since they are irreversible.
  function withUnlock(run: () => void) {
    if (unlocked) { run(); return; }
    setConfirm({
      title: 'Modifier la séance',
      message: 'Cette séance est enregistrée. Confirmer les modifications ?',
      confirmLabel: 'Modifier',
      onConfirm: () => { setUnlocked(true); setConfirm(null); run(); },
    });
  }

  function confirmDeleteSet(setId: number) {
    setConfirm({
      title: 'Supprimer la série',
      message: 'Cette série sera définitivement supprimée.',
      confirmLabel: 'Supprimer',
      danger: true,
      onConfirm: () => { setConfirm(null); deleteSet(setId); },
    });
  }

  function confirmDeleteExercise(leaf: string) {
    setConfirm({
      title: "Supprimer l'exercice",
      message: 'Toutes les séries de cet exercice seront supprimées.',
      confirmLabel: 'Supprimer',
      danger: true,
      onConfirm: () => { setConfirm(null); deleteExercise(leaf); },
    });
  }

  const groups = session ? groupByExercise(session.sets) : [];
  const volume = session ? workVolume(session.sets) : [];
  const focusIndex = focusBase != null ? groups.findIndex(g => baseOf(g.exercise) === focusBase) : -1;

  // Once the session is rendered, centre the focused exercise in the viewport.
  useEffect(() => {
    if (focusRef.current) {
      requestAnimationFrame(() => focusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    }
  }, [loading, focusIndex]);

  const back = (
    <button
      type="button"
      onClick={onBack}
      className="self-start inline-flex items-center gap-2 py-1 text-slate-300 transition-colors hover:text-white"
    >
      <ArrowLeft className="h-5 w-5" />
      <span>Précédent</span>
    </button>
  );

  // Editing one exercise: just its card + "Valider l'exercice".
  if (editing != null) {
    const sets = groups.find(g => g.exercise === editing)?.sets ?? [];
    return (
      <div className="mx-auto flex min-h-[calc(100dvh-3.5rem-1px)] w-full max-w-md flex-col px-5 pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => setEditing(null)}
          className="self-start inline-flex items-center gap-2 py-1 text-slate-300 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-5 w-5" />
          <span>Précédent</span>
        </button>
        <div className="mt-6">
          <FitSessionExercise
            exercise={editing}
            sets={sets}
            onAddSet={(w, r, warmup) => addSet(editing, w, r, warmup)}
            onUpdateSet={updateSet}
            onDeleteSet={confirmDeleteSet}
          />
        </div>
        {sets.length > 0 && (
          <button
            type="button"
            onClick={() => confirmDeleteExercise(editing)}
            className="mx-auto mt-4 text-sm font-medium text-red-400 transition-colors active:text-red-300"
          >
            Supprimer l'exercice
          </button>
        )}
        <div className="mt-auto flex justify-center pt-8">
          <button
            type="button"
            onClick={() => setEditing(null)}
            className="mb-8 w-full max-w-[14rem] rounded-xl bg-emerald-600 px-4 py-3.5 font-semibold text-white transition-colors hover:bg-emerald-500"
          >
            Valider l'exercice
          </button>
        </div>

        {confirm && (
          <FitConfirm
            title={confirm.title}
            message={confirm.message}
            confirmLabel={confirm.confirmLabel}
            danger={confirm.danger}
            onConfirm={confirm.onConfirm}
            onCancel={() => setConfirm(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem-1px)] w-full max-w-md flex-col px-5 pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      {back}

      {loading ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      ) : (
        <>
          <h1 className="mt-4 text-center text-2xl font-semibold capitalize">
            {formatSessionDate(session?.started_at ?? null)}
          </h1>

          {volume.length > 0 && (
            <div className="mx-auto mt-8 flex w-full max-w-[22rem] flex-col items-center rounded-2xl border border-slate-800 bg-slate-800/30 px-4 py-4 text-center">
              <p className="text-xs uppercase tracking-wide text-slate-500">Volume de travail</p>
              <ul className="mt-2 flex flex-col gap-1 text-sm text-slate-200">
                {volume.map(v => (
                  <li key={v.muscle}>{v.muscle} - {fmtVolume(v.sets)} série{v.sets > 1 ? 's' : ''}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mx-auto mt-4 flex w-full max-w-[22rem] flex-col gap-4">
            {groups.map((g, i) => {
              const inner = (
                <>
                  <p className="font-medium text-slate-100">{leafLabel(g.exercise)}</p>
                  <FitSetList sets={g.sets} />
                </>
              );
              return editable ? (
                <button
                  key={g.exercise}
                  type="button"
                  onClick={() => withUnlock(() => setEditing(g.exercise))}
                  className="relative flex flex-col items-center rounded-2xl border border-slate-800 bg-slate-800/30 px-4 py-4 text-center transition-colors active:bg-slate-800/60"
                >
                  {inner}
                  <ChevronRight className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                </button>
              ) : (
                <div
                  key={g.exercise}
                  ref={i === focusIndex ? focusRef : undefined}
                  className={`flex flex-col items-center rounded-2xl border bg-slate-800/30 px-4 py-4 text-center transition-colors ${
                    i === focusIndex ? 'border-emerald-500/70' : 'border-slate-800'
                  }`}
                >
                  {inner}
                </div>
              );
            })}
          </div>

          {editable && (
            <button
              type="button"
              onClick={() => withUnlock(() => setPicking(true))}
              className="mx-auto mt-6 inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/50 px-5 py-3 font-medium text-slate-100 transition-colors active:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              Ajouter un exercice
            </button>
          )}
        </>
      )}

      {picking && (
        <FitExercisePicker
          program={program}
          added={new Set(groups.map(g => g.exercise))}
          onPick={leaf => { setPicking(false); setEditing(leaf); }}
          onClose={() => setPicking(false)}
        />
      )}

      {confirm && (
        <FitConfirm
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          danger={confirm.danger}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
