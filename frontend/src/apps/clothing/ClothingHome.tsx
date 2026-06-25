import { AgentSearch } from './AgentSearch';

// The Find tab: the shopping agent plus a small static colour guide.
const SUMMER_COLORS = [
  { name: 'White', hex: '#FFFFFF', note: 'Reflects the most light. Stays coolest.' },
  { name: 'Sand / beige', hex: '#E4D5B7', note: 'Earthy, breathable, easy to pair.' },
  { name: 'Pale blue', hex: '#BBD7F0', note: 'Cool, calm, goes with anything.' },
];

export function ClothingHome() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <AgentSearch />

      <h2 className="mb-1 text-center text-lg font-semibold">Best colors to wear in summer</h2>
      <p className="mb-6 text-center text-sm text-slate-400">
        Light, pale colors reflect sunlight instead of soaking it up, so you stay cooler. Lean into these.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SUMMER_COLORS.map((c) => (
          <div
            key={c.name}
            className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-800/40 p-3"
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
    </div>
  );
}
