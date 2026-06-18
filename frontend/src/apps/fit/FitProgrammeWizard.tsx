import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { FitBackButton } from './FitBackButton';
import { FitProgrammeSection, sectionKeysFor, sectionQuestion } from './FitProgrammeSection';
import { useProgramEditor } from './useProgramEditor';
import { type FitProgram } from './programData';

// Guided creation of a new program: one question per step (name, split, working
// sets, then one per muscle). The body of each step is the same control as the
// rail editor, rendered by FitProgrammeSection through the shared
// useProgramEditor hook — every answer saves immediately, so leaving mid-way
// keeps what was filled in. "Suivant" advances (selecting an answer only
// selects it); the top-left back button steps back, or leaves from step one.
// "Terminer" on the last step returns to the list.

export function FitProgrammeWizard({ program, onDone }: { program: FitProgram; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const editor = useProgramEditor(program);

  // Steps depend on the chosen splits: a Body part split adds an "order" step.
  const keys = sectionKeysFor(editor.splits);
  const clamped = Math.min(step, keys.length - 1);
  const section = keys[clamped];
  const isFirst = clamped === 0;
  const isLast = clamped === keys.length - 1;

  const next = () => {
    if (section === 'name') editor.saveName();
    if (isLast) { onDone(); return; }
    setStep(Math.min(clamped + 1, keys.length - 1));
  };
  // The top-left back button steps back through the flow; from the first step it
  // leaves to the program list.
  const back = () => (isFirst ? onDone() : setStep(clamped - 1));

  const nameEmpty = section === 'name' && editor.name.trim().length === 0;

  const question = (
    <h2 className="mx-auto max-w-[20rem] text-center text-lg font-semibold text-slate-100">
      {sectionQuestion(section)}
    </h2>
  );
  const nextButton = (
    <button
      type="button"
      onClick={next}
      disabled={nameEmpty}
      className="inline-flex w-full items-center justify-center gap-1 rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white transition-colors active:bg-emerald-500 disabled:opacity-50"
    >
      {isLast ? 'Terminer' : 'Suivant'}
      {!isLast && <ChevronRight className="h-4 w-4" />}
    </button>
  );

  return (
    <div className="mx-auto flex min-h-[80vh] w-full max-w-md flex-col px-4 pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <FitBackButton onClick={back} />

      {/* Progress through the steps. */}
      <div className="mt-4 h-1 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${((clamped + 1) / keys.length) * 100}%` }}
        />
      </div>

      {section === 'name' ? (
        // The single-field name step: question, input and button stay together
        // as one group, evenly spaced and centered over the available height.
        <div className="flex flex-1 flex-col justify-center gap-21">
          {question}
          <FitProgrammeSection section={section} editor={editor} />
          {nextButton}
        </div>
      ) : (
        // The longer steps keep the question pinned up top, the (often tall)
        // body centered, and the button at the bottom.
        <>
          <div className="mt-8">{question}</div>
          <div className="flex flex-1 flex-col justify-center py-6">
            <FitProgrammeSection section={section} editor={editor} />
          </div>
          <div className="mt-4">{nextButton}</div>
        </>
      )}
    </div>
  );
}
