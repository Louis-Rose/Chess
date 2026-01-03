import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';

interface ThemeToggleProps {
  collapsed?: boolean;
}

export function ThemeToggle({ collapsed = false }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const { language } = useLanguage();

  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };

  const getIcon = () => {
    switch (theme) {
      case 'light':
        return <Sun className="w-4 h-4" />;
      case 'dark':
        return <Moon className="w-4 h-4" />;
      case 'system':
        return <Monitor className="w-4 h-4" />;
    }
  };

  const getLabel = () => {
    switch (theme) {
      case 'light':
        return language === 'fr' ? 'Clair' : 'Light';
      case 'dark':
        return language === 'fr' ? 'Sombre' : 'Dark';
      case 'system':
        return language === 'fr' ? 'Système' : 'System';
    }
  };

  return (
    <button
      onClick={cycleTheme}
      className={`flex items-center ${collapsed ? 'justify-center p-2' : 'gap-2 px-3 py-1.5'} rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-sm transition-colors`}
      title={language === 'fr' ? 'Changer le thème' : 'Change theme'}
    >
      <span className="text-slate-500 dark:text-slate-400">
        {getIcon()}
      </span>
      {!collapsed && (
        <span className="text-slate-700 dark:text-slate-200 font-medium">
          {getLabel()}
        </span>
      )}
    </button>
  );
}
