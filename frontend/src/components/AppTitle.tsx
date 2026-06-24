import { appByLabel } from '../apps/catalog';

// Big centered app title with its chooser icon, shown at the top of each app.
// The icon is looked up from the shared app catalog by title.
export function AppTitle({ title }: { title?: string }) {
  if (!title) return null;
  const Icon = appByLabel(title)?.Icon;
  return (
    <div className="flex items-center justify-center gap-3">
      {Icon && <Icon className="h-9 w-9 text-emerald-400" strokeWidth={1.5} />}
      <h1 className="text-3xl font-bold tracking-wide text-slate-100">{title}</h1>
    </div>
  );
}
