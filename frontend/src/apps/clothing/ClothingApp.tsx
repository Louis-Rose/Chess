import { useEffect } from 'react';
import { ExternalLink } from 'lucide-react';
import { AppHeader } from '../../components/AppHeader';

// Static guide at /clothing: the best colors to wear in summer. No backend.
const SUMMER_COLORS = [
  { name: 'White', hex: '#FFFFFF', note: 'Reflects the most light. Stays coolest.' },
  { name: 'Sand / beige', hex: '#E4D5B7', note: 'Earthy, breathable, easy to pair.' },
  { name: 'Pale blue', hex: '#BBD7F0', note: 'Cool, calm, goes with anything.' },
];

export function ClothingApp() {
  useEffect(() => {
    document.title = 'Clothing | LUMNA';
  }, []);

  return (
    <div className="min-h-dvh bg-slate-900 text-slate-100">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <AppHeader title="Clothing" />

        <h2 className="mb-1 text-center text-lg font-semibold">Best colors to wear in summer</h2>
        <p className="mb-6 text-center text-sm text-slate-400">
          Light, pale colors reflect sunlight instead of soaking it up, so you stay cooler. Lean into these.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SUMMER_COLORS.map((c) => (
            <div
              key={c.name}
              className="flex items-center justify-center gap-3 rounded-xl border border-slate-800 bg-slate-800/40 p-3"
            >
              <span
                className="h-12 w-12 flex-shrink-0 rounded-lg border border-white/10"
                style={{ backgroundColor: c.hex }}
              />
              <div>
                <p className="text-sm font-semibold">{c.name}</p>
                <p className="text-xs text-slate-400">{c.note}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-6 rounded-xl border border-slate-800 bg-slate-800/40 p-3 text-center text-sm text-slate-400">
          <span className="font-semibold text-slate-200">Skip dark shades.</span> Black, navy and charcoal
          absorb heat and feel hotter in the sun.
        </p>

        <a
          href="https://www.octobre-editions.com/"
          target="_blank"
          rel="noreferrer"
          className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3 text-sm font-semibold transition-colors hover:border-emerald-500 hover:bg-emerald-500/10"
        >
          Shop at Octobre (Paris)
          <ExternalLink className="h-4 w-4 text-emerald-400" />
        </a>
      </div>
    </div>
  );
}
