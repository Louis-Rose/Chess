import { Link } from 'react-router-dom';
import { ProfileMenu } from './ProfileMenu';
import { LangToggle } from './LangToggle';
import { LumnaLogo } from '../apps/chesscoaches/components/LumnaBrand';

// Compact top bar (used as the mobile header inside SidebarLayout). Top-left:
// the profile avatar (click for a menu), the LUMNA logo linking to the app
// chooser, and an optional app title. Top-right: the language toggle, an inert
// placeholder unless `langToggle` is set (only translated apps wire it up).
export function AppHeader({ title, langToggle = false }: { title?: string; langToggle?: boolean }) {
  return (
    <header className="mb-6 flex items-center gap-3">
      <ProfileMenu />
      <Link to="/" aria-label="LUMNA home" className="transition-opacity hover:opacity-80">
        <LumnaLogo className="h-8 w-8" />
      </Link>
      {title && <h1 className="text-xl font-bold tracking-wide">{title}</h1>}
      <LangToggle disabled={!langToggle} className="ml-auto" />
    </header>
  );
}
