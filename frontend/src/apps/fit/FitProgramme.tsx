import { useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2 } from 'lucide-react';
import { fitRequest } from './fitAuth';
import { FitConfirm } from './FitConfirm';
import { FitExercises } from './FitExercises';
import { FitProgrammeEdit } from './FitProgrammeEdit';
import { FitProgrammeWelcome } from './FitProgrammeWelcome';
import { FitShell } from './FitShell';
import { FitSplit } from './FitSplit';
import { FitWorkSets } from './FitWorkSets';
import { useSession } from './sessionTimer';

// The Programme tab. Lands on the user's single program (shown directly, with
// Modifier / Supprimer) or an invite to create one. Creating walks a guided
// wizard (split -> working sets -> exercises); editing opens a tabbed view
// (FitProgrammeEdit) where any part can be changed directly.

type Step = 'welcome' | 'split' | 'sets' | 'exercises' | 'edit';

export function FitProgramme() {
  const [selected, setSelected] = useState<string | null>(null);
  const [workSets, setWorkSets] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [step, setStep] = useState<Step>('welcome');
  const [blocked, setBlocked] = useState(false);

  // The program defines what a session logs, so it can't be changed mid-session.
  // Any attempt (edit, create, delete) is blocked with an explanatory notice.
  const session = useSession();
  const guard = (fn: () => void) => () => {
    if (session) { setBlocked(true); return; }
    fn();
  };

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
      <>
        <FitProgrammeWelcome
          split={selected}
          workSets={workSets}
          deleting={deleting}
          onEdit={guard(() => setStep('edit'))}
          onCreate={guard(() => setStep('split'))}
          onDelete={guard(remove)}
        />
        {blocked && (
          <FitConfirm
            title="Séance en cours"
            message="Termine ta séance avant de modifier ton programme."
            confirmLabel="J'ai compris"
            hideCancel
            onConfirm={() => setBlocked(false)}
            onCancel={() => setBlocked(false)}
          />
        )}
      </>
    );

  if (step === 'edit')
    return (
      <FitProgrammeEdit
        split={selected ?? ''}
        workSets={workSets}
        onSplitChange={setSelected}
        onWorkSetsChange={setWorkSets}
        onBack={() => setStep('welcome')}
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
