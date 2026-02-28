import { useReducer, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, ChevronRight } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useChessData } from '../contexts/ChessDataContext';
import { getChessPrefs, syncGoalFromServer } from '../utils/constants';
import type { TimeClass } from '../utils/types';

export function EloGoalCard() {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const { searchedUsername, selectedTimeClass } = useChessData();
  const [, forceUpdate] = useReducer(x => x + 1, 0);

  useEffect(() => {
    window.addEventListener('chess-prefs-change', forceUpdate);
    return () => window.removeEventListener('chess-prefs-change', forceUpdate);
  }, [forceUpdate]);

  // Re-sync goal from server on mount
  useEffect(() => {
    if (searchedUsername) {
      syncGoalFromServer(searchedUsername, (selectedTimeClass || 'rapid') as TimeClass);
    }
  }, [searchedUsername, selectedTimeClass]);

  const prefs = getChessPrefs();
  const hasGoal = prefs.elo_goal !== null;

  let goalSubtitle = '';
  if (hasGoal && prefs.elo_goal && prefs.elo_goal_start_date && prefs.elo_goal_months) {
    const start = new Date(prefs.elo_goal_start_date);
    const deadline = new Date(start);
    deadline.setMonth(deadline.getMonth() + prefs.elo_goal_months);
    const daysLeft = Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
    goalSubtitle = language === 'fr'
      ? `${prefs.elo_goal} elo ${daysLeft > 0 ? `en ${daysLeft} jour${daysLeft > 1 ? 's' : ''}` : ''}`
      : `${prefs.elo_goal} elo ${daysLeft > 0 ? `in ${daysLeft} day${daysLeft > 1 ? 's' : ''}` : ''}`;
  }

  const title = hasGoal ? t('chess.goalCard.title') : t('chess.goalCard.setGoal');

  return (
    <div
      onClick={() => navigate('/chess/goal')}
      className="relative bg-slate-800 border border-slate-700 rounded-xl p-5 h-[120px] flex flex-col items-center justify-center hover:border-blue-500 transition-colors cursor-pointer"
    >
      <div className="absolute top-5 left-5 w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
        <Target className="w-5 h-5 text-white" />
      </div>
      <h3 className="text-lg font-bold text-slate-100 select-text text-center text-balance pl-12 pr-2 py-4">{title}</h3>
      {hasGoal && (
        <p className="text-lg font-bold text-slate-100 -mt-3">{goalSubtitle}</p>
      )}
      <ChevronRight className="absolute top-3 right-3 w-5 h-5 text-slate-500" />
    </div>
  );
}
