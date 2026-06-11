import { useEffect, useState } from 'react';
import axios from 'axios';
import { ArrowLeft, ChevronRight, Loader2, Plus } from 'lucide-react';
import { fitRequest } from './fitAuth';
import { FitSessionExercise, type LoggedSet } from './FitSessionExercise';
import { FitExercisePicker } from './FitExercisePicker';
import { FitExerciseRecent } from './FitExerciseRecent';
import { FitSessionComment } from './FitSessionComment';
import { useWorkWeights } from './useWorkWeights';
import { leafLabel } from './programData';
import { sessionTitle } from './format';

// A workout session. Starts empty; the user adds exercises from their program
// "à la volée" and logs sets (poids + reps) on each. Everything persists as it
// goes via /api/fit/sessions. "Terminer" closes the session and returns.

interface Entry {
  exercise: string;       // stored leaf
  sets: LoggedSet[];
}

interface SessionPayload {
  id: number;
  number: number | null;
  started_at: string | null;
  comment: string | null;
  sets: { id: number; exercise: string; weight: number | null; reps: number; warmup: boolean }[];
}

// Group a session's flat set list into per-exercise entries, in logged order.
function groupSets(sets: SessionPayload['sets']): Entry[] {
  const groups: Entry[] = [];
  const idx = new Map<string, number>();
  for (const s of sets) {
    if (!idx.has(s.exercise)) { idx.set(s.exercise, groups.length); groups.push({ exercise: s.exercise, sets: [] }); }
    groups[idx.get(s.exercise)!].sets.push({ id: s.id, weight: s.weight, reps: s.reps, warmup: s.warmup });
  }
  return groups;
}

export function FitSession({ onDone }: { onDone: () => void }) {
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [number, setNumber] = useState<number | null>(null);
  const [comment, setComment] = useState<string | null>(null);
  const [program, setProgram] = useState<Record<string, string[]>>({});
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);   // exercise being edited, else overview
  const { weights: workWeights, save: saveWorkWeight } = useWorkWeights();

  useEffect(() => {
    // POST resumes the in-progress session if there is one (with its logged
    // sets), otherwise starts a fresh empty one.
    Promise.all([
      fitRequest(() => axios.post<SessionPayload>('/api/fit/sessions')),
      fitRequest(() => axios.get<{ selections: Record<string, string[]> }>('/api/fit/exercises')),
    ])
      .then(([sessionRes, exRes]) => {
        setSessionId(sessionRes.data.id);
        setStartedAt(sessionRes.data.started_at);
        setNumber(sessionRes.data.number);
        setComment(sessionRes.data.comment);
        setEntries(groupSets(sessionRes.data.sets ?? []));
        setProgram(exRes.data.selections ?? {});
      })
      .catch(() => { /* leave empty; user can retry by closing */ })
      .finally(() => setLoading(false));
  }, []);

  function addExercise(leaf: string) {
    setPicking(false);
    setEntries(prev => (prev.some(e => e.exercise === leaf) ? prev : [...prev, { exercise: leaf, sets: [] }]));
    setEditing(leaf);
  }

  // Leave an exercise's editor. If nothing was logged (a mis-pick), drop it and
  // reopen the picker so another exercise can be chosen; otherwise go to the overview.
  function leaveEditing() {
    const entry = entries.find(e => e.exercise === editing);
    if (entry && entry.sets.length === 0) {
      setEntries(prev => prev.filter(e => e.exercise !== editing));
      setEditing(null);
      setPicking(true);
    } else {
      setEditing(null);
    }
  }

  function saveComment(c: string | null) {
    if (sessionId == null) return;
    setComment(c);
    fitRequest(() => axios.put(`/api/fit/sessions/${sessionId}/comment`, { comment: c })).catch(() => {});
  }

  async function addSet(exercise: string, weight: number | null, reps: number, warmup: boolean) {
    if (sessionId == null) return;
    const res = await fitRequest(() =>
      axios.post<LoggedSet>(`/api/fit/sessions/${sessionId}/sets`, { exercise, weight, reps, warmup }));
    setEntries(prev => prev.map(e =>
      e.exercise === exercise ? { ...e, sets: [...e.sets, res.data] } : e));
  }

  async function updateSet(exercise: string, setId: number, weight: number | null, reps: number, warmup: boolean) {
    if (sessionId == null) return;
    await fitRequest(() =>
      axios.patch(`/api/fit/sessions/${sessionId}/sets/${setId}`, { weight, reps, warmup }));
    setEntries(prev => prev.map(e =>
      e.exercise === exercise ? { ...e, sets: e.sets.map(s => s.id === setId ? { id: setId, weight, reps, warmup } : s) } : e));
  }

  function deleteSet(exercise: string, setId: number) {
    if (sessionId == null) return;
    fitRequest(() => axios.delete(`/api/fit/sessions/${sessionId}/sets/${setId}`)).catch(() => {});
    setEntries(prev => prev.map(e =>
      e.exercise === exercise ? { ...e, sets: e.sets.filter(s => s.id !== setId) } : e));
  }

  async function finish() {
    if (sessionId == null || finishing) { onDone(); return; }
    setFinishing(true);
    try {
      await fitRequest(() => axios.post(`/api/fit/sessions/${sessionId}/finish`));
    } catch {
      /* still leave the screen */
    } finally {
      onDone();
    }
  }

  const added = new Set(entries.map(e => e.exercise));
  const editingEntry = editing ? entries.find(e => e.exercise === editing) ?? null : null;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem-1px)] w-full max-w-md flex-col px-5 pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <h1 className="text-center text-2xl font-semibold">
        {sessionTitle(number, startedAt)}
      </h1>

      {loading ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      ) : editingEntry ? (
        // Editing one exercise: its card + "Valider l'exercice", with a back
        // button to return (and pick another exercise if nothing was logged).
        <>
          <button
            type="button"
            onClick={leaveEditing}
            className="mt-4 self-start inline-flex items-center gap-2 py-1 text-slate-300 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
            <span>Précédent</span>
          </button>
          <div className="mt-4">
            <FitSessionExercise
              exercise={editingEntry.exercise}
              sets={editingEntry.sets}
              onAddSet={(w, r, warmup) => addSet(editingEntry.exercise, w, r, warmup)}
              onUpdateSet={(id, w, r, warmup) => updateSet(editingEntry.exercise, id, w, r, warmup)}
              onDeleteSet={id => deleteSet(editingEntry.exercise, id)}
              workWeight={workWeights[editingEntry.exercise] ?? null}
              onWorkWeightChange={w => saveWorkWeight(editingEntry.exercise, w)}
            />
            <FitExerciseRecent exercise={editingEntry.exercise} excludeSessionId={sessionId} />
          </div>

          <div className="mt-auto flex justify-center pt-8">
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="mb-8 w-full max-w-[14rem] rounded-xl bg-emerald-600 px-4 py-3.5 font-semibold text-white transition-colors hover:bg-emerald-500"
            >
              Valider l'exercice
            </button>
          </div>
        </>
      ) : (
        // Overview: tap an exercise to edit it, or add one / finish the session.
        <>
          {entries.length > 0 && (
            <div className="mx-auto mt-8 flex w-full max-w-[22rem] flex-col gap-3">
              {entries.map(e => (
                <button
                  key={e.exercise}
                  type="button"
                  onClick={() => setEditing(e.exercise)}
                  className="relative flex flex-col items-center rounded-2xl border border-slate-800 bg-slate-800/30 px-4 py-4 text-center transition-colors active:bg-slate-800/60"
                >
                  <span className="font-medium text-slate-100">{leafLabel(e.exercise)}</span>
                  <span className="mt-0.5 text-sm text-slate-400">
                    {e.sets.length} série{e.sets.length > 1 ? 's' : ''}
                  </span>
                  <ChevronRight className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => setPicking(true)}
            className="mx-auto mt-6 inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/50 px-5 py-3 font-medium text-slate-100 transition-colors active:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            Ajouter un exercice
          </button>

          <div className="mt-auto flex flex-col items-center gap-6 pt-8">
            <FitSessionComment comment={comment} onSave={saveComment} />
            <button
              type="button"
              onClick={finish}
              disabled={finishing}
              className="mb-8 w-full max-w-[14rem] rounded-xl bg-emerald-600 px-4 py-3.5 font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-60"
            >
              Terminer la séance
            </button>
          </div>
        </>
      )}

      {picking && (
        <FitExercisePicker
          program={program}
          added={added}
          onPick={addExercise}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}
