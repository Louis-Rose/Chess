import { useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2 } from 'lucide-react';
import { fitRequest } from './fitAuth';
import { FitExercises } from './FitExercises';
import { FitProgrammeWelcome } from './FitProgrammeWelcome';
import { FitShell } from './FitShell';
import { FitSplit } from './FitSplit';
import { FitWorkSets } from './FitWorkSets';

// The Programme tab. Lands on the user's single program (shown directly, with
// Modifier / Supprimer) or an invite to create one. Editing re-enters the
// picker: split -> working sets -> exercises.

type Step = 'welcome' | 'split' | 'sets' | 'exercises';

export function FitProgramme() {
  const [selected, setSelected] = useState<string | null>(null);
  const [workSets, setWorkSets] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [step, setStep] = useState<Step>('welcome');

  useEffect(() => {
    fitRequest(() => axios.get<{ split: string | null; work_sets: number | null }>('/api/fit/profile'))
      .then(res => { setSelected(res.data.split); setWorkSets(res.data.work_sets); })
      .catch(() => { /* leave empty — welcome shows the create state */ })
      .finally(() => setLoading(false));
  }, []);

  async function remove() {
    if (deleting) return;
    setDeleting(true);
    try {
      await fitRequest(() => axios.delete('/api/fit/profile'));
      setSelected(null);   // back to the empty welcome state
      setWorkSets(null);
    } catch {
      /* keep the program shown on failure */
    } finally {
      setDeleting(false);
    }
  }

  // Show a neutral spinner until the profile resolves, so the landing appears
  // already populated rather than flashing an empty state.
  if (loading) {
    return (
      <FitShell title="Mon programme">
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
        workSets={workSets}
        deleting={deleting}
        onEdit={() => setStep('split')}
        onCreate={() => setStep('split')}
        onDelete={remove}
      />
    );

  if (step === 'split')
    return (
      <FitSplit
        initial={selected}
        onDone={s => { setSelected(s); setStep('sets'); }}
        onBack={() => setStep('welcome')}
      />
    );

  if (step === 'sets')
    return (
      <FitWorkSets
        initial={workSets}
        onDone={n => { setWorkSets(n); setStep('exercises'); }}
        onBack={() => setStep('split')}
      />
    );

  return <FitExercises onDone={() => setStep('welcome')} onBack={() => setStep('sets')} />;
}
