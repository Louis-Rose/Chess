// Demo AlphaWise sidebar - simplified version with only Dashboard and Portfolio

import { NavLink, Link } from 'react-router-dom';
import { Loader2, Home, Wallet, Settings } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { UserMenu } from '../../components/UserMenu';
import { LoginButton } from '../../components/LoginButton';
import { ThemeToggle } from '../../components/ThemeToggle';
import { LanguageToggle } from '../../components/LanguageToggle';

// LUMNA logo (green chart icon)
const LumnaLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 128 128" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="8" width="112" height="112" rx="20" fill="#16a34a"/>
    <rect x="32" y="64" width="16" height="40" rx="2" fill="white"/>
    <rect x="56" y="48" width="16" height="56" rx="2" fill="white"/>
    <rect x="80" y="32" width="16" height="72" rx="2" fill="white"/>
  </svg>
);

const navItems = [
  { path: '/demo-alphawise', icon: Home, labelEn: 'AlphaWise portfolio', labelFr: 'Portefeuille AlphaWise', end: true },
  { path: '/demo-alphawise/portfolio', icon: Wallet, labelEn: 'My Portfolio', labelFr: 'Mon Portefeuille' },
];

export function DemoAlphawiseSidebar() {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const { language } = useLanguage();
  const isAdmin = user?.is_admin;

  return (
    <div className="dark w-64 bg-slate-900 h-screen p-4 flex flex-col gap-2 sticky top-0">
      {/* Lumna × AlphaWise Logos */}
      <Link
        to="/demo-alphawise"
        className="flex flex-col items-center gap-2 px-2 pb-4 mb-2 border-b border-slate-700 hover:opacity-80 transition-opacity flex-shrink-0"
      >
        <div className="flex items-center gap-2">
          <LumnaLogo className="w-12 h-12 flex-shrink-0" />
          <img src="/alphawise-logo.png" alt="AlphaWise" className="w-12 h-12 flex-shrink-0 object-contain" />
        </div>
        <div className="flex items-center gap-1.5 text-base font-bold text-white">
          <span>Lumna</span>
          <span>AlphaWise</span>
        </div>
      </Link>

      {/* User Menu */}
      <div className="flex justify-center items-center px-2 pb-4 border-b border-slate-700 flex-shrink-0 min-h-[64px]">
        {authLoading ? (
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        ) : isAuthenticated ? (
          <UserMenu collapsed={false} />
        ) : (
          <LoginButton />
        )}
      </div>

      {/* Navigation */}
      <div className="flex flex-col gap-0.5 px-2 pt-2 pb-4 border-b border-slate-700 flex-shrink-0">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 rounded-lg text-left transition-colors ${
                isActive
                  ? 'bg-green-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800'
              }`
            }
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            <span>{language === 'fr' ? item.labelFr : item.labelEn}</span>
          </NavLink>
        ))}
        {/* Admin link - only for admins */}
        {isAdmin && (
          <NavLink
            to="/demo-alphawise/admin"
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 rounded-lg text-left transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800'
              }`
            }
          >
            <Settings className="w-5 h-5 flex-shrink-0" />
            <span>{language === 'fr' ? 'Admin' : 'Admin'}</span>
          </NavLink>
        )}
      </div>

      {/* Theme & Language - at bottom */}
      <div className="mt-auto flex-shrink-0 px-2 pt-2 pb-2">
        <div className="flex items-center justify-center gap-2">
          <ThemeToggle />
          <LanguageToggle />
        </div>
      </div>
    </div>
  );
}
