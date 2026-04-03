// Coaches app login screen — Google OAuth

import { SidebarShell } from '../../components/SidebarShell';
import { useLanguage } from '../../contexts/LanguageContext';
import { LumnaBrand } from './components/LumnaBrand';
import { LoginButton } from '../../components/LoginButton';

function LanguageToggleInline() {
  const { language, setLanguage } = useLanguage();
  return (
    <div className="relative flex bg-slate-700 rounded-md p-0.5">
      <div
        className="absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] bg-slate-500 rounded transition-transform duration-200"
        style={{ transform: language === 'en' ? 'translateX(0)' : 'translateX(100%)' }}
      />
      <button
        onClick={() => setLanguage('en')}
        className={`relative z-10 px-2 py-1 text-xs font-medium rounded transition-colors ${language === 'en' ? 'text-white' : 'text-slate-400'}`}
      >
        EN
      </button>
      <button
        onClick={() => setLanguage('fr')}
        className={`relative z-10 px-2 py-1 text-xs font-medium rounded transition-colors ${language === 'fr' ? 'text-white' : 'text-slate-400'}`}
      >
        FR
      </button>
    </div>
  );
}

export function CoachesSidebar() {
  const { t } = useLanguage();

  return (
    <SidebarShell hideThemeToggle hideLanguageToggle fullWidth>
      <div className="relative flex flex-col items-center px-2 pb-3 mb-2">
        <LumnaBrand />
        <div className="absolute right-0 top-0">
          <LanguageToggleInline />
        </div>
      </div>
      <div className="h-px bg-slate-700 mx-3 mb-4" />

      {/* Description */}
      <div className="px-6 pb-6">
        <span className="text-slate-300 text-sm md:text-lg leading-relaxed text-center block">
          {t('coaches.onboardingDescription')}
        </span>
      </div>

      <div className="h-px bg-slate-700 mx-3 mb-6" />

      {/* Google login */}
      <div className="flex flex-col items-center gap-4 px-6">
        <span className="text-slate-400 text-lg">{t('coaches.onboardingInstruction')}</span>
        <LoginButton size="large" />
      </div>

      <div className="h-px bg-slate-700 mx-3 mt-6" />
    </SidebarShell>
  );
}
