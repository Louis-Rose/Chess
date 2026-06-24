import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { LumnaLogo } from '../apps/chesscoaches/components/LumnaBrand';
import { SidebarLayout } from './SidebarLayout';
import { useAuth } from '../contexts/AuthContext';
import { OWNER_EMAIL } from '../config';
import { APPS, type AppEntry } from '../apps/catalog';

const TILE_CLASS =
  'group flex w-full flex-col items-center justify-center gap-4 rounded-2xl border border-slate-700 bg-slate-800/50 px-6 py-12 transition-colors hover:border-emerald-500 hover:bg-emerald-500/10';

function Tile({ entry }: { entry: AppEntry }) {
  const { path, label, Icon } = entry;
  return (
    <Link to={path} className={TILE_CLASS}>
      <Icon className="h-14 w-14 text-emerald-400" strokeWidth={1.5} />
      <span className="text-xl font-semibold">{label}</span>
    </Link>
  );
}

// Root landing: pick a product. Tiles come from the shared app catalog. Owner-only
// apps render in their own centered row below the public grid.
export function ChooserPage() {
  const { user } = useAuth();
  const isOwner = user?.email === OWNER_EMAIL;

  useEffect(() => {
    document.title = 'LUMNA';
  }, []);

  const tiles = APPS.filter((a) => !a.ownerOnly);
  const ownerTiles = isOwner ? APPS.filter((a) => a.ownerOnly) : [];

  return (
    <SidebarLayout>
      <div className="flex min-h-dvh flex-col items-center justify-center px-6 py-10 md:min-h-full">
      <div className="mb-10 flex items-center gap-3">
        <LumnaLogo className="h-9 w-9" />
        <span className="text-2xl font-bold tracking-wide">LUMNA</span>
      </div>

      <div className="w-full max-w-5xl">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tiles.map((entry) => (
            <Tile key={entry.path} entry={entry} />
          ))}
        </div>

        {ownerTiles.length > 0 && (
          <div className="mt-4 flex flex-wrap justify-center gap-4">
            {ownerTiles.map((entry) => (
              <div
                key={entry.path}
                className="w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(25%-0.75rem)]"
              >
                <Tile entry={entry} />
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </SidebarLayout>
  );
}
