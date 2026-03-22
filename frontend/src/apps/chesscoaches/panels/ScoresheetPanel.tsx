// Coaches home — card grid generated from shared NAV_ITEMS

import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { PWAInstallPrompt } from '../../../components/PWAInstallPrompt';
import { NAV_ITEMS } from '../ChessCoachesLayout';

export function ScoresheetPanel() {
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 mt-2">
      <PWAInstallPrompt className="max-w-3xl mx-[5%] md:mx-auto mb-4" />
      <div className="border-t border-slate-700 mb-4 max-w-3xl mx-[5%] md:mx-auto" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-[5%] md:mx-auto">
        {NAV_ITEMS.map(({ path, labelKey, icon: Icon, hoverColor, bgColor }) => (
          <div
            key={path}
            onClick={() => navigate(path)}
            className={`relative bg-slate-800 border border-slate-700 rounded-xl p-5 h-[120px] flex items-center justify-center ${hoverColor} transition-colors cursor-pointer`}
          >
            <div className={`absolute top-5 left-5 w-10 h-10 ${bgColor} rounded-lg flex items-center justify-center`}>
              <Icon className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-lg font-bold text-slate-100 select-text text-center text-balance px-12 py-4">
              {t(labelKey)}
            </h3>
            <ChevronRight className="absolute top-3 right-3 w-5 h-5 text-slate-500" />
          </div>
        ))}
      </div>
      <div className="border-t border-slate-700 mt-4 max-w-3xl mx-[5%] md:mx-auto" />
    </div>
  );
}
