import { useLanguage } from '../contexts/LanguageContext';

// FR / EN language toggle (flag + code) for the top-right of each app header.
// Shown everywhere for consistency, but `disabled` renders it as an inert
// placeholder for apps that aren't translated (switching would just show raw
// keys, since t() has no fallback). The translated apps (MPP, Clothing, Notice)
// wire it up active.
const LANGS = [
  { code: 'fr', flag: '🇫🇷', label: 'FR' },
  { code: 'en', flag: '🇬🇧', label: 'EN' },
] as const;

export function LangToggle({
  disabled = false,
  className = '',
}: {
  disabled?: boolean;
  className?: string;
}) {
  const { language, setLanguage } = useLanguage();

  return (
    <div
      aria-disabled={disabled || undefined}
      className={`inline-flex items-center gap-0.5 rounded-lg border border-slate-300 bg-white p-0.5 shadow-sm dark:border-slate-700 dark:bg-slate-800/60 dark:shadow-none ${
        disabled ? 'opacity-40' : ''
      } ${className}`}
    >
      {LANGS.map(({ code, flag, label }) => {
        const active = language === code;
        return (
          <button
            key={code}
            type="button"
            disabled={disabled}
            onClick={() => setLanguage(code)}
            aria-pressed={active}
            aria-label={label}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
              active
                ? 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-white'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            } ${disabled ? 'cursor-not-allowed' : ''}`}
          >
            <span aria-hidden>{flag}</span>
            {label}
          </button>
        );
      })}
    </div>
  );
}
