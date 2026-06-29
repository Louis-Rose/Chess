import type { ReactNode } from 'react';

// One titled step block on the Viewer page, stacked top to bottom under the
// manual. A centered title with a clean rule above separates each step; the
// children render that step's tooling (empty for now on steps 2-4).
export function EtapeSection({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className="border-t border-slate-200 pt-8 dark:border-slate-800">
      <h2 className="mb-6 text-center text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
        {title}
      </h2>
      {children}
    </section>
  );
}
