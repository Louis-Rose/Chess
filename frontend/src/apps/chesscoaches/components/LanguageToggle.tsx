import { useMemo } from 'react';
import { useLanguage, getAvailableLanguages } from '../../../contexts/LanguageContext';

const LANG_META = {
  en: { flag: '🇬🇧', short: 'EN', long: 'English' },
  fr: { flag: '🇫🇷', short: 'FR', long: 'Français' },
  es: { flag: '🇪🇸', short: 'ES', long: 'Español' },
} as const;

export function LanguageToggle({ className }: { className?: string }) {
  const { language, setLanguage } = useLanguage();
  // If the active language isn't in the auto-detected set (e.g. user manually
  // picked Spanish while on an EN-locale device), keep it visible so they can
  // toggle back.
  const langs = useMemo(() => {
    const base = getAvailableLanguages();
    return base.includes(language) ? base : [...base, language];
  }, [language]);

  if (langs.length <= 1) return null;

  const activeIdx = langs.findIndex(c => c === language);
  return (
    <div className={`relative flex bg-slate-700 rounded-md p-0.5 ${className || ''}`}>
      <div
        className="absolute top-0.5 bottom-0.5 bg-slate-500 rounded transition-all duration-200"
        style={{ width: `calc(${100 / langs.length}% - ${4 / langs.length}px)`, transform: `translateX(${activeIdx * 100}%)` }}
      />
      {langs.map(code => {
        const meta = LANG_META[code];
        return (
          <button
            key={code}
            onClick={() => setLanguage(code)}
            className={`relative z-10 flex-1 px-2 md:px-4 py-1 text-xs md:text-sm font-medium rounded transition-colors flex items-center justify-center gap-1.5 ${language === code ? 'text-white' : 'text-slate-400'}`}
          >
            <span aria-hidden>{meta.flag}</span>
            <span className="md:hidden">{meta.short}</span>
            <span className="hidden md:inline">{meta.long}</span>
          </button>
        );
      })}
    </div>
  );
}
