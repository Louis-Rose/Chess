import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { SidebarLayout } from './SidebarLayout';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { OWNER_EMAIL } from '../config';
import { APPS, type AppEntry } from '../apps/catalog';

const TILE_CLASS =
  'group flex w-full flex-col items-center justify-center gap-4 rounded-2xl border border-slate-700 bg-slate-800/50 px-6 py-12 transition-colors hover:border-emerald-500 hover:bg-emerald-500/10';

function Tile({ entry }: { entry: AppEntry }) {
  const { t } = useLanguage();
  const { path, labelKey, Icon } = entry;
  return (
    <Link to={path} className={TILE_CLASS}>
      <Icon className="h-14 w-14 text-emerald-400" strokeWidth={1.5} />
      <span className="text-xl font-semibold">{t(labelKey)}</span>
    </Link>
  );
}

// Root landing: pick a product. Tiles come from the shared app catalog and flow
// into rows of up to four, each row horizontally centered, so the grid adapts on
// its own as apps are added or removed (owner-only apps appear for the owner).
export function ChooserPage() {
  const { user, isLoading } = useAuth();
  const isOwner = user?.email === OWNER_EMAIL;

  useEffect(() => {
    document.title = 'LUMNA';
  }, []);

  const tiles = APPS.filter((a) => !a.ownerOnly || isOwner);

  return (
    <SidebarLayout langToggle>
      <div className="flex min-h-dvh flex-col items-center justify-center px-6 py-10 md:min-h-full">
        {/* Hold the grid until auth resolves so owner-only tiles don't pop in and
            reflow the rows (a 3-wide row jumping to 4 on refresh). */}
        <div
          className={`flex w-full max-w-5xl flex-wrap justify-center gap-4 ${
            isLoading ? 'invisible' : ''
          }`}
        >
          {tiles.map((entry) => (
            <div
              key={entry.path}
              className="w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(25%-0.75rem)]"
            >
              <Tile entry={entry} />
            </div>
          ))}
        </div>
      </div>
    </SidebarLayout>
  );
}
