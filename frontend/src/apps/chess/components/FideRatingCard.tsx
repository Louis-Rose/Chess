import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Loader2 } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useChessData } from '../contexts/ChessDataContext';
import { fetchFideId, fetchFideRating } from '../hooks/api';

interface FideData {
  rapid_rating: number | null;
  classical_rating: number | null;
  blitz_rating: number | null;
}

function getRatingForTimeClass(data: FideData, timeClass: string): number | null {
  switch (timeClass) {
    case 'rapid': return data.rapid_rating;
    case 'blitz': return data.blitz_rating;
    case 'bullet': return data.blitz_rating;
    default: return data.classical_rating;
  }
}

export function FideRatingCard() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { searchedUsername, selectedTimeClass } = useChessData();

  const [fideData, setFideData] = useState<FideData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!searchedUsername) return;
    setLoading(true);
    fetchFideId(searchedUsername).then(id => {
      if (!id) { setLoading(false); return; }
      fetchFideRating(id).then(data => {
        setFideData(data);
      }).catch(() => {}).finally(() => setLoading(false));
    }).catch(() => setLoading(false));
  }, [searchedUsername]);

  const rating = fideData ? getRatingForTimeClass(fideData, selectedTimeClass || 'rapid') : null;
  const subtitle = fideData ? (rating ? String(rating) : t('chess.fide.unrated')) : null;

  return (
    <div
      onClick={() => navigate('/chess/fide')}
      className="relative bg-slate-800 border border-slate-700 rounded-xl p-5 h-[120px] flex flex-col items-center justify-center hover:border-cyan-500 transition-colors cursor-pointer"
    >
      <div className="absolute top-5 left-5 w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden">
        <img src="/fide-logo.png" alt="FIDE" className="w-10 h-10 object-cover" />
      </div>
      <h3 className="text-lg font-bold text-slate-100 select-text text-center text-balance px-12 py-4">{t('chess.fide.title')}</h3>
      <p className="text-lg font-bold text-slate-100 -mt-3">
        {loading ? <Loader2 className="w-5 h-5 animate-spin text-slate-400 mx-auto" /> : (subtitle ?? '\u00A0')}
      </p>
      <ChevronRight className="absolute top-3 right-3 w-5 h-5 text-slate-500" />
    </div>
  );
}
