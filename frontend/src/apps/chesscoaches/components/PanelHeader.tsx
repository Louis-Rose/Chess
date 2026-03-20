// Shared panel header — "Previous" back button + title between two full-width separators

import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface PanelHeaderProps {
  title: string;
}

export function PanelHeader({ title }: PanelHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col pt-2">
      <button
        onClick={() => navigate('/coach')}
        className="flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors text-base px-2 md:px-4"
      >
        <ArrowLeft className="w-5 h-5" />
        <span>Previous</span>
      </button>
      <div className="border-t border-slate-700 mt-2" />
      <h1 className="text-lg font-bold text-slate-100 text-center mt-2">{title}</h1>
      <div className="border-t border-slate-700 mt-2 mb-6" />
    </div>
  );
}
