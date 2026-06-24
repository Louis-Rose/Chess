import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { LumnaLogo } from '../apps/chesscoaches/components/LumnaBrand';
import { useAuth } from '../contexts/AuthContext';
import { OWNER_EMAIL } from '../config';
import { APPS } from '../apps/catalog';

// Root landing: pick a product. Tiles come from the shared app catalog.
export function ChooserPage() {
  const { user } = useAuth();
  const isOwner = user?.email === OWNER_EMAIL;

  useEffect(() => {
    document.title = 'LUMNA';
  }, []);

  const tiles = APPS.filter((a) => !a.ownerOnly || isOwner);

  return (
    <div className="min-h-dvh bg-slate-900 text-slate-100 flex flex-col items-center justify-center px-6">
      <div className="mb-10 flex items-center gap-3">
        <LumnaLogo className="h-9 w-9" />
        <span className="text-2xl font-bold tracking-wide">LUMNA</span>
      </div>

      <div className="grid w-full max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map(({ path, label, Icon }) => (
          <Link
            key={path}
            to={path}
            className="group flex flex-col items-center justify-center gap-4 rounded-2xl border border-slate-700 bg-slate-800/50 px-6 py-12 transition-colors hover:border-emerald-500 hover:bg-emerald-500/10"
          >
            <Icon className="h-14 w-14 text-emerald-400" strokeWidth={1.5} />
            <span className="text-xl font-semibold">{label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
