import { useLanguage } from '../../../contexts/LanguageContext';

const LANGS = [
  { code: 'en' as const, flag: '🇬🇧', short: 'EN', long: 'English' },
  { code: 'fr' as const, flag: '🇫🇷', short: 'FR', long: 'Français' },
  { code: 'es' as const, flag: '🇪🇸', short: 'ES', long: 'Español' },
];

export function LanguageToggle({ className }: { className?: string }) {
  const { language, setLanguage } = useLanguage();
  const activeIdx = LANGS.findIndex(l => l.code === language);
  return (
    <div className={`relative flex bg-slate-700 rounded-md p-0.5 ${className || ''}`}>
      <div
        className="absolute top-0.5 bottom-0.5 bg-slate-500 rounded transition-all duration-200"
        style={{ width: `calc(${100 / LANGS.length}% - ${4 / LANGS.length}px)`, transform: `translateX(${activeIdx * 100}%)` }}
      />
      {LANGS.map(l => (
        <button
          key={l.code}
          onClick={() => setLanguage(l.code)}
          className={`relative z-10 flex-1 px-2 md:px-4 py-1 text-xs md:text-sm font-medium rounded transition-colors flex items-center justify-center gap-1.5 ${language === l.code ? 'text-white' : 'text-slate-400'}`}
        >
          <span aria-hidden>{l.flag}</span>
          <span className="md:hidden">{l.short}</span>
          <span className="hidden md:inline">{l.long}</span>
        </button>
      ))}
    </div>
  );
}
