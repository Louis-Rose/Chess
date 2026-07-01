import { useCallback } from 'react';
import { Languages, Loader2, Square } from 'lucide-react';
import { ReasoningBadge } from './ReasoningBadge';
import { useAssemblySteps } from './categoryBands';
import { extractInstructions, stopInstructions, useInstructionsRun } from './instructionsRun';
import { runBtnClass, stopBtnClass } from './controls';
import { useLanguage } from '../../contexts/LanguageContext';

// Turn a language code (ISO 639-1) into a readable name in the current UI
// language, falling back to the raw code when it can't be resolved.
function useLangName() {
  const { language } = useLanguage();
  return useCallback(
    (code: string | null) => {
      if (!code) return '?';
      try {
        return new Intl.DisplayNames([language], { type: 'language' }).of(code) || code.toUpperCase();
      } catch {
        return code.toUpperCase();
      }
    },
    [language],
  );
}

// Étape 3: for every assembly step detected in Étape 1, transcribe its written
// instructions in each language the manual prints, keyed back to the step. One
// Gemini call per step band; the run control mirrors the other steps (spinner +
// "done/total", plus a Stop button while busy).
export function InstructionsStep({ file, docId }: { file: Blob; docId: string }) {
  const { t } = useLanguage();
  const langName = useLangName();
  const { model, steps } = useAssemblySteps(docId);
  const { busy, progress, instructions, reasoning, error } = useInstructionsRun(docId);

  const progressSuffix = busy && progress ? ` · ${progress.done}/${progress.total}` : '';
  const hasResult = Object.keys(instructions).length > 0;

  if (steps.length === 0) {
    return <p className="text-center text-sm text-slate-500 dark:text-slate-400">{t('notice.cat2.noRun')}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => model && void extractInstructions(docId, file, steps, model, t)}
          disabled={busy}
          className={runBtnClass}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Languages className="h-4 w-4" />}
          {t('notice.instr.run')}
          {progressSuffix}
        </button>
        {busy && (
          <button type="button" onClick={() => stopInstructions(docId)} className={stopBtnClass}>
            <Square className="h-4 w-4" />
            {t('notice.cat.stop')}
          </button>
        )}
      </div>

      {error && <p className="text-center text-sm text-rose-600 dark:text-rose-400">{error}</p>}

      {hasResult && (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          {steps.map((step) => {
            const entries = instructions[step.category];
            if (!entries) return null; // not reached yet this run
            const reason = reasoning[step.category];
            return (
              <div
                key={step.category}
                className="overflow-hidden rounded-xl border-2 border-slate-300 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:shadow-lg"
              >
                <div className="flex items-center justify-center gap-2 border-b-2 border-slate-300 bg-slate-50 px-4 py-2 dark:border-slate-700 dark:bg-slate-800/50">
                  <h4 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
                    {t('notice.step')} {step.num}
                  </h4>
                  {reason && (
                    <ReasoningBadge
                      content={<div className="whitespace-pre-line">{reason}</div>}
                      label={t('notice.cat.thinking')}
                      reasons
                    />
                  )}
                </div>
                {entries.length > 0 ? (
                  <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                    {entries.map((e) => (
                      <li key={e.lang ?? '?'} className="flex gap-3 px-4 py-3 text-left">
                        <span className="mt-0.5 shrink-0 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {langName(e.lang)}
                        </span>
                        <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                          {e.text}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-4 py-3 text-center text-sm text-slate-400">
                    {busy ? '…' : t('notice.instr.none')}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
