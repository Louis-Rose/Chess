// Shared panel header — "Previous" back button + title between two full-width separators

import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';

interface PanelHeaderProps {
  title: string;
}

export function PanelHeader({ title }: PanelHeaderProps) {
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <div className="flex flex-col pt-2">
      <button
        onClick={() => navigate('/')}
        className="self-start inline-flex items-center gap-2 text-white hover:text-slate-200 transition-colors text-lg px-3 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg ml-2 md:ml-4"
      >
        <ArrowLeft className="w-6 h-6" />
        <span>{t('coaches.previous')}</span>
      </button>
      <div className="border-t border-slate-700 mt-2" />
      <h1 className="text-lg font-bold text-slate-100 text-center mt-2">{title}</h1>
      <div className="border-t border-slate-700 mt-2 mb-6" />
    </div>
  );
}
