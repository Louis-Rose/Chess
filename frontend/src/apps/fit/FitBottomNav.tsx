import type { LucideIcon } from 'lucide-react';

export interface FitTab {
  key: string;
  label: string;
  Icon: LucideIcon;
}

interface Props {
  tabs: FitTab[];
  active: string;
  onSelect: (key: string) => void;
}

// Fixed bottom tab bar, thumb-reachable, with iOS safe-area padding.
export function FitBottomNav({ tabs, active, onSelect }: Props) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-800 bg-slate-900/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-md divide-x divide-slate-800">
        {tabs.map(({ key, label, Icon }) => {
          const isActive = key === active;
          return (
            <li key={key} className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onSelect(key)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex h-[5.5rem] w-full flex-col items-center pt-3 text-sm transition-colors ${
                  isActive ? 'text-emerald-400' : 'text-slate-400'
                }`}
              >
                <span className="max-w-full truncate">{label}</span>
                <span className="flex flex-1 items-center">
                  <Icon className="h-7 w-7" strokeWidth={isActive ? 2.4 : 1.8} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
