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
      <p className="text-slate-200 text-lg text-center mt-4 mb-4">{t('coaches.homePrompt')}</p>
      <div className="max-w-4xl mx-[5%] md:mx-auto space-y-4 w-full">
        {NAV_SECTIONS.map(({ titleKey, items }) => {
          const visibleItems = items.filter(i => !i.hidden);
          if (visibleItems.length === 0) return null;
          return (
            <div key={titleKey} className="rounded-xl border border-slate-700 overflow-hidden">
              <div className="border-b border-slate-700 bg-slate-800/50 py-3">
                <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider text-center">
                  {t(titleKey)}
                </h2>
              </div>
              <div className="p-4">
                <div className="flex flex-wrap justify-center gap-4">
                  {visibleItems.map(({ path, labelKey, icon: Icon, bgColor, hoverColor, comingSoon }) => (
                    <div
                      key={path}
                      onClick={comingSoon ? undefined : () => navigate(path)}
                      className={`relative bg-slate-800 border border-slate-700 rounded-xl p-5 h-[100px] flex items-center w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.7rem)] ${comingSoon ? 'opacity-50 cursor-default' : `${hoverColor} hover:bg-slate-750 cursor-pointer`} transition-colors`}
                    >
                      <div className={`w-10 h-10 ${comingSoon ? 'bg-slate-600' : bgColor} rounded-lg flex items-center justify-center flex-shrink-0`}>
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                      <div className="ml-4">
                        <span className="text-base font-semibold text-slate-100">{t(labelKey)}</span>
                        {comingSoon && <p className="text-xs text-slate-400 mt-0.5">{t('coaches.comingSoon')}</p>}
                      </div>
                      {!comingSoon && <ChevronRight className="w-5 h-5 text-slate-400 absolute top-3 right-3" />}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

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
