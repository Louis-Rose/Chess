import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useChessData } from '../contexts/ChessDataContext';
import { fetchFideId, fetchFideRating } from '../hooks/api';

export function FideRatingCard() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { searchedUsername } = useChessData();

  const [subtitle, setSubtitle] = useState<string | null>(null);

  useEffect(() => {
    if (!searchedUsername) return;
    fetchFideId(searchedUsername).then(id => {
      if (!id) return;
      fetchFideRating(id).then(data => {
        const parts: string[] = [];
        if (data.rapid_rating) parts.push(`Rapid ${data.rapid_rating}`);
        if (data.classical_rating) parts.push(`Classical ${data.classical_rating}`);
        if (data.blitz_rating) parts.push(`Blitz ${data.blitz_rating}`);
        if (parts.length > 0) setSubtitle(parts.join(' · '));
      }).catch(() => {});
    });
  }, [searchedUsername]);

  return (
    <div
      onClick={() => navigate('/chess/fide')}
      className="relative bg-slate-800 border border-slate-700 rounded-xl p-5 h-[120px] flex flex-col items-center justify-center hover:border-cyan-500 transition-colors cursor-pointer"
    >
      <div className="absolute top-5 left-5 w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden">
        <img src="/fide-logo.png" alt="FIDE" className="w-10 h-10 object-cover" />
      </div>
      <h3 className="text-lg font-bold text-slate-100 select-text text-center text-balance px-12 py-4">{t('chess.fide.title')}</h3>
      {subtitle && (
        <p className="text-sm text-slate-400 -mt-3">{subtitle}</p>
      )}
      <ChevronRight className="absolute top-3 right-3 w-5 h-5 text-slate-500" />
    </div>
  );
}
