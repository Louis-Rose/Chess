import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useChessData } from '../contexts/ChessDataContext';
import { TimeClassToggle } from './TimeClassToggle';
import { AnalyzedGamesBanner } from './AnalyzedGamesBanner';

interface CardPageLayoutProps {
  children: ReactNode;
  totalGames?: number;
}

export function CardPageLayout({ children, totalGames }: CardPageLayoutProps) {
  const navigate = useNavigate();
  const { selectedTimeClass, handleTimeClassChange, loading } = useChessData();

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="max-w-4xl mx-auto -mt-1">
        <AnalyzedGamesBanner totalGames={totalGames} />
        <div className="relative flex items-center justify-center pt-2">
          <button
            onClick={() => navigate('/chess')}
            className="absolute left-2 md:left-4 flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors text-base"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Previous</span>
          </button>
          <TimeClassToggle selected={selectedTimeClass} onChange={handleTimeClassChange} disabled={loading} />
        </div>
        <div className="border-t border-slate-700 mt-2" />
        {children}
      </div>
    </div>
  );
}
