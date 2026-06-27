import { Link } from 'react-router-dom';
import { ProfileMenu } from './ProfileMenu';
import { LangToggle } from './LangToggle';
import { LumnaLogo } from '../apps/chesscoaches/components/LumnaBrand';

// Compact top bar (used as the mobile header inside SidebarLayout). Left: the
// profile avatar (click for a menu). Center: the LUMNA logo (links to the app
// chooser) + the app name, or "LUMNA" on the chooser itself. Right: the
// language toggle, an inert placeholder unless `langToggle` is set (only
// translated apps wire it up).
export function AppHeader({ title, langToggle = false }: { title?: string; langToggle?: boolean }) {
  return (
    <header className="relative mb-6 flex items-center">
      <ProfileMenu />
      <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2">
        <Link to="/" aria-label="LUMNA home" className="transition-opacity hover:opacity-80">
          <LumnaLogo className="h-8 w-8" />
        </Link>
        <span className="text-xl font-bold tracking-wide">{title ?? 'LUMNA'}</span>
      </div>
      <LangToggle disabled={!langToggle} className="ml-auto" />
    </header>
  );
}
