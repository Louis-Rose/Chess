import { useState } from 'react';
import { Check } from 'lucide-react';

// First step of the Programme tab: pick a training split.
// Selection is local-only for now (no backend yet).

interface Split {
  key: string;
  label: string;
  desc: string;
}

const SPLITS: Split[] = [
  { key: 'full_body', label: 'Full Body', desc: 'Tout le corps à chaque séance' },
  { key: 'upper_lower', label: 'Upper / Lower', desc: 'Haut du corps, puis bas du corps' },
  { key: 'push_pull_legs', label: 'Push / Pull / Legs', desc: 'Poussée, tirage, jambes' },
  { key: 'body_part', label: 'Body Part Split', desc: 'Un groupe musculaire par séance' },
  { key: 'no_split', label: 'Sans split', desc: 'Séances libres, sans structure' },
];

export function FitProgramme() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="mx-auto w-full max-w-md px-5 pt-8 pb-24">
      <h1 className="text-2xl font-semibold">Programme</h1>
      <p className="mt-1 text-sm text-slate-400">Quel est ton split d'entraînement ?</p>

      <div className="mt-6 flex flex-col gap-3" role="radiogroup" aria-label="Choix du split">
        {SPLITS.map(({ key, label, desc }) => {
          const isActive = key === selected;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => setSelected(key)}
              className={`flex items-center justify-between rounded-xl border px-4 py-3.5 text-left transition-colors ${
                isActive
                  ? 'border-emerald-500 bg-emerald-500/10'
                  : 'border-slate-700 bg-slate-800/50 active:bg-slate-800'
              }`}
            >
              <span>
                <span className="block font-medium text-slate-100">{label}</span>
                <span className="mt-0.5 block text-xs text-slate-400">{desc}</span>
              </span>
              {isActive && <Check className="h-5 w-5 shrink-0 text-emerald-400" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
