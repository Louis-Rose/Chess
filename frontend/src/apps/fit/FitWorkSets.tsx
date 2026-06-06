import { useState } from 'react';
import axios from 'axios';
import { fitRequest } from './fitAuth';
import { FitShell } from './FitShell';

// Programme step between the split and the exercise picker: how many working
// sets per exercise (2..6). Persisted via /api/fit/profile { work_sets }.
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

  async function choose(n: number) {
    if (saving) return;
    if (n === selected) { onDone(n); return; }   // already saved — just continue
    const previous = selected;
    setSelected(n);            // optimistic
    setSaving(true);
    setError(false);
    try {
      await fitRequest(() => axios.put('/api/fit/profile', { work_sets: n }));
      onDone(n);
    } catch {
      setSelected(previous);   // revert on failure
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <FitShell question="Combien de séries de travail par exercice ?" onBack={onBack}>
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
              disabled={saving}
              onClick={() => choose(n)}
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
