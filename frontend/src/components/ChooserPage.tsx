import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Crown, Dumbbell, Music, TrendingUp, Rocket, Shirt, Focus } from 'lucide-react';
import { LumnaLogo } from '../apps/chesscoaches/components/LumnaBrand';
import { useAuth } from '../contexts/AuthContext';

const OWNER_EMAIL = 'rose.louis.mail@gmail.com';

// Root landing: pick a product. Focus (owner) -> /focus, Chess -> /chess, Gym -> /fit,
// Music -> /music, Investing -> /investing, YC Advisor -> /yc, Clothing -> /clothing.
export function ChooserPage() {
  const { user } = useAuth();
  const isOwner = user?.email === OWNER_EMAIL;

  useEffect(() => {
    document.title = 'LUMNA';
  }, []);

  return (
    <div className="min-h-dvh bg-slate-900 text-slate-100 flex flex-col items-center justify-center px-6">
      <div className="mb-10 flex items-center gap-3">
        <LumnaLogo className="h-9 w-9" />
        <span className="text-2xl font-bold tracking-wide">LUMNA</span>
      </div>

      <div className="grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
        {isOwner && (
          <Link
            to="/focus"
            className="group flex flex-col items-center justify-center gap-4 rounded-2xl border border-slate-700 bg-slate-800/50 px-6 py-12 transition-colors hover:border-emerald-500 hover:bg-emerald-500/10"
          >
            <Focus className="h-14 w-14 text-emerald-400" strokeWidth={1.5} />
            <span className="text-xl font-semibold">Focus</span>
          </Link>
        )}

        <Link
          to="/chess"
          className="group flex flex-col items-center justify-center gap-4 rounded-2xl border border-slate-700 bg-slate-800/50 px-6 py-12 transition-colors hover:border-emerald-500 hover:bg-emerald-500/10"
        >
          <Crown className="h-14 w-14 text-emerald-400" strokeWidth={1.5} />
          <span className="text-xl font-semibold">Chess</span>
        </Link>

        <Link
          to="/fit"
          className="group flex flex-col items-center justify-center gap-4 rounded-2xl border border-slate-700 bg-slate-800/50 px-6 py-12 transition-colors hover:border-emerald-500 hover:bg-emerald-500/10"
        >
          <Dumbbell className="h-14 w-14 text-emerald-400" strokeWidth={1.5} />
          <span className="text-xl font-semibold">Gym</span>
        </Link>

        <Link
          to="/music"
          className="group flex flex-col items-center justify-center gap-4 rounded-2xl border border-slate-700 bg-slate-800/50 px-6 py-12 transition-colors hover:border-emerald-500 hover:bg-emerald-500/10"
        >
          <Music className="h-14 w-14 text-emerald-400" strokeWidth={1.5} />
          <span className="text-xl font-semibold">Music</span>
        </Link>

        <Link
          to="/investing"
          className="group flex flex-col items-center justify-center gap-4 rounded-2xl border border-slate-700 bg-slate-800/50 px-6 py-12 transition-colors hover:border-emerald-500 hover:bg-emerald-500/10"
        >
          <TrendingUp className="h-14 w-14 text-emerald-400" strokeWidth={1.5} />
          <span className="text-xl font-semibold">Investing</span>
        </Link>

        <Link
          to="/yc"
          className="group flex flex-col items-center justify-center gap-4 rounded-2xl border border-slate-700 bg-slate-800/50 px-6 py-12 transition-colors hover:border-emerald-500 hover:bg-emerald-500/10"
        >
          <Rocket className="h-14 w-14 text-emerald-400" strokeWidth={1.5} />
          <span className="text-xl font-semibold">YC Advisor</span>
        </Link>

        <Link
          to="/clothing"
          className="group flex flex-col items-center justify-center gap-4 rounded-2xl border border-slate-700 bg-slate-800/50 px-6 py-12 transition-colors hover:border-emerald-500 hover:bg-emerald-500/10"
        >
          <Shirt className="h-14 w-14 text-emerald-400" strokeWidth={1.5} />
          <span className="text-xl font-semibold">Clothing</span>
        </Link>
      </div>
    </div>
  );
}
