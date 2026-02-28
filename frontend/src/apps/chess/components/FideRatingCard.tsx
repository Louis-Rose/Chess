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
      className="relative bg-slate-800 border border-slate-700 rounded-xl p-5 h-[120px] flex items-center justify-center hover:border-cyan-500 transition-colors cursor-pointer"
    >
      <img src="/fide-logo.jpeg" alt="FIDE" className="w-10 h-10 rounded-lg object-cover" />
      <div className="ml-4 min-w-0 text-center">
        <h3 className="text-lg font-bold text-slate-100">{t('chess.fide.title')}</h3>
        {subtitle && (
          <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>
        )}
      </div>
      <ChevronRight className="absolute top-3 right-3 w-5 h-5 text-slate-500" />
    </div>
  );
}
