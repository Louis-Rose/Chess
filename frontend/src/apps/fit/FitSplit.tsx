import { useState } from 'react';
import axios from 'axios';
import { fitRequest } from './fitAuth';
import { FitShell } from './FitShell';
import { SPLITS } from './programData';

// Programme step 1: pick a training split. Selecting an option only marks it;
// "Suivant" saves it (/api/fit/profile { split }) and advances.

export function FitSplit({ initial, onDone, onBack }: {
  initial: string | null;
  onDone: (split: string) => void;
  onBack: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function next() {
    if (!selected || saving) return;
    if (selected === initial) { onDone(selected); return; } // unchanged — just continue
    setSaving(true);
    setError(false);
    try {
      await fitRequest(() => axios.put('/api/fit/profile', { split: selected }));
      onDone(selected);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <FitShell
      question="Quel est ton split d'entraînement ?"
      onBack={onBack}
      footer={
        <button
          type="button"
          onClick={next}
          disabled={!selected || saving}
          className="mb-8 w-full max-w-[12rem] rounded-xl bg-emerald-600 px-4 py-3.5 font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
        >
          Suivant
        </button>
      }
    >
      {error && (
        <p className="mb-3 text-center text-sm text-red-400">Échec de l'enregistrement. Réessaie.</p>
      )}
      <div className="mx-auto flex w-full max-w-[16rem] flex-col gap-3" role="radiogroup" aria-label="Choix du split">
        {SPLITS.map(({ key, label }) => {
          const isActive = key === selected;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => setSelected(key)}
              className={`flex items-center justify-center rounded-xl border px-4 py-3.5 text-center transition-colors ${
                isActive
                  ? 'border-emerald-500 bg-emerald-500/10'
                  : 'border-slate-700 bg-slate-800/50 active:bg-slate-800'
              }`}
            >
              <span className="font-medium text-slate-100">{label}</span>
            </button>
          );
        })}
      </div>
    </FitShell>
  );
}
