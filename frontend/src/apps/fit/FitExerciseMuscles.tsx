import { muscleContribution } from './programData';

// The muscles an exercise works, shown under its name: "Principal : …" and, when
// any, "Secondaire(s) : …". Derived from muscleContribution (same data as the
// volume weighting). Renders nothing when the exercise has no known primary
// (e.g. an expandable variant group's header). Shared by the exercise pickers
// and the in-session exercise card.
export function ExerciseMuscles({ leaf }: { leaf: string }) {
  const { primary, secondary } = muscleContribution(leaf);
  if (primary.length === 0) return null;
  return (
    <>
      <span className="mt-0.5 block text-center text-[11px] text-slate-400">
        Principal : {primary.join(', ')}
      </span>
      {secondary.length > 0 && (
        <span className="block text-center text-[11px] text-slate-500">
          Secondaire(s) : {secondary.join(', ')}
        </span>
      )}
    </>
  );
}
