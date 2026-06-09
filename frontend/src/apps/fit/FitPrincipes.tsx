// Principes tab: the training principles behind the program. Add a new entry
// to PRINCIPES to surface another principle.

interface Principe {
  titre: string;
  corps: string;
}

const PRINCIPES: Principe[] = [
  {
    titre: 'La surcharge progressive',
    corps:
      "La surcharge progressive consiste à forcer tes muscles à travailler de plus en plus dur au fil du temps pour les obliger à s'adapter et à se développer. Pour l'appliquer, il suffit d'augmenter très légèrement le poids, le nombre de répétitions ou le nombre de séries d'une séance à l'autre.",
  },
  {
    titre: 'TODO',
    corps: 'TODO',
  },
];

export function FitPrincipes() {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem-1px)] w-full max-w-md flex-col px-5 pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <h1 className="text-center text-2xl font-semibold">Principes</h1>

      <div className="mt-8 flex flex-col gap-4">
        {PRINCIPES.map((p, i) => (
          <article key={i} className="rounded-2xl border border-slate-800 bg-slate-800/30 px-5 py-5">
            <h2 className="text-lg font-semibold text-emerald-400">
              Principe {i + 1} : {p.titre}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">{p.corps}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
