// Coaches home — card grid grouped by section

import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { PWAInstallPrompt } from '../../../components/PWAInstallPrompt';
import { NAV_SECTIONS } from '../ChessCoachesLayout';

export function ScoresheetPanel() {
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 mt-2 flex flex-col min-h-[calc(100dvh-80px)]">
      <PWAInstallPrompt className="max-w-4xl mx-[5%] md:mx-auto mb-4 mt-2 md:mt-0" />
      <div className="border-t border-slate-700 mb-6" />

      {NAV_SECTIONS.map(({ titleKey, items }, idx) => {
        const enabledItems = items.filter(({ path }) => path === '/scoresheets');
        if (enabledItems.length === 0) return null;
        return (
          <div key={titleKey}>
            {idx > 0 && <div className="border-t border-slate-700 my-6" />}
            <div className="max-w-4xl mx-[5%] md:mx-auto flex flex-col items-center">
              <p className="text-slate-200 text-lg mb-6">{t('coaches.homePrompt')}</p>
              <div className="flex justify-center w-full">
                {enabledItems.map(({ path, labelKey, icon: Icon, bgColor }) => (
                  <div
                    key={path}
                    onClick={() => navigate(path)}
                    className="relative bg-slate-800 border-2 border-blue-500/60 rounded-xl p-5 w-full max-w-sm h-[120px] flex items-center justify-center hover:border-blue-400 hover:bg-slate-750 transition-colors cursor-pointer shadow-lg shadow-blue-500/10"
                  >
                    <div className={`absolute top-5 left-5 w-10 h-10 ${bgColor} rounded-lg flex items-center justify-center`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-100 select-text text-center px-12 py-4">
                      {t(labelKey)}
                    </h3>
                    <ChevronRight className="absolute top-3 right-3 w-5 h-5 text-slate-400" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}

      <div className="border-t border-slate-700 mt-6" />
      <div className="flex-1" />
      <div className="text-center pb-4">
        <button
          onClick={() => navigate('/about')}
          className="text-xs text-slate-500 hover:text-slate-400 transition-colors"
        >
          {t('coaches.navAbout')}
        </button>
      </div>
    </div>
  );
}
