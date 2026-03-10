// Tournament scoresheets panel — welcome page with card grid

import { useNavigate } from 'react-router-dom';
import { FileText, ChevronRight } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';

export function ScoresheetPanel() {
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 mt-2">
      <div className="border-t border-slate-700 mb-4 max-w-3xl mx-[5%] md:mx-auto" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-[5%] md:mx-auto">
        <div
          onClick={() => navigate('/coaches/scoresheets')}
          className="relative bg-slate-800 border border-slate-700 rounded-xl p-5 h-[120px] flex items-center justify-center hover:border-blue-500 transition-colors cursor-pointer"
        >
          <div className="absolute top-5 left-5 w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <h3 className="text-lg font-bold text-slate-100 select-text text-center text-balance px-12 py-4">
            {t('coaches.navScoresheets')}
          </h3>
          <ChevronRight className="absolute top-3 right-3 w-5 h-5 text-slate-500" />
        </div>
      </div>
      <div className="border-t border-slate-700 mt-4 max-w-3xl mx-[5%] md:mx-auto" />
    </div>
  );
}
