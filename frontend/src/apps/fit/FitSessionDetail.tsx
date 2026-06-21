import { useEffect, useState } from 'react';
import axios from 'axios';
import { ChevronRight, Loader2, Plus } from 'lucide-react';
import { fitRequest } from './fitAuth';
import { leafLabel, isSignedExercise, type Priorities } from './programData';
import { sessionTitle } from './format';
import { FitSetList } from './FitSetList';
import { FitSessionExercise } from './FitSessionExercise';
import { FitScreenHeader } from './FitScreenHeader';
import { FitExercisePicker } from './FitExercisePicker';
import { FitConfirm } from './FitConfirm';
import { FitExerciseRecent } from './FitExerciseRecent';
import { FitSessionComment } from './FitSessionComment';
import { type PerfStatus } from './FitPerf';
import { useWorkWeights } from './useWorkWeights';
import { useExerciseSettings } from './useExerciseSettings';
import { useCustomExercises } from './useCustomExercises';

interface Confirm { title: string; message?: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onCancel?: () => void; }

// Detail of a session: its date and the logged sets, grouped by exercise in
// workout order. When `editable`, each exercise can be tapped to add or remove
// sets, and exercises can be added (reached from the Calendrier history); read
// only when opened as the last session from Accueil.

interface SetRow { id: number; exercise: string; weight: number | null; reps: number; reps_right: number | null; warmup: boolean; higher_weight: boolean; }
interface Session { id: number; number: number | null; started_at: string | null; ended_at: string | null; comment: string | null; sets: SetRow[]; perf?: Record<string, PerfStatus | null>; notes?: Record<string, string>; }

function groupByExercise(sets: SetRow[]): { exercise: string; sets: SetRow[] }[] {
  const groups: { exercise: string; sets: SetRow[] }[] = [];
  const idx = new Map<string, number>();
  for (const s of sets) {
    if (!idx.has(s.exercise)) { idx.set(s.exercise, groups.length); groups.push({ exercise: s.exercise, sets: [] }); }
    groups[idx.get(s.exercise)!].sets.push(s);
  }
  return groups;
}


export function FitSessionDetail({ sessionId, onBack, editable }: {
  sessionId: number;
  onBack: () => void;
  editable?: boolean;
}) {
  useCustomExercises();   // so the weighted volume counts custom exercises
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);   // exercise leaf being edited, else overview
  const [validating, setValidating] = useState<string | null>(null); // exercise whose note modal is open
  const [picking, setPicking] = useState(false);
  const [program, setProgram] = useState<Record<string, string[]>>({});
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const { weights: workWeights } = useWorkWeights();
  const { settings: exerciseSettings, save: saveSetting } = useExerciseSettings();
  const [unilateral, setUnilateral] = useState<Set<string>>(new Set());   // active program's
  const [muscleOrder, setMuscleOrder] = useState<string[]>([]);

  useEffect(() => {
    const requests: [Promise<{ data: Session }>, Promise<{ data: { selections: Record<string, string[]>; priorities: Priorities; unilateral: string[]; muscle_order: string[] } }>?] = [
      fitRequest(() => axios.get<Session>(`/api/fit/sessions/${sessionId}`)),
    ];
    if (editable) requests[1] = fitRequest(() => axios.get<{ selections: Record<string, string[]>; priorities: Priorities; unilateral: string[]; muscle_order: string[] }>('/api/fit/exercises'));
    Promise.all(requests)
      .then(([sessionRes, exRes]) => {
        setSession(sessionRes.data);
        if (exRes) { setProgram(exRes.data.selections ?? {}); setUnilateral(new Set(exRes.data.unilateral ?? [])); setMuscleOrder(exRes.data.muscle_order ?? []); }
      })
      .catch(() => { /* show empty */ })
      .finally(() => setLoading(false));
  }, [sessionId, editable]);

  async function addSet(exercise: string, weight: number | null, reps: number, warmup: boolean, repsRight: number | null, higher: boolean) {
    const res = await fitRequest(() =>
      axios.post<SetRow>(`/api/fit/sessions/${sessionId}/sets`, { exercise, weight, reps, warmup, reps_right: repsRight, higher_weight: higher }));
    setSession(prev => prev && { ...prev, sets: [...prev.sets, res.data] });
  }

  async function updateSet(setId: number, weight: number | null, reps: number, warmup: boolean, repsRight: number | null, higher: boolean) {
    await fitRequest(() =>
      axios.patch(`/api/fit/sessions/${sessionId}/sets/${setId}`, { weight, reps, warmup, reps_right: repsRight, higher_weight: higher }));
    setSession(prev => prev && { ...prev, sets: prev.sets.map(s => s.id === setId ? { ...s, weight, reps, reps_right: repsRight, warmup, higher_weight: higher } : s) });
  }

  function deleteSet(setId: number) {
    fitRequest(() => axios.delete(`/api/fit/sessions/${sessionId}/sets/${setId}`)).catch(() => {});
    setSession(prev => prev && { ...prev, sets: prev.sets.filter(s => s.id !== setId) });
  }

  function saveComment(c: string | null) {
    setSession(prev => prev && { ...prev, comment: c });
    fitRequest(() => axios.put(`/api/fit/sessions/${sessionId}/comment`, { comment: c })).catch(() => {});
  }

  function saveExerciseNote(exercise: string, note: string | null) {
    setSession(prev => {
      if (!prev) return prev;
      const notes = { ...(prev.notes ?? {}) };
      if (note) notes[exercise] = note; else delete notes[exercise];
      return { ...prev, notes };
    });
    fitRequest(() => axios.put(`/api/fit/sessions/${sessionId}/exercise-notes`, { exercise, note })).catch(() => {});
  }

  async function deleteExercise(leaf: string) {
    const ids = (session?.sets ?? []).filter(s => s.exercise === leaf).map(s => s.id);
    await Promise.all(ids.map(id =>
      fitRequest(() => axios.delete(`/api/fit/sessions/${sessionId}/sets/${id}`)).catch(() => {})));
    setSession(prev => prev && { ...prev, sets: prev.sets.filter(s => s.exercise !== leaf) });
    setEditing(null);
  }

  // Every change to a saved session is confirmed at commit time. askChange wraps
  // a save (new or edited set) so the editor only clears its inputs once the
  // user confirms; cancelling rejects so the typed values are kept.
  function askChange(action: () => Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      setConfirm({
        title: 'Modifier la séance',
        message: 'Confirmer cette modification de la séance enregistrée ?',
        confirmLabel: 'Confirmer',
        onConfirm: () => { setConfirm(null); action().then(resolve, reject); },
        onCancel: () => { setConfirm(null); reject(new Error('cancelled')); },
      });
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

  const sessionName = sessionTitle(session?.number, session?.started_at ?? null);

  // Editing one exercise: just its card + "Valider l'exercice".
  if (editing != null) {
    const sets = groups.find(g => g.exercise === editing)?.sets ?? [];
    return (
      <div className="mx-auto flex min-h-[calc(100dvh-3.5rem-1px)] w-full max-w-md flex-col pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
        <FitScreenHeader title={sessionName} onBack={() => setEditing(null)} />
        <div className="px-5 pt-2">
          <FitSessionExercise
            key={editing}
            exercise={editing}
            sets={sets}
            onAddSet={(w, r, warmup, rr, hi) => askChange(() => addSet(editing, w, r, warmup, rr, hi))}
            onUpdateSet={(id, w, r, warmup, rr, hi) => askChange(() => updateSet(id, w, r, warmup, rr, hi))}
            onDeleteSet={confirmDeleteSet}
            workWeight={workWeights[editing] ?? null}
            setting={exerciseSettings[editing.split(' — ')[0]] ?? null}
            onSettingChange={s => saveSetting(editing.split(' — ')[0], s)}
            unilateral={unilateral.has(editing.split(' — ')[0])}
          />
          <FitExerciseRecent exercise={editing} excludeSessionId={sessionId} />
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
            onClick={() => { if (sets.length > 0) setValidating(editing); else setEditing(null); }}
            className="mb-8 w-full max-w-[14rem] rounded-xl bg-emerald-600 px-4 py-3.5 font-semibold text-white transition-colors hover:bg-emerald-500"
          >
            Valider l'exercice
          </button>
        </div>

        {validating != null && (
          <div
            className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 px-6"
            onClick={() => setValidating(null)}
          >
            <div
              className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-5 text-center"
              onClick={e => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold text-slate-100">{leafLabel(validating)}</h2>
              <div className="mt-4">
                <FitSessionComment
                  comment={session?.notes?.[validating] ?? null}
                  onSave={n => saveExerciseNote(validating, n)}
                  id="exercise-note"
                  placeholder="Une note sur cet exercice ?"
                  centered
                />
              </div>
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => setValidating(null)}
                  className="flex-1 rounded-xl border border-slate-700 px-4 py-2.5 font-medium text-slate-200 transition-colors active:bg-slate-800"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => { setValidating(null); setEditing(null); }}
                  className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 font-semibold text-white transition-colors hover:bg-emerald-500"
                >
                  Valider
                </button>
              </div>
            </div>
          </div>
        )}

        {confirm && (
          <FitConfirm
            title={confirm.title}
            message={confirm.message}
            confirmLabel={confirm.confirmLabel}
            danger={confirm.danger}
            onConfirm={confirm.onConfirm}
            onCancel={confirm.onCancel ?? (() => setConfirm(null))}
          />
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem-1px)] w-full max-w-md flex-col pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <FitScreenHeader title={sessionName} onBack={onBack} />

      <div className="px-5">
      {loading ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      ) : (
        <>
          <div className="mx-auto mt-4 flex w-full max-w-[22rem] flex-col gap-4">
            {groups.map(g => {
              const inner = (
                <>
                  <p className="font-medium text-slate-100">{leafLabel(g.exercise)}</p>
                  <div className="mt-3 h-px w-full bg-slate-700" />
                  <FitSetList sets={g.sets} signed={isSignedExercise(g.exercise)} />
                  {session?.notes?.[g.exercise] && (
                    <p className="mt-2 whitespace-pre-wrap text-xs italic text-slate-400">{session.notes[g.exercise]}</p>
                  )}
                </>
              );
              return editable ? (
                <button
                  key={g.exercise}
                  type="button"
                  onClick={() => setEditing(g.exercise)}
                  className="relative flex flex-col items-center rounded-2xl border border-slate-700 bg-slate-800/30 px-4 py-4 text-center transition-colors active:bg-slate-800/60"
                >
                  {inner}
                  <ChevronRight className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                </button>
              ) : (
                <div
                  key={g.exercise}
                  className="flex flex-col items-center rounded-2xl border border-slate-700 bg-slate-800/30 px-4 py-4 text-center"
                >
                  {inner}
                </div>
              );
            })}
          </div>

          {editable && (
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="mx-auto mt-6 inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/50 px-5 py-3 font-medium text-slate-100 transition-colors active:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              Ajouter un exercice
            </button>
          )}

          {editable ? (
            <div className="mt-8">
              <FitSessionComment comment={session?.comment ?? null} onSave={saveComment} />
            </div>
          ) : session?.comment ? (
            <div className="mx-auto mt-8 w-full max-w-[22rem] rounded-2xl border border-slate-700 bg-slate-800/30 px-4 py-3">
              <p className="text-center text-xs uppercase tracking-wide text-slate-500">Commentaire</p>
              <p className="mt-1 whitespace-pre-wrap text-center text-sm text-slate-200">{session.comment}</p>
            </div>
          ) : null}
        </>
      )}
      </div>

      {picking && (
        <FitExercisePicker
          program={program}
          muscleOrder={muscleOrder}
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
