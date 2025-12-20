// End Game panel - Coming Soon

import { Crown } from 'lucide-react';

export function EndGamePanel() {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col items-center justify-center py-20">
        <Crown className="w-16 h-16 text-slate-500 mb-4" />
        <h2 className="text-2xl font-bold text-slate-300 mb-2">End Game Analysis</h2>
        <p className="text-slate-500">Coming soon...</p>
      </div>
    </div>
  );
}
