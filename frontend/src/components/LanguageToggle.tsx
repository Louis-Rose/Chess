import { useLanguage } from '../contexts/LanguageContext';

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  return (
    <button
      onClick={() => setLanguage(language === 'en' ? 'fr' : 'en')}
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-sm transition-colors"
      title={language === 'en' ? 'Switch to French' : 'Passer en anglais'}
    >
      <span className="text-slate-700 dark:text-slate-200 font-medium">
        {language === 'en' ? 'English' : 'Français'}
      </span>
    </button>
  );
}
