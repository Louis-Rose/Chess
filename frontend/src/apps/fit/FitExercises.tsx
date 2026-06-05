import { useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2 } from 'lucide-react';
import { fitRequest } from './fitAuth';
import { FitShell } from './FitShell';

// Second step of the Programme flow: for each muscle group, pick the exercises
// done (multi-select). Persisted per-muscle via /api/fit/exercises on "Suivant".
// Keep MUSCLES in sync with MUSCLE_EXERCISES in backend/blueprints/fit.py.

const MUSCLES: { name: string; exercises: string[] }[] = [
  { name: 'Pectoraux', exercises: ['Développé couché barre', 'Développé couché haltères', 'Développé incliné barre', 'Développé incliné haltères'] },
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
    <FitShell
      title={muscle.name}
      counter={`${index + 1} / ${MUSCLES.length}`}
      question="Quels exercices fais-tu ?"
      onBack={back}
      footer={!loading ? (
        <button
          type="button"
          onClick={next}
          className="mb-8 w-full max-w-[12rem] rounded-xl bg-emerald-600 px-4 py-3.5 font-semibold text-white transition-colors hover:bg-emerald-500"
        >
          Suivant
        </button>
      ) : undefined}
    >
      {loading ? (
        <div className="flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-[18rem] flex-col gap-3" role="group" aria-label={`Exercices ${muscle.name}`}>
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
      )}
    </FitShell>
  );
}
