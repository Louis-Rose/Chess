import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { FitBackButton } from './FitBackButton';
import { FitProgrammeSection, SECTION_KEYS } from './FitProgrammeSection';
import { useProgramEditor } from './useProgramEditor';
import { type FitProgram } from './programData';

// Guided creation of a new program: one question per step (name, split, working
// sets, then one per muscle). The body of each step is the same control as the
// rail editor, rendered by FitProgrammeSection through the shared
// useProgramEditor hook — every answer saves immediately, so leaving mid-way
// keeps what was filled in. "Suivant" advances (selecting an answer only
// selects it); the top-left back button steps back, or leaves from step one.
// "Terminer" on the last step returns to the list.

// "Quels exercices pour <le dos / les épaules> ?" — only Dos is singular.
const musclePhrase = (m: string) => (m === 'Dos' ? 'le dos' : `les ${m.toLowerCase()}`);

const question = (section: string) =>
  section === 'name' ? 'Comment veux-tu nommer ce programme ?'
    : section === 'split' ? 'Quel split veux-tu suivre ?'
    : section === 'sets' ? 'Combien de séries de travail par exercice ?'
    : `Quels exercices pour ${musclePhrase(section)} ?`;

export function FitProgrammeWizard({ program, onDone }: { program: FitProgram; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const editor = useProgramEditor(program);

  const section = SECTION_KEYS[step];
  const isFirst = step === 0;
  const isLast = step === SECTION_KEYS.length - 1;

  const next = () => {
    if (section === 'name') editor.saveName();
    if (isLast) { onDone(); return; }
    setStep(s => Math.min(s + 1, SECTION_KEYS.length - 1));
  };
  // The top-left back button steps back through the flow; from the first step it
  // leaves to the program list.
  const back = () => (isFirst ? onDone() : setStep(s => s - 1));

  const nameEmpty = section === 'name' && editor.name.trim().length === 0;

  return (
    <div className="mx-auto flex min-h-[80vh] w-full max-w-md flex-col px-4 pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <FitBackButton onClick={back} />

      {/* Progress through the steps. */}
      <div className="mt-4 h-1 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${((step + 1) / SECTION_KEYS.length) * 100}%` }}
        />
      </div>

      <h2 className="mx-auto mt-8 max-w-[20rem] text-center text-lg font-semibold text-slate-100">
        {question(section)}
      </h2>

      <div className="flex flex-1 flex-col justify-center py-6">
        <FitProgrammeSection section={section} editor={editor} />
      </div>

      <button
        type="button"
        onClick={next}
        disabled={nameEmpty}
        className="mt-4 inline-flex w-full items-center justify-center gap-1 rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white transition-colors active:bg-emerald-500 disabled:opacity-50"
      >
        {isLast ? 'Terminer' : 'Suivant'}
        {!isLast && <ChevronRight className="h-4 w-4" />}
      </button>
    </div>
  );
}
