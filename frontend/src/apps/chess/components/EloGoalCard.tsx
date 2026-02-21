import { useReducer, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, ChevronRight } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { getChessPrefs } from '../utils/constants';

export function EloGoalCard() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [, forceUpdate] = useReducer(x => x + 1, 0);

  useEffect(() => {
    window.addEventListener('chess-prefs-change', forceUpdate);
    return () => window.removeEventListener('chess-prefs-change', forceUpdate);
  }, [forceUpdate]);

  const hasGoal = getChessPrefs().elo_goal !== null;

  return (
    <div
      onClick={() => navigate('/chess/goal')}
      className="relative bg-slate-800 border border-slate-700 rounded-xl p-5 h-[120px] flex items-center justify-center hover:border-blue-500 transition-colors cursor-pointer"
    >
      <div className="absolute top-5 left-5 w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
        <Target className="w-5 h-5 text-white" />
      </div>
      <h3 className="text-lg font-bold text-slate-100 text-center text-balance pl-12 pr-2 py-4">
        {hasGoal ? t('chess.goalCard.title') : t('chess.goalCard.setGoal')}
      </h3>
      <ChevronRight className="absolute top-3 right-3 w-5 h-5 text-slate-500" />
    </div>
  );
}
