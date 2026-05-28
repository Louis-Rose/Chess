import { Crown } from 'lucide-react';

export function ChessDashboard() {
  return (
    <div className="min-h-dvh bg-slate-900 text-slate-100 font-sans flex flex-col items-center justify-center gap-4 p-6">
      <Crown className="w-12 h-12 text-emerald-400" />
      <h1 className="text-2xl font-semibold">Chess</h1>
      <p className="text-slate-400 text-sm">Coming soon.</p>
    </div>
  );
}
