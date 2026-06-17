import { useState } from 'react';
import type { FitProgram } from './programData';
import { FitProgrammeEdit } from './FitProgrammeEdit';
import { FitProgrammeList } from './FitProgrammeList';

// The Programme tab. Lands on the list of the user's programs (FitProgrammeList),
// where the active one is marked and can be switched. Tapping a program — or
// creating a new one — opens FitProgrammeEdit, a tabbed view where the name,
// split, working sets and exercises can each be changed directly.

type Step = { name: 'list' } | { name: 'edit'; program: FitProgram };

export function FitProgramme() {
  const [step, setStep] = useState<Step>({ name: 'list' });

  if (step.name === 'edit')
    return (
      <FitProgrammeEdit
        program={step.program}
        onBack={() => setStep({ name: 'list' })}
      />
    );

  return (
    <FitProgrammeList
      onOpen={program => setStep({ name: 'edit', program })}
    />
  );
}
