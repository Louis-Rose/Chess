import { Moon } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

export function ThemeToggle() {
  const { language } = useLanguage();

  return (
    <button
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-700 text-sm cursor-default"
      title={language === 'fr' ? 'Sombre' : 'Dark'}
    >
      <span className="text-slate-400">
        <Moon className="w-4 h-4" />
      </span>
      <span className="text-slate-200 font-medium">
        {language === 'fr' ? 'Sombre' : 'Dark'}
      </span>
    </button>
  );
}
