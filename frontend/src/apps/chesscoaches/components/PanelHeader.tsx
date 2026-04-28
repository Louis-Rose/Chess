// Shared panel header — "Previous" back button + title between two full-width separators

import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';

interface PanelHeaderProps {
  title?: string;
  onBack?: () => void;
}

export function PanelHeader({ title, onBack }: PanelHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();

  const handleBack = onBack || (() => {
    if (location.key === 'default') navigate('/app');
    else navigate(-1);
  });

  return (
    <div className="flex flex-col pt-2">
      <button
        onClick={handleBack}
        className="self-start inline-flex items-center gap-2 text-white hover:text-slate-200 transition-colors text-lg px-3 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg ml-2 md:ml-4"
      >
        <ArrowLeft className="w-6 h-6" />
        <span>{t('coaches.previous')}</span>
      </button>
      <div className="border-t border-slate-700 mt-2" />
      {title && (
        <>
          <h1 className="text-lg font-bold text-slate-100 text-center mt-2">{title}</h1>
          <div className="border-t border-slate-700 mt-2 mb-6" />
        </>
      )}
    </div>
  );
}
