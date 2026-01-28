// Investing app sidebar

import { useState, useEffect } from 'react';
import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import { Loader2, Home, Briefcase, Eye, Calendar, TrendingUp, Shield, PanelLeftClose, PanelLeftOpen, Clock, X, GitCompare } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
// Cookie consent temporarily disabled
// import { useCookieConsent } from '../../contexts/CookieConsentContext';

// Custom LUMNA logo matching the favicon
const LumnaLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 128 128" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="8" width="112" height="112" rx="20" fill="#16a34a"/>
    <rect x="32" y="64" width="16" height="40" rx="2" fill="white"/>
    <rect x="56" y="48" width="16" height="56" rx="2" fill="white"/>
    <rect x="80" y="32" width="16" height="72" rx="2" fill="white"/>
  </svg>
);
import { UserMenu } from '../../components/UserMenu';
import { LoginButton } from '../../components/LoginButton';
import { LanguageToggle } from '../../components/LanguageToggle';
import { ThemeToggle } from '../../components/ThemeToggle';
import { getRecentStocks, removeRecentStock } from './utils/recentStocks';
import { getCompanyLogoUrl } from './utils/companyLogos';

const navItems = [
  { path: '/investing', icon: Home, labelEn: 'Welcome', labelFr: 'Accueil', end: true },
  { path: '/investing/financials', icon: TrendingUp, labelEn: 'Stock Research', labelFr: 'Recherche d\'actions' },
  { path: '/investing/portfolio', icon: Briefcase, labelEn: 'My Portfolio', labelFr: 'Mon Portefeuille' },
  { path: '/investing/watchlist', icon: Eye, labelEn: 'My Watchlist', labelFr: 'Ma Watchlist' },
  { path: '/investing/earnings', icon: Calendar, labelEn: 'Earnings Calendar', labelFr: 'Calendrier des Résultats' },
  { path: '/investing/comparison', icon: GitCompare, labelEn: 'Compare Stocks', labelFr: 'Comparer' },
];

export function InvestingSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const { language } = useLanguage();
  // Cookie consent temporarily disabled
  // const { resetConsent } = useCookieConsent();

  // Collapsed state with localStorage persistence
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sidebar-collapsed') === 'true';
    }
    return false;
  });

  // Recent stocks
  const [recentStocks, setRecentStocks] = useState<string[]>([]);

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', String(isCollapsed));
  }, [isCollapsed]);

  // Load recent stocks and refresh on navigation/focus
  useEffect(() => {
    setRecentStocks(getRecentStocks(user?.id));
  }, [location.pathname, user?.id]);

  return (
    <div className={`dark ${isCollapsed ? 'w-16' : 'w-64'} bg-slate-900 h-screen p-4 flex flex-col gap-2 sticky top-0 transition-all duration-300`}>
      {/* LUMNA Logo */}
      <Link
        to="/investing"
        className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-center gap-3'} px-2 pb-4 mb-2 border-b border-slate-700 hover:opacity-80 transition-opacity flex-shrink-0`}
      >
        <LumnaLogo className={`${isCollapsed ? 'w-8 h-8 min-w-[2rem] min-h-[2rem]' : 'w-10 h-10'} flex-shrink-0 transition-all`} />
        {!isCollapsed && <span className="text-xl font-bold text-white tracking-wide">LUMNA</span>}
      </Link>

      {/* User Menu */}
      <div className={`flex justify-center items-center mb-4 ${isCollapsed ? 'px-0' : 'px-2'} pb-4 border-b border-slate-700 flex-shrink-0 min-h-[48px]`}>
        {isAuthenticated ? (
          authLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          ) : (
            <UserMenu collapsed={isCollapsed} />
          )
        ) : (
          <LoginButton />
        )}
      </div>

      {/* App Title with Switcher - commented out for now
      <div className="px-2 pb-4 border-b border-slate-700 relative" ref={appSwitcherRef}>
        <button
          onClick={() => setShowAppSwitcher(!showAppSwitcher)}
          className="w-full bg-green-900/30 hover:bg-green-900/50 rounded-lg p-4 text-center transition-colors"
        >
          <div className="text-4xl mb-2">&#128200;</div>
          <div className="flex items-center justify-center gap-1">
            <p className="text-green-400 font-semibold">Investing</p>
            <ChevronDown className={`w-4 h-4 text-green-400 transition-transform ${showAppSwitcher ? 'rotate-180' : ''}`} />
          </div>
          <p className="text-slate-500 text-xs mt-1">Track your portfolio</p>
        </button>
        {showAppSwitcher && (
          <div className="absolute top-full left-2 right-2 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-lg z-50 overflow-hidden">
            <Link
              to="/"
              onClick={() => setShowAppSwitcher(false)}
              className="flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors"
            >
              <span className="text-2xl">🏠</span>
              <div>
                <p className="text-slate-200 font-medium">Home</p>
                <p className="text-slate-500 text-xs">App selector</p>
              </div>
            </Link>
            <Link
              to="/chess"
              onClick={() => setShowAppSwitcher(false)}
              className="flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors border-t border-slate-700"
            >
              <span className="text-2xl">♞</span>
              <div>
                <p className="text-slate-200 font-medium">Chess</p>
                <p className="text-slate-500 text-xs">Improve at Stuff</p>
              </div>
            </Link>
          </div>
        )}
      </div>
      */}

      {/* Navigation */}
      <div className={`flex flex-col gap-1 ${isCollapsed ? 'px-0' : 'px-2'} py-4 border-b border-slate-700 flex-shrink-0`}>
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.end}
            title={isCollapsed ? (language === 'fr' ? item.labelFr : item.labelEn) : undefined}
            className={({ isActive }) =>
              `flex items-center ${isCollapsed ? 'justify-center px-2' : 'gap-3 px-4'} py-3 rounded-lg text-left transition-colors ${
                isActive
                  ? 'bg-green-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800'
              }`
            }
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {!isCollapsed && <span>{language === 'fr' ? item.labelFr : item.labelEn}</span>}
          </NavLink>
        ))}
      </div>

      {/* Admin Link - only visible to admins */}
      {user?.is_admin && (
        <div className={`${isCollapsed ? 'px-0' : 'px-2'} py-2 border-b border-slate-700 flex-shrink-0`}>
          <NavLink
            to="/investing/admin"
            title={isCollapsed ? 'Admin' : undefined}
            className={({ isActive }) =>
              `flex items-center ${isCollapsed ? 'justify-center px-2' : 'gap-3 px-4'} py-3 rounded-lg transition-colors ${
                isActive
                  ? 'bg-amber-600 text-white'
                  : 'text-amber-400 hover:bg-slate-800'
              }`
            }
          >
            <Shield className="w-5 h-5 flex-shrink-0" />
            {!isCollapsed && <span>Admin</span>}
          </NavLink>
        </div>
      )}

      {/* Recent Stocks - only show when authenticated, scrollable section */}
      {isAuthenticated && recentStocks.length > 0 && !isCollapsed && (
        <div className="px-2 py-4 flex-1 min-h-0 overflow-y-auto">
          <div className="flex items-center gap-2 mb-3 text-slate-400">
            <Clock className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wide">
              {language === 'fr' ? 'Recherches récentes' : 'Recently searched'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {recentStocks.map((ticker) => {
              const logoUrl = getCompanyLogoUrl(ticker);
              return (
                <div
                  key={ticker}
                  onClick={() => navigate(`/investing/stock/${ticker}`)}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer group"
                >
                  <div className="w-5 h-5 rounded bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
                    {logoUrl ? (
                      <img
                        src={logoUrl}
                        alt={ticker}
                        className="w-4 h-4 object-contain"
                        onError={(e) => {
                          const parent = e.currentTarget.parentElement;
                          if (parent) {
                            parent.innerHTML = `<span class="text-[7px] font-bold text-slate-500">${ticker.slice(0, 2)}</span>`;
                          }
                        }}
                      />
                    ) : (
                      <span className="text-[7px] font-bold text-slate-500">{ticker.slice(0, 2)}</span>
                    )}
                  </div>
                  <span className="text-xs font-medium text-slate-200 truncate">{ticker}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeRecentStock(ticker, user?.id);
                      setRecentStocks(getRecentStocks(user?.id));
                    }}
                    className="p-0.5 rounded hover:bg-slate-600 opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
                    title={language === 'fr' ? 'Supprimer' : 'Remove'}
                  >
                    <X className="w-3 h-3 text-slate-400" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Theme, Language, Collapse & Legal - at bottom */}
      <div className={`mt-auto flex-shrink-0 ${isCollapsed ? 'px-0' : 'px-2'} pt-4 border-t border-slate-700`}>
        <div className="flex flex-col items-center gap-3">
          <ThemeToggle collapsed={isCollapsed} />
          <LanguageToggle collapsed={isCollapsed} />
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm transition-colors"
            title={isCollapsed ? (language === 'fr' ? 'Développer' : 'Expand') : (language === 'fr' ? 'Réduire' : 'Collapse')}
          >
            {isCollapsed ? <PanelLeftOpen className="w-5 h-5 text-slate-400" /> : <PanelLeftClose className="w-5 h-5 text-slate-400" />}
            {!isCollapsed && <span className="text-slate-200 font-medium">{language === 'fr' ? 'Réduire' : 'Collapse'}</span>}
          </button>
          {!isCollapsed && (
            <div className="flex flex-col items-center gap-1">
              <Link
                to="/cgu"
                className="text-slate-500 hover:text-slate-300 text-xs transition-colors"
              >
                {language === 'fr' ? 'Mentions légales' : 'Legal notices'}
              </Link>
              {/* Cookie consent temporarily disabled
              <button
                onClick={resetConsent}
                className="text-slate-500 hover:text-slate-300 text-xs transition-colors"
              >
                {language === 'fr' ? 'Gérer les cookies' : 'Manage cookies'}
              </button>
              */}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
