import { FitBackButton } from './FitBackButton';

// Shared top of the session views and the add-exercise picker: a centered title
// with a divider below it, then the "Précédent" back link. Gives every screen
// the same structure — Titre → séparateur → Précédent → contenu.
export function FitScreenHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <>
      <header className="border-b border-slate-800 px-5 py-4">
        <h2 className="text-center text-lg font-semibold">{title}</h2>
      </header>
      <div className="px-5 pt-4">
        <FitBackButton onClick={onBack} />
      </div>
    </>
  );
}
