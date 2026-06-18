import { Fragment, useState } from 'react';
import { FitBackButton } from './FitBackButton';
import { FitProgrammeSection, sectionQuestion } from './FitProgrammeSection';
import { useProgramEditor } from './useProgramEditor';
import { MUSCLES, type FitProgram } from './programData';

// Editing an existing program. A left rail of sections (Nom, Split, Séries, then
// one per muscle) lets the user jump to and edit any part at will. Every change
// saves immediately via useProgramEditor; the body of each section is rendered
// by FitProgrammeSection (shared with the guided create wizard).

export function FitProgrammeEdit({ program, onBack }: { program: FitProgram; onBack: () => void }) {
  const [active, setActive] = useState('name');   // 'name' | 'split' | 'sets' | a muscle name
  const editor = useProgramEditor(program);

  // Name + split + working sets first, then one entry per muscle. Rail labels are
  // shortened to keep it narrow; the full name still shows as the section
  // heading. A thin separator is drawn between every entry.
  const sections = [
    { key: 'name', label: 'Nom' },
    { key: 'split', label: 'Split' },
    // The Body part day order, only when that split is selected.
    ...(editor.splits.includes('body_part') ? [{ key: 'bodypart', label: 'Ordre' }] : []),
    { key: 'priority', label: 'Priorités' },
    { key: 'order', label: 'Ordre' },
    { key: 'sets', label: 'Volume' },
    { key: 'reps', label: 'Reps' },
    ...MUSCLES.map(m => ({ key: m.name, label: m.name === 'Ischio-jambiers' ? 'Ischios' : m.name })),
  ];

  return (
    <div className="mx-auto w-full max-w-md px-4 pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <FitBackButton onClick={onBack} />

      <div className="mt-4 flex gap-2">
        <nav className="flex w-24 shrink-0 flex-col gap-0.5 self-start rounded-xl border border-slate-700 bg-slate-800/20 p-1" aria-label="Sections du programme">
          {sections.map((s, i) => (
            <Fragment key={s.key}>
              {i > 0 && <div className="h-px bg-slate-800" />}
              <button
                type="button"
                onClick={() => setActive(s.key)}
                aria-current={active === s.key ? 'true' : undefined}
                className={`rounded-lg px-1.5 py-1.5 text-left text-[13px] leading-tight transition-colors ${
                  active === s.key
                    ? 'bg-emerald-500/10 font-medium text-emerald-300'
                    : 'text-slate-400 active:bg-slate-800/60'
                }`}
              >
                {s.label}
              </button>
            </Fragment>
          ))}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="mt-12 text-center text-lg font-semibold text-slate-100">{sectionQuestion(active)}</h2>
          {/* The Volume section keeps its choices up top (graph below); other
              sections center their (shorter) body in the available height. */}
          <div className={`flex flex-1 flex-col pt-2 ${active === 'sets' ? 'justify-start' : 'justify-center'}`}>
            <FitProgrammeSection section={active} editor={editor} />
          </div>
        </div>
      </div>
    </div>
  );
}
