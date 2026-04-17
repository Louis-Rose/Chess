import { useLanguage } from '../../../contexts/LanguageContext';

export function LanguageToggle({ className }: { className?: string }) {
  const { language, setLanguage } = useLanguage();
  return (
    <div className={`relative flex bg-slate-700 rounded-md p-0.5 ${className || ''}`}>
      <div
        className="absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] bg-slate-500 rounded transition-all duration-200"
        style={{ transform: language === 'en' ? 'translateX(0)' : 'translateX(100%)' }}
      />
      <button
        onClick={() => setLanguage('en')}
        className={`relative z-10 px-2 md:px-4 py-1 text-xs md:text-sm font-medium rounded transition-colors flex items-center gap-1.5 ${language === 'en' ? 'text-white' : 'text-slate-400'}`}
      >
        <span aria-hidden>🇬🇧</span>
        <span>English</span>
      </button>
      <button
        onClick={() => setLanguage('fr')}
        className={`relative z-10 px-2 md:px-4 py-1 text-xs md:text-sm font-medium rounded transition-colors flex items-center gap-1.5 ${language === 'fr' ? 'text-white' : 'text-slate-400'}`}
      >
        <span aria-hidden>🇫🇷</span>
        <span>Français</span>
      </button>
    </div>
  );
}
