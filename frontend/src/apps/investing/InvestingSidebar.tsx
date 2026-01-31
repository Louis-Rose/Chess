// Investing app sidebar

import { useState, useEffect } from 'react';
import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import { Loader2, Home, Wallet, Eye, Calendar, TrendingUp, Shield, Clock, X, GitCompare, Newspaper, DollarSign } from 'lucide-react';
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
import { findStockByTicker } from './utils/allStocks';

const navItems = [
  { path: '/investing', icon: Home, labelEn: 'Welcome', labelFr: 'Accueil', end: true },
  { path: '/investing/financials', icon: TrendingUp, labelEn: 'Stock Research', labelFr: 'Recherche d\'actions' },
  { path: '/investing/portfolio', icon: Wallet, labelEn: 'My Portfolio', labelFr: 'Mon Portefeuille' },
  { path: '/investing/watchlist', icon: Eye, labelEn: 'My Watchlist', labelFr: 'Ma Watchlist' },
  { path: '/investing/earnings', icon: Calendar, labelEn: 'Earnings Calendar', labelFr: 'Calendrier des Résultats' },
  { path: '/investing/dividends', icon: DollarSign, labelEn: 'Dividend Calendar', labelFr: 'Calendrier des Dividendes' },
  { path: '/investing/comparison', icon: GitCompare, labelEn: 'Compare Stocks', labelFr: 'Comparer' },
  { path: '/investing/news-feed', icon: Newspaper, labelEn: 'News Feed', labelFr: 'Fil d\'actualités' },
];

export function InvestingSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const { language } = useLanguage();
  // Cookie consent temporarily disabled
  // const { resetConsent } = useCookieConsent();

  // Sidebar is always expanded (collapse feature removed)
  const isCollapsed = false;

  // Recent stocks
  const [recentStocks, setRecentStocks] = useState<string[]>([]);

  // Load recent stocks and refresh on navigation/focus or custom event
  useEffect(() => {
    const refresh = () => setRecentStocks(getRecentStocks(user?.id));
    refresh();
    window.addEventListener('recent-stocks-updated', refresh);
    return () => window.removeEventListener('recent-stocks-updated', refresh);
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
      <div className={`flex justify-center items-center ${isCollapsed ? 'px-0' : 'px-2'} pb-4 border-b border-slate-700 flex-shrink-0 min-h-[64px]`}>
        {authLoading ? (
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        ) : isAuthenticated ? (
          <UserMenu collapsed={isCollapsed} />
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

      {/* Navigation - fixed */}
      <div className={`flex flex-col gap-0.5 ${isCollapsed ? 'px-0' : 'px-2'} pt-2 pb-4 border-b border-slate-700 flex-shrink-0`}>
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.end}
            title={isCollapsed ? (language === 'fr' ? item.labelFr : item.labelEn) : undefined}
            className={({ isActive }) =>
              `flex items-center ${isCollapsed ? 'justify-center px-2' : 'gap-3 px-4'} py-2.5 rounded-lg text-left transition-colors ${
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

      {/* Admin Link - only visible to admins, fixed */}
      {user?.is_admin && (
        <div className={`${isCollapsed ? 'px-0' : 'px-2'} py-2 border-b border-slate-700 flex-shrink-0`}>
          <NavLink
            to="/investing/admin"
            title={isCollapsed ? 'Admin' : undefined}
            className={({ isActive }) =>
              `flex items-center ${isCollapsed ? 'justify-center px-2' : 'gap-3 px-4'} py-2.5 rounded-lg transition-colors ${
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

      {/* Recent Stocks - scrollable section, show when authenticated and not collapsed */}
      {isAuthenticated && !isCollapsed && (
        <div className="flex-1 min-h-0 flex flex-col py-4 border-b border-slate-700">
          <div className="flex items-center gap-2 mb-3 px-2 text-slate-400 flex-shrink-0">
            <Clock className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wide">
              {language === 'fr' ? 'Recherches récentes' : 'Recently searched'}
            </span>
          </div>
          {recentStocks.length > 0 && (
            <div className="flex flex-col gap-1 overflow-y-auto">
              {recentStocks.map((ticker) => {
                const logoUrl = getCompanyLogoUrl(ticker);
                const stock = findStockByTicker(ticker);
                // Remove "Class A/B/C" suffixes from company names
                const displayName = (stock?.name || ticker).replace(/\s+Class\s+[A-Z]$/i, '');
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
                    <span className="text-xs font-medium text-slate-200 truncate min-w-0">{displayName}</span>
                    <span className="text-xs font-medium text-slate-200 flex-shrink-0">({ticker})</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeRecentStock(ticker, user?.id);
                        setRecentStocks(getRecentStocks(user?.id));
                      }}
                      className="ml-auto p-0.5 rounded hover:bg-slate-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                      title={language === 'fr' ? 'Supprimer' : 'Remove'}
                    >
                      <X className="w-3 h-3 text-slate-400" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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
