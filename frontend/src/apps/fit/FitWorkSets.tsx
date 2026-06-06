import { useState } from 'react';
import axios from 'axios';
import { fitRequest } from './fitAuth';
import { FitShell } from './FitShell';

// Programme step between the split and the exercise picker: how many working
// sets per exercise (2..6). Selecting an option only marks it; "Suivant" saves
// it (/api/fit/profile { work_sets }) and advances.
// Keep the range in sync with WORK_SETS_MIN/MAX in backend/blueprints/fit.py.

const OPTIONS = [2, 3, 4, 5, 6];

export function FitWorkSets({ initial, onDone, onBack }: {
  initial: number | null;
  onDone: (n: number) => void;
  onBack: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function next() {
    if (selected == null || saving) return;
    if (selected === initial) { onDone(selected); return; } // unchanged — just continue
    setSaving(true);
    setError(false);
    try {
      await fitRequest(() => axios.put('/api/fit/profile', { work_sets: selected }));
      onDone(selected);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <FitShell
      title="Volume d'entraînement"
      question="Combien de séries de travail par exercice ?"
      onBack={onBack}
      footer={
        <button
          type="button"
          onClick={next}
          disabled={selected == null || saving}
          className="mb-8 w-full max-w-[12rem] rounded-xl bg-emerald-600 px-4 py-3.5 font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
        >
          Suivant
        </button>
      }
    >
      {error && (
        <p className="mb-3 text-center text-sm text-red-400">Échec de l'enregistrement. Réessaie.</p>
      )}
      <div className="mx-auto grid w-full max-w-[16rem] grid-cols-5 gap-2" role="radiogroup" aria-label="Séries de travail par exercice">
        {OPTIONS.map(n => {
          const isActive = n === selected;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => setSelected(n)}
              className={`flex items-center justify-center rounded-xl border py-3.5 text-lg font-medium text-slate-100 transition-colors ${
                isActive
                  ? 'border-emerald-500 bg-emerald-500/10'
                  : 'border-slate-700 bg-slate-800/50 active:bg-slate-800'
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>
    </FitShell>
  );
}
