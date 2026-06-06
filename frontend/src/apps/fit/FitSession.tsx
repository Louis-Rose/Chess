import { useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2, Plus, X } from 'lucide-react';
import { fitRequest } from './fitAuth';
import { FitSessionExercise, type LoggedSet } from './FitSessionExercise';
import { MUSCLES, MUSCLE_LEAVES, leafLabel, sortLabels } from './programData';

// A workout session. Starts empty; the user adds exercises from their program
// "à la volée" and logs sets (poids + reps) on each. Everything persists as it
// goes via /api/fit/sessions. "Terminer" closes the session and returns.

interface Entry {
  exercise: string;       // stored leaf
  sets: LoggedSet[];
}

const MUSCLE_ORDER = MUSCLES.map(m => m.name);

export function FitSession({ onDone }: { onDone: () => void }) {
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [program, setProgram] = useState<Record<string, string[]>>({});
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    Promise.all([
      fitRequest(() => axios.post<{ id: number }>('/api/fit/sessions')),
      fitRequest(() => axios.get<{ selections: Record<string, string[]> }>('/api/fit/exercises')),
    ])
      .then(([sessionRes, exRes]) => {
        setSessionId(sessionRes.data.id);
        setProgram(exRes.data.selections ?? {});
      })
      .catch(() => { /* leave empty; user can retry by closing */ })
      .finally(() => setLoading(false));
  }, []);

  function addExercise(leaf: string) {
    setPicking(false);
    setEntries(prev => (prev.some(e => e.exercise === leaf) ? prev : [...prev, { exercise: leaf, sets: [] }]));
  }

  async function addSet(exercise: string, weight: number | null, reps: number) {
    if (sessionId == null) return;
    const res = await fitRequest(() =>
      axios.post<LoggedSet>(`/api/fit/sessions/${sessionId}/sets`, { exercise, weight, reps }));
    setEntries(prev => prev.map(e =>
      e.exercise === exercise ? { ...e, sets: [...e.sets, res.data] } : e));
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

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem-1px)] w-full max-w-md flex-col px-5 pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <h1 className="text-center text-2xl font-semibold">Séance</h1>

      {loading ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      ) : (
        <>
          {entries.length === 0 ? (
            <p className="mt-10 text-center text-sm text-slate-400">
              Ajoute ton premier exercice pour commencer.
            </p>
          ) : (
            <div className="mt-8 flex flex-col gap-4">
              {entries.map(e => (
                <FitSessionExercise
                  key={e.exercise}
                  exercise={e.exercise}
                  sets={e.sets}
                  onAddSet={(w, r) => addSet(e.exercise, w, r)}
                  onDeleteSet={id => deleteSet(e.exercise, id)}
                />
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

          <div className="mt-auto flex justify-center pt-8">
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
        <ExercisePicker
          program={program}
          added={added}
          onPick={addExercise}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

function ExercisePicker({ program, added, onPick, onClose }: {
  program: Record<string, string[]>;
  added: Set<string>;
  onPick: (leaf: string) => void;
  onClose: () => void;
}) {
  // Only the program's still-valid leaves that aren't already in the session.
  const groups = MUSCLE_ORDER
    .map(name => ({
      name,
      leaves: sortLabels((program[name] ?? []).filter(ex => MUSCLE_LEAVES[name]?.has(ex) && !added.has(ex))),
    }))
    .filter(g => g.leaves.length > 0);

  return (
    <div className="fixed inset-0 z-20 flex flex-col bg-slate-900 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
        <h2 className="text-lg font-semibold">Ajouter un exercice</h2>
        <button type="button" onClick={onClose} aria-label="Fermer" className="rounded p-1 text-slate-400 active:text-white">
          <X className="h-6 w-6" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-5 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        {groups.length === 0 ? (
          <p className="mt-8 text-center text-sm text-slate-400">
            Aucun exercice disponible. Ajoute-en dans ton programme.
          </p>
        ) : (
          <div className="mx-auto flex w-full max-w-[22rem] flex-col gap-6">
            {groups.map(g => (
              <section key={g.name}>
                <h3 className="text-xs uppercase tracking-wide text-slate-500">{g.name}</h3>
                <div className="mt-2 flex flex-col gap-2">
                  {g.leaves.map(leaf => (
                    <button
                      key={leaf}
                      type="button"
                      onClick={() => onPick(leaf)}
                      className="rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3 text-left font-medium text-slate-100 transition-colors active:bg-slate-800"
                    >
                      {leafLabel(leaf)}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
