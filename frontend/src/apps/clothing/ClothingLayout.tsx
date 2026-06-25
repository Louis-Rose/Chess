import { NavLink, Outlet } from 'react-router-dom';
import { Search, BookOpen, Store, type LucideIcon } from 'lucide-react';
import { LumnaLogo } from '../chesscoaches/components/LumnaBrand';
import { AppSidebar } from '../../components/AppSidebar';
import { AppTitle } from '../../components/AppTitle';
import { LangToggle } from '../../components/LangToggle';
import { useLanguage } from '../../contexts/LanguageContext';

interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: '/clothing', labelKey: 'clothing.nav.find', icon: Search, end: true },
  { to: '/clothing/how-to', labelKey: 'clothing.nav.howTo', icon: BookOpen },
  { to: '/clothing/stores', labelKey: 'clothing.nav.stores', icon: Store },
];

function navClass(active: boolean): string {
  return [
    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    active
      ? 'bg-emerald-500/15 text-emerald-300'
      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200',
  ].join(' ');
}

// Sidebar shell for the Clothing section: the shared LUMNA rail plus the app's
// tabs (Find, Stores).
export function ClothingLayout() {
  const { t } = useLanguage();
  return (
    <div className="flex min-h-dvh bg-slate-900 text-slate-100">
      <AppSidebar className="sticky top-0 hidden h-dvh md:flex">
        <nav className="flex flex-col gap-1">
          {NAV.map(({ to, labelKey, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => navClass(isActive)}>
              <Icon className="h-4 w-4" />
              {t(labelKey)}
            </NavLink>
          ))}
        </nav>
      </AppSidebar>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top nav */}
        <div className="flex items-center gap-1 border-b border-slate-800 px-3 py-2 md:hidden">
          <NavLink to="/clothing" end className="mr-2 flex items-center gap-2">
            <LumnaLogo className="h-6 w-6" />
          </NavLink>
          {NAV.map(({ to, labelKey, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => navClass(isActive)}>
              <Icon className="h-4 w-4" />
              {t(labelKey)}
            </NavLink>
          ))}
          <LangToggle className="ml-auto" />
        </div>

        <div className="relative hidden border-b border-slate-800 px-6 py-5 md:block">
          <AppTitle title="Clothing" label={t('clothing.title')} />
          <div className="absolute right-6 top-1/2 -translate-y-1/2">
            <LangToggle />
          </div>
        </div>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
