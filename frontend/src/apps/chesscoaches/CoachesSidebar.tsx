// Coaches app login screen — Google OAuth

import { SidebarShell } from '../../components/SidebarShell';
import { useLanguage } from '../../contexts/LanguageContext';
import { LumnaBrand } from './components/LumnaBrand';
import { LoginButton } from '../../components/LoginButton';
import { LanguageToggle } from './components/LanguageToggle';

export function CoachesSidebar() {
  const { t } = useLanguage();

  return (
    <SidebarShell fullWidth>
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex flex-col items-center px-2 pb-3 mb-2">
          <LumnaBrand />
        </div>
        <div className="h-px bg-slate-700 mx-3 mb-4" />

        {/* Description */}
        <div className="px-6 pb-6 h-[6.5rem] md:h-[7.5rem] flex items-center">
          <span className="text-slate-300 text-sm md:text-lg leading-relaxed text-center block w-full">
            {t('coaches.onboardingDescription')}
          </span>
        </div>

        <div className="h-px bg-slate-700 mx-3 mb-6" />

        {/* Language toggle + Google login */}
        <div className="flex justify-center px-6 mb-6">
          <LanguageToggle />
        </div>
        <div className="h-px bg-slate-700 mx-3 mb-6" />
        <div className="flex flex-col items-center gap-4 px-6">
          <span className="text-slate-100 text-lg text-center">{t('coaches.onboardingInstruction')}</span>
          <LoginButton size="large" />
        </div>

        <div className="h-px bg-slate-700 mx-3 mt-6" />
      </div>
    </SidebarShell>
  );
}
