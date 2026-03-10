// Scoresheet reader page

import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';

export function ScoresheetReadPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="max-w-4xl mx-auto">
        <div className="relative flex items-center justify-center pt-2">
          <button
            onClick={() => navigate('/coaches')}
            className="absolute left-2 md:left-4 flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors text-base"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Previous</span>
          </button>
          <h1 className="text-lg font-bold text-slate-100">{t('coaches.navScoresheets')}</h1>
        </div>
        <div className="border-t border-slate-700 mt-2" />
      </div>
    </div>
  );
}
