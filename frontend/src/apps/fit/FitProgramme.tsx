import { useState } from 'react';
import type { FitProgram } from './programData';
import { FitProgrammeEdit } from './FitProgrammeEdit';
import { FitProgrammeWizard } from './FitProgrammeWizard';
import { FitProgrammeList } from './FitProgrammeList';

// The Programme tab. Lands on the list of the user's programs (FitProgrammeList),
// where the active one is marked and can be switched. Creating a new program
// opens FitProgrammeWizard, a step-by-step guide (name, split, sets, exercises);
// tapping an existing one opens FitProgrammeEdit, a rail view where each part can
// be changed directly.

type Step =
  | { name: 'list' }
  | { name: 'edit'; program: FitProgram }
  | { name: 'create'; program: FitProgram };

export function FitProgramme() {
  const [step, setStep] = useState<Step>({ name: 'list' });

  if (step.name === 'edit')
    return (
      <FitProgrammeEdit
        program={step.program}
        onBack={() => setStep({ name: 'list' })}
      />
    );

  if (step.name === 'create')
    return (
      <FitProgrammeWizard
        program={step.program}
        onDone={() => setStep({ name: 'list' })}
      />
    );

  return (
    <FitProgrammeList
      onOpen={(program, isNew) =>
        setStep(isNew ? { name: 'create', program } : { name: 'edit', program })
      }
    />
  );
}
