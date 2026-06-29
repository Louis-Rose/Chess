import type { ReactNode } from 'react';
import { Info } from 'lucide-react';

// One titled step block on the Viewer page, stacked top to bottom under the
// manual. A centered title with a clean rule above separates each step; the
// children render that step's tooling (empty for now on later steps). When
// `info` is given (the matching "MVP Notes" entry), a circled "i" next to the
// title reveals that text on hover/focus.
export function EtapeSection({ title, info, children }: { title: string; info?: string; children?: ReactNode }) {
  return (
    <section className="border-t border-slate-200 pt-8 dark:border-slate-800">
      <div className="mb-6 flex items-center justify-center gap-2">
        <h2 className="text-center text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          {title}
        </h2>
        {info && (
          <span className="group relative inline-flex">
            <button
              type="button"
              aria-label={info}
              className="text-slate-400 transition-colors hover:text-emerald-600 focus:outline-none focus-visible:text-emerald-600 dark:text-slate-500 dark:hover:text-emerald-400 dark:focus-visible:text-emerald-400"
            >
              <Info className="h-4 w-4" />
            </button>
            <span
              role="tooltip"
              className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-72 max-w-[80vw] -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-3 text-left text-xs font-normal leading-relaxed text-slate-700 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              {info}
            </span>
          </span>
        )}
      </div>
      {children}
    </section>
  );
}
