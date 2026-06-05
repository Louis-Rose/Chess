import { useEffect, useState } from 'react';
import axios from 'axios';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { fitRequest } from './fitAuth';

// Second step of the Programme flow: for each muscle group, pick the exercises
// done (multi-select). Persisted per-muscle via /api/fit/exercises on "Suivant".
// Keep MUSCLES in sync with MUSCLE_EXERCISES in backend/blueprints/fit.py.

const MUSCLES: { name: string; exercises: string[] }[] = [
  { name: 'Pectoraux', exercises: ['Développé couché', 'Développé incliné', 'Pompes'] },
  { name: 'Dos', exercises: ['Tractions', 'Tirage vertical à la poulie haute', 'Rowing barre'] },
  { name: 'Quadriceps', exercises: ['Squat arrière', 'Hack squat', 'Presse à cuisses'] },
  { name: 'Ischio-jambiers', exercises: ['Soulevé de terre jambes tendues', 'Leg curl allongé', 'Leg curl assis'] },
  { name: 'Fessiers', exercises: ['Hip thrust', 'Squat gobelet', 'Soulevé de terre sumo'] },
  { name: 'Épaules', exercises: ['Développé militaire', 'Élévations latérales', 'Oiseau'] },
  { name: 'Triceps', exercises: ['Extensions à la poulie', 'Développé couché prise serrée', 'Extensions barre au front'] },
  { name: 'Biceps', exercises: ['Curl barre', 'Curl incliné', 'Curl pupitre'] },
  { name: 'Avant-bras', exercises: ['Curl marteau', 'Flexions de poignets', 'Extensions de poignets'] },
  { name: 'Mollets', exercises: ['Extensions de mollets debout', 'Extensions de mollets assis', 'Extensions à la presse à cuisses'] },
  { name: 'Sangle Abdominale', exercises: ['Crunch', 'Enroulements de bassin', 'Gainage planche'] },
];

export function FitExercises({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [index, setIndex] = useState(0);
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fitRequest(() => axios.get<{ selections: Record<string, string[]> }>('/api/fit/exercises'))
      .then(res => setSelections(res.data.selections ?? {}))
      .catch(() => { /* start empty */ })
      .finally(() => setLoading(false));
  }, []);

  const muscle = MUSCLES[index];
  const selected = selections[muscle.name] ?? [];

  function toggle(ex: string) {
    setSelections(prev => {
      const cur = prev[muscle.name] ?? [];
      const next = cur.includes(ex) ? cur.filter(e => e !== ex) : [...cur, ex];
      return { ...prev, [muscle.name]: next };
    });
  }

  function next() {
    // Persist this muscle's picks in the background, then advance.
    fitRequest(() => axios.put('/api/fit/exercises', { muscle: muscle.name, exercises: selected })).catch(() => {});
    if (index < MUSCLES.length - 1) setIndex(index + 1);
    else onDone();
  }

  function back() {
    if (index > 0) setIndex(index - 1);
    else onBack();
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem-1px)] w-full max-w-md flex-col px-5 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <button
        type="button"
        onClick={back}
        className="self-start inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-1.5 text-white transition-colors hover:text-slate-200"
      >
        <ArrowLeft className="h-5 w-5" />
        <span>Précédent</span>
      </button>

      <h1 className="mt-4 text-center text-2xl font-semibold">{muscle.name}</h1>
      <p className="mt-1 text-center text-xs text-slate-500">{index + 1} / {MUSCLES.length}</p>
      <p className="mt-3 text-center text-lg text-white">Quels exercices fais-tu ?</p>

      {loading ? (
        <div className="mt-9 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      ) : (
        <>
          <div className="mt-6 mx-auto flex w-full max-w-[18rem] flex-col gap-3" role="group" aria-label={`Exercices ${muscle.name}`}>
            {muscle.exercises.map(ex => {
              const isActive = selected.includes(ex);
              return (
                <button
                  key={ex}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => toggle(ex)}
                  className={`flex items-center justify-center rounded-xl border px-4 py-3.5 text-center transition-colors ${
                    isActive
                      ? 'border-emerald-500 bg-emerald-500/10'
                      : 'border-slate-700 bg-slate-800/50 active:bg-slate-800'
                  }`}
                >
                  <span className="font-medium text-slate-100">{ex}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={next}
            className="mt-auto mx-auto w-full max-w-[18rem] rounded-xl bg-emerald-600 px-4 py-3.5 font-semibold text-white transition-colors hover:bg-emerald-500"
          >
            Suivant
          </button>
        </>
      )}
    </div>
  );
}
