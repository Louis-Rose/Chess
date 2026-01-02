// Financials panel - placeholder

import { TrendingUp } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';

export function FinancialsPanel() {
  const { language } = useLanguage();

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col items-center gap-2 mb-6 mt-8">
        <h2 className="text-3xl font-bold text-slate-100">Financials</h2>
        <p className="text-slate-400 text-lg italic">
          {language === 'fr' ? 'Bientôt disponible' : 'Coming soon'}
        </p>
      </div>

      <div className="max-w-2xl mx-auto">
        <div className="bg-slate-100 rounded-xl p-12 text-center">
          <TrendingUp className="w-16 h-16 text-slate-400 mx-auto mb-4" />
          <p className="text-slate-500">
            {language === 'fr'
              ? 'Cette section est en cours de développement.'
              : 'This section is under development.'}
          </p>
        </div>
      </div>
    </div>
  );
}
