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
                className={`flex w-full flex-col items-center gap-1 pt-3 pb-[22px] text-xs transition-colors ${
                  isActive ? 'text-emerald-400' : 'text-slate-400'
                }`}
              >
                <span className="max-w-full truncate">{label}</span>
                <Icon className="h-6 w-6" strokeWidth={isActive ? 2.4 : 1.8} />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
