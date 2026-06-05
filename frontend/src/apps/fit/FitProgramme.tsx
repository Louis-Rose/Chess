import { useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2 } from 'lucide-react';
import { fitRequest } from './fitAuth';
import { FitExercises } from './FitExercises';

// First step of the Programme tab: pick a training split.
// Persisted per-user via /api/fit/profile.

interface Split {
  key: string;
  label: string;
}

const SPLITS: Split[] = [
  { key: 'full_body', label: 'Full Body' },
  { key: 'upper_lower', label: 'Upper / Lower' },
  { key: 'push_pull_legs', label: 'Push / Pull / Legs' },
  { key: 'body_part', label: 'Body Part Split' },
  { key: 'no_split', label: 'Pas de split' },
];

export function FitProgramme() {
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [step, setStep] = useState<'split' | 'exercises'>('split');

  useEffect(() => {
    fitRequest(() => axios.get<{ split: string | null }>('/api/fit/profile'))
      .then(res => setSelected(res.data.split))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  async function choose(key: string) {
    if (saving) return;
    if (key === selected) { setStep('exercises'); return; } // already saved — just continue
    const previous = selected;
    setSelected(key);          // optimistic
    setSaving(true);
    setError(false);
    try {
      await fitRequest(() => axios.put('/api/fit/profile', { split: key }));
      setStep('exercises');
    } catch {
      setSelected(previous);   // revert on failure
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  if (step === 'exercises') return <FitExercises onDone={() => setStep('split')} />;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem-1px)] w-full max-w-md flex-col px-5 pt-8">
      <h1 className="text-center text-2xl font-semibold">Programme</h1>

      {/* Centered between the title and the bottom bar (reserve the bar's height). */}
      <div className="flex flex-1 flex-col justify-center pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
        <p className="text-center text-lg text-white">Quel est ton split d'entraînement ?</p>

        {loading ? (
          <div className="mt-8 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
          </div>
        ) : (
          <>
            {error && (
              <p className="mt-4 text-center text-sm text-red-400">Échec de l'enregistrement. Réessaie.</p>
            )}
            <div className="mt-9 flex max-w-[16rem] mx-auto w-full flex-col gap-3" role="radiogroup" aria-label="Choix du split">
              {SPLITS.map(({ key, label }) => {
              const isActive = key === selected;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  disabled={saving}
                  onClick={() => choose(key)}
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
          </>
        )}
      </div>
    </div>
  );
}
