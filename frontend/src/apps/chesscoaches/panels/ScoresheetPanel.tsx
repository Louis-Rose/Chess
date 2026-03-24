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
      <div className="border-t border-slate-700 mb-4 md:hidden" />
      <PWAInstallPrompt className="max-w-4xl mx-[5%] md:mx-auto mb-4" />
      <div className="border-t border-slate-700 mb-6" />

      {NAV_SECTIONS.map(({ titleKey, items }, idx) => (
        <div key={titleKey}>
          {idx > 0 && <div className="border-t border-slate-700 my-6" />}
          <div className="max-w-4xl mx-[5%] md:mx-auto">
            <h2 className="text-xl font-bold text-slate-100 uppercase tracking-wider mb-3 text-center">
              {t(titleKey)}
            </h2>
            {items.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {items.map(({ path, labelKey, icon: Icon, hoverColor, bgColor }) => (
                  <div
                    key={path}
                    onClick={() => navigate(path)}
                    className={`relative bg-slate-800 border border-slate-700 rounded-xl p-5 h-[120px] flex items-center justify-center ${hoverColor} transition-colors cursor-pointer`}
                  >
                    <div className={`absolute top-5 left-5 w-10 h-10 ${bgColor} rounded-lg flex items-center justify-center`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-100 select-text text-center px-12 py-4">
                      {t(labelKey)}
                    </h3>
                    <ChevronRight className="absolute top-3 right-3 w-5 h-5 text-slate-500" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 text-center">
                <p className="text-slate-500 text-sm">{t('coaches.sectionEmpty')}</p>
              </div>
            )}
          </div>
        </div>
      ))}

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
