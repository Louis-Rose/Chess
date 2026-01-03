import { useLanguage } from '../contexts/LanguageContext';

interface LanguageToggleProps {
  collapsed?: boolean;
}

export function LanguageToggle({ collapsed = false }: LanguageToggleProps) {
  const { language, setLanguage } = useLanguage();

  return (
    <button
      onClick={() => setLanguage(language === 'en' ? 'fr' : 'en')}
      className={`flex items-center ${collapsed ? 'justify-center p-2' : 'gap-2 px-3 py-1.5'} rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-sm transition-colors`}
      title={language === 'en' ? 'Switch to French' : 'Passer en anglais'}
    >
      {collapsed ? (
        <span className="text-slate-700 dark:text-slate-200 font-medium text-xs">
          {language === 'en' ? 'EN' : 'FR'}
        </span>
      ) : (
        <>
          <span className="text-slate-500 dark:text-slate-400">{language === 'en' ? 'Language:' : 'Langue:'}</span>
          <span className="text-slate-700 dark:text-slate-200 font-medium">
            {language === 'en' ? 'English' : 'Français'}
          </span>
        </>
      )}
    </button>
  );
}
