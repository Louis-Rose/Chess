// Coaches home — card grid grouped by section

import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { NAV_SECTIONS } from '../ChessCoachesLayout';

export function ScoresheetPanel() {
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 mt-2 flex flex-col min-h-[calc(100dvh-80px)]">
      <p className="text-slate-400 text-sm text-center mt-4 mb-2">{t('coaches.homePrompt')}</p>
      {NAV_SECTIONS.map(({ titleKey, items }) => {
        if (items.length === 0) return null;
        return (
          <div key={titleKey}>
            <div className="border-t border-slate-700" />
            <div className="max-w-4xl mx-[5%] md:mx-auto flex flex-col items-center">
              <h2 className="text-xl font-bold text-slate-100 uppercase tracking-wider text-center my-3">
                {t(titleKey)}
              </h2>
            </div>
            <div className="border-t border-slate-700 mb-4" />
            <div className="max-w-4xl mx-[5%] md:mx-auto flex flex-col items-center">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full">
                {items.map(({ path, labelKey, icon: Icon, bgColor, hoverColor }) => (
                  <div
                    key={path}
                    onClick={() => navigate(path)}
                    className={`bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-center gap-3 ${hoverColor} hover:bg-slate-750 transition-colors cursor-pointer`}
                  >
                    <div className={`w-9 h-9 ${bgColor} rounded-lg flex items-center justify-center flex-shrink-0`}>
                      <Icon className="w-4.5 h-4.5 text-white" />
                    </div>
                    <span className="text-sm font-medium text-slate-100">{t(labelKey)}</span>
                    <ChevronRight className="w-4 h-4 text-slate-500 ml-auto flex-shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}

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
