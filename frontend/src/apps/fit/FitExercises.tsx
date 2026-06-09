import { useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2 } from 'lucide-react';
import { fitRequest } from './fitAuth';
import { FitShell } from './FitShell';
import { MusclePicker } from './MusclePicker';
import { MUSCLES } from './programData';

// Second step of the Programme flow: for each muscle group, pick the exercises
// done (multi-select). Persisted per-muscle via /api/fit/exercises on "Suivant".

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

  function toggle(id: string) {
    setSelections(prev => {
      const cur = prev[muscle.name] ?? [];
      const next = cur.includes(id) ? cur.filter(e => e !== id) : [...cur, id];
      return { ...prev, [muscle.name]: next };
    });
  }

  function next() {
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
          {selected.length === 0 ? 'Passer' : 'Suivant'}
        </button>
      ) : undefined}
    >
      {loading ? (
        <div className="flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      ) : (
        <MusclePicker key={muscle.name} muscle={muscle} selected={selected} onToggle={toggle} />
      )}
    </FitShell>
  );
}
