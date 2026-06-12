// Principes tab: the training principles behind the program. Add a new entry
// to PRINCIPES to surface another principle.

interface Principe {
  titre: string;
  corps: string;
}

const PRINCIPES: Principe[] = [
  {
    titre: "Travailler à l'échec",
    corps:
      "Pour déclencher la croissance musculaire, chaque série doit être poussée jusqu'à l'échec ou s'en arrêter à seulement 1 ou 2 répétitions. C'est lors de ces dernières répétitions très difficiles que le corps recrute les fibres musculaires les plus puissantes (de type II).",
  },
  {
    titre: 'La surcharge progressive',
    corps:
      "La surcharge progressive consiste à forcer tes muscles à travailler de plus en plus dur au fil du temps pour les obliger à s'adapter. Pour l'appliquer, il suffit d'augmenter très légèrement le poids ou le nombre de répétitions d'une séance à l'autre.",
  },
  {
    titre: 'Gestion de la fatigue',
    corps:
      "La gestion de la fatigue exige de laisser au moins 48 heures de repos à un muscle avant de le solliciter à nouveau, car c'est pendant la récupération qu'il se reconstruit plus fort.",
  },
  {
    titre: 'Volume de travail',
    corps:
      "Le volume hebdomadaire optimal se situe entre 10 et 20 séries effectives par groupe musculaire et par semaine. Il est recommandé de le répartir sur deux séances distinctes dans la semaine.",
  },
];

export function FitPrincipes() {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem-1px)] w-full max-w-md flex-col px-5 pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <h1 className="text-center text-2xl font-semibold">Principes d'entraînement</h1>

      <div className="mt-8 flex flex-col gap-4">
        {PRINCIPES.map((p, i) => (
          <article key={i} className="rounded-2xl border border-slate-700 bg-slate-800/30 px-5 py-5">
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
