import { useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2 } from 'lucide-react';
import { fitRequest } from './fitAuth';
import { FitExercises } from './FitExercises';
import { FitProgrammeOverview } from './FitProgrammeOverview';
import { FitProgrammeWelcome } from './FitProgrammeWelcome';
import { FitShell } from './FitShell';
import { SPLITS } from './programData';

// The Programme tab. Lands on a welcome hub listing the user's program with
// view / modifier / supprimer (or an invite to create one). "View" opens the
// recap (FitProgrammeOverview); editing re-enters the picker: split -> exercises.

type Step = 'welcome' | 'overview' | 'split' | 'exercises';

export function FitProgramme() {
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(false);
  const [step, setStep] = useState<Step>('welcome');

  useEffect(() => {
    fitRequest(() => axios.get<{ split: string | null }>('/api/fit/profile'))
      .then(res => setSelected(res.data.split))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  async function remove() {
    if (deleting) return;
    setDeleting(true);
    try {
      await fitRequest(() => axios.delete('/api/fit/profile'));
      setSelected(null);   // back to the empty welcome state
    } catch {
      setError(true);
    } finally {
      setDeleting(false);
    }
  }

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

  // Show a neutral spinner until the profile resolves, so the welcome hub
  // appears already populated rather than flashing an empty state.
  if (loading) {
    return (
      <FitShell title="Programme">
        <div className="flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      </FitShell>
    );
  }

  if (step === 'welcome')
    return (
      <FitProgrammeWelcome
        split={selected}
        deleting={deleting}
        onView={() => setStep('overview')}
        onEdit={() => setStep('split')}
        onCreate={() => setStep('split')}
        onDelete={remove}
      />
    );

  if (step === 'overview' && selected)
    return <FitProgrammeOverview split={selected} onBack={() => setStep('welcome')} />;

  if (step === 'exercises')
    return <FitExercises onDone={() => setStep('overview')} onBack={() => setStep('split')} />;

  return (
    <FitShell
      title="Programme"
      question="Quel est ton split d'entraînement ?"
      onBack={() => setStep('welcome')}
    >
      <>
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
    </FitShell>
  );
}
