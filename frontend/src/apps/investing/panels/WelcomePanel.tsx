// Investing Welcome panel

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Eye, Calendar, TrendingUp, Loader2, PartyPopper, X, GitCompare, Newspaper, Wallet, Flame } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { PWAInstallPrompt } from '../../../components/PWAInstallPrompt';
import { getCompanyLogoUrl } from '../utils/companyLogos';

interface FeatureCardProps {
  icon: LucideIcon;
  iconBg: string;
  hoverBorder: string;
  title: string;
  description: string;
  onClick?: () => void;
}

function FeatureCard({ icon: Icon, iconBg, hoverBorder, title, description, onClick }: FeatureCardProps) {
  const baseClasses = "bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-5 text-left transition-colors";
  const interactiveClasses = onClick ? `${hoverBorder} cursor-pointer` : '';

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`${baseClasses} ${interactiveClasses}`}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 ${iconBg} rounded-lg flex items-center justify-center`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
          {title}
        </h3>
      </div>
      <p className="text-slate-500 dark:text-slate-400 text-sm">
        {description}
      </p>
    </button>
  );
}

// Types
interface CompositionItem {
  ticker: string;
  quantity: number;
  current_price: number;
  current_value: number;
  cost_basis: number;
  gain: number;
  gain_pct: number;
  weight: number;
}

interface CompositionData {
  holdings: CompositionItem[];
  total_value_eur: number;
  total_value_usd: number;
  total_cost_basis_eur: number;
  total_gain_pct: number;
  eurusd_rate: number;
}

interface EarningsItem {
  ticker: string;
  next_earnings_date: string | null;
  remaining_days: number | null;
  date_confirmed: boolean;
  source: 'portfolio' | 'watchlist';
}

interface EarningsResponse {
  earnings: EarningsItem[];
}

interface PerformanceData {
  performance: number | null;
  performance_1m?: number | null;
  days: number;
  current_value: number;
  past_value: number;
}

interface TopMover {
  ticker: string;
  change_pct: number;
  current_price: number;
  past_price: number;
}

interface TopMoversData {
  movers: TopMover[];
  days: number;
}

// API fetchers
const fetchComposition = async (): Promise<CompositionData> => {
  const response = await axios.get('/api/investing/portfolio/composition');
  return response.data;
};

const fetchPerformance = async (days: number): Promise<PerformanceData> => {
  const response = await axios.get(`/api/investing/portfolio/performance-period?days=${days}`);
  return response.data;
};

const fetchTopMovers = async (days: number): Promise<TopMoversData> => {
  const response = await axios.get(`/api/investing/portfolio/top-movers?days=${days}`);
  return response.data;
};

const fetchEarnings = async (): Promise<EarningsResponse> => {
  const response = await axios.get('/api/investing/earnings-calendar?include_portfolio=true&include_watchlist=true');
  return response.data;
};

// Helper to format currency
const formatCurrency = (value: number, currency: 'EUR' | 'USD'): string => {
  if (currency === 'EUR') {
    if (Math.abs(value) >= 1000000) {
      return `${(value / 1000000).toFixed(2)}M€`;
    }
    if (Math.abs(value) >= 1000) {
      return `${(value / 1000).toFixed(1)}K€`;
    }
    return `${value.toFixed(2)}€`;
  }
  // USD - symbol at start
  if (Math.abs(value) >= 1000000) {
    return `$${(value / 1000000).toFixed(2)}M`;
  }
  if (Math.abs(value) >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }
  return `$${value.toFixed(2)}`;
};

export function InvestingWelcomePanel() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading, user, isNewUser, clearNewUserFlag } = useAuth();
  const { language } = useLanguage();

  // Summary card states
  const [valueCurrency, setValueCurrency] = useState<'EUR' | 'USD'>('EUR');
  const [perfPeriod, setPerfPeriod] = useState<7 | 30>(30);
  const [moversPeriod, setMoversPeriod] = useState<7 | 30>(30);

  // Fetch portfolio data
  const { data: compositionData, isLoading: compositionLoading } = useQuery({
    queryKey: ['composition-summary'],
    queryFn: fetchComposition,
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5,
  });

  const { data: earningsData, isLoading: earningsLoading } = useQuery({
    queryKey: ['earnings-summary'],
    queryFn: fetchEarnings,
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 30,
  });

  const { data: perfData, isLoading: perfLoading } = useQuery({
    queryKey: ['performance-period', perfPeriod],
    queryFn: () => fetchPerformance(perfPeriod),
    enabled: isAuthenticated && (compositionData?.holdings?.length ?? 0) > 0,
    staleTime: 1000 * 60 * 15,
  });

  const { data: topMoversData, isLoading: topMoversLoading } = useQuery({
    queryKey: ['top-movers', moversPeriod],
    queryFn: () => fetchTopMovers(moversPeriod),
    enabled: isAuthenticated && (compositionData?.holdings?.length ?? 0) > 0,
    staleTime: 1000 * 60 * 15,
  });

  // Get upcoming earnings - include all, sort by date (TBD at end)
  const getUpcomingEarnings = () => {
    if (!earningsData?.earnings) return [];
    return earningsData.earnings
      .filter(e => e.remaining_days === null || e.remaining_days >= 0)
      .sort((a, b) => (a.remaining_days ?? 999) - (b.remaining_days ?? 999))
      .slice(0, 15);
  };

  const features = [
    {
      icon: TrendingUp,
      iconBg: 'bg-purple-600',
      hoverBorder: 'hover:border-purple-500',
      path: '/investing/financials',
      titleEn: 'Stock Research',
      titleFr: 'Recherche d\'actions',
      descEn: 'Financials and insights on any listed company.',
      descFr: 'Données financières et analyses sur toute entreprise cotée.',
    },
    {
      icon: Eye,
      iconBg: 'bg-blue-600',
      hoverBorder: 'hover:border-blue-500',
      path: '/investing/watchlist',
      titleEn: 'My Watchlist',
      titleFr: 'Ma Watchlist',
      descEn: 'Manage the list of stocks you want to follow.',
      descFr: 'Gérez la liste des actions que vous souhaitez suivre.',
    },
    {
      icon: GitCompare,
      iconBg: 'bg-indigo-600',
      hoverBorder: 'hover:border-indigo-500',
      path: '/investing/comparison',
      titleEn: 'Compare Stocks',
      titleFr: 'Comparer',
      descEn: 'Compare multiple stocks side by side.',
      descFr: 'Comparez plusieurs actions côte à côte.',
    },
    {
      icon: Newspaper,
      iconBg: 'bg-red-600',
      hoverBorder: 'hover:border-red-500',
      path: '/investing/news-feed',
      titleEn: 'News Feed',
      titleFr: 'Fil d\'actualités',
      descEn: 'YouTube videos from verified financial channels.',
      descFr: 'Vidéos YouTube de chaînes financières vérifiées.',
    },
  ];

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-green-500 animate-spin mb-4" />
        <p className="text-slate-400">Loading...</p>
      </div>
    );
  }

  const portfolioValue = valueCurrency === 'EUR'
    ? compositionData?.total_value_eur
    : compositionData?.total_value_usd;
  const perfValue = perfData?.performance;
  const topMovers = topMoversData?.movers ?? [];
  const upcomingEarnings = getUpcomingEarnings();
  const hasHoldings = (compositionData?.holdings?.length ?? 0) > 0;

  return (
    <>
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100">
          {language === 'fr' ? 'Tableau de Bord' : 'Your Investment Dashboard'}
        </h1>
        <PWAInstallPrompt className="max-w-md mx-auto" />
      </div>

      {/* New user welcome banner - only when authenticated */}
      {isAuthenticated && isNewUser && (
        <div className="max-w-2xl mx-auto mt-6 bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 rounded-xl p-6 relative">
          <button
            onClick={clearNewUserFlag}
            className="absolute top-3 right-3 p-1 rounded-lg hover:bg-green-500/20 transition-colors"
          >
            <X className="w-4 h-4 text-green-400" />
          </button>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-green-500/30 rounded-xl flex items-center justify-center flex-shrink-0">
              <PartyPopper className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-green-400 mb-1">
                {language === 'fr' ? 'Bienvenue sur LUMNA !' : 'Welcome to LUMNA!'}
              </h3>
              <p className="text-slate-300 text-sm">
                {language === 'fr'
                  ? 'Votre compte a été créé avec succès. Commencez par ajouter vos transactions pour suivre la performance de votre portefeuille.'
                  : 'Your account has been created successfully. Start by adding your transactions to track your portfolio performance.'}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="md:animate-in md:fade-in md:slide-in-from-bottom-4 md:duration-700 mt-8 flex flex-col min-h-[calc(100vh-200px)]">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {language === 'fr' ? 'Bienvenue' : 'Welcome'}{isAuthenticated && user?.name ? `, ${user.name}` : ''} !
          </h2>
        </div>

        {/* Portfolio Summary Cards - only for authenticated users with holdings */}
        {isAuthenticated && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-7xl mx-auto mb-8">
            {/* Portfolio Value & Performance Card */}
            <div
              onClick={() => navigate('/investing/portfolio')}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-5 cursor-pointer hover:border-green-500 transition-colors h-[200px] flex flex-col"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
                    <Wallet className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-base font-bold text-white">
                    {language === 'fr' ? 'Mon Portefeuille' : 'My Portfolio'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex rounded overflow-hidden border border-slate-300 dark:border-slate-600">
                    <button
                      onClick={(e) => { e.stopPropagation(); setValueCurrency('EUR'); }}
                      className={`px-2 py-0.5 text-xs font-medium ${valueCurrency === 'EUR' ? 'bg-green-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
                    >
                      €
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setValueCurrency('USD'); }}
                      className={`px-2 py-0.5 text-xs font-medium ${valueCurrency === 'USD' ? 'bg-green-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
                    >
                      $
                    </button>
                  </div>
                  <div className="flex rounded overflow-hidden border border-slate-300 dark:border-slate-600">
                    <button
                      onClick={(e) => { e.stopPropagation(); setPerfPeriod(7); }}
                      className={`px-2 py-0.5 text-xs font-medium ${perfPeriod === 7 ? 'bg-green-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
                    >
                      1W
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setPerfPeriod(30); }}
                      className={`px-2 py-0.5 text-xs font-medium ${perfPeriod === 30 ? 'bg-green-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
                    >
                      1M
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center gap-1">
                {compositionLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                ) : hasHoldings && portfolioValue !== undefined ? (
                  <>
                    <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                      {formatCurrency(portfolioValue, valueCurrency)}
                    </p>
                    {perfLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                    ) : perfValue !== undefined && perfValue !== null ? (
                      <p className={`text-lg font-semibold ${perfValue >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {perfValue >= 0 ? '+' : ''}{perfValue.toFixed(1)}%
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-slate-400 italic">
                    {language === 'fr' ? 'Aucune position' : 'No holdings'}
                  </p>
                )}
              </div>
            </div>

            {/* Top Movers Card */}
            <div
              onClick={() => navigate('/investing/portfolio')}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-5 cursor-pointer hover:border-orange-500 transition-colors h-[200px] flex flex-col overflow-hidden"
            >
              <div className="flex items-center justify-between mb-3 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center">
                    <Flame className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-base font-bold text-white">
                    {language === 'fr' ? 'Top Mouvements' : 'Top Movers'}
                  </span>
                </div>
                <div className="flex rounded overflow-hidden border border-slate-300 dark:border-slate-600">
                  <button
                    onClick={(e) => { e.stopPropagation(); setMoversPeriod(7); }}
                    className={`px-2 py-0.5 text-xs font-medium ${moversPeriod === 7 ? 'bg-orange-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
                  >
                    1W
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setMoversPeriod(30); }}
                    className={`px-2 py-0.5 text-xs font-medium ${moversPeriod === 30 ? 'bg-orange-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
                  >
                    1M
                  </button>
                </div>
              </div>
              {topMoversLoading ? (
                <div className="flex-1 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                </div>
              ) : topMovers.length > 0 ? (
                <div className="space-y-2 flex-1 overflow-y-auto scrollbar-hide">
                  {topMovers.map((stock) => {
                    const logoUrl = getCompanyLogoUrl(stock.ticker);
                    return (
                      <div key={stock.ticker} className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
                            {logoUrl ? (
                              <img src={logoUrl} alt={stock.ticker} className="w-4 h-4 object-contain" />
                            ) : (
                              <span className="text-[8px] font-bold text-slate-500">{stock.ticker.slice(0, 2)}</span>
                            )}
                          </div>
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{stock.ticker}</span>
                        </div>
                        <span className={`text-sm font-bold ${stock.change_pct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {stock.change_pct >= 0 ? '+' : ''}{stock.change_pct.toFixed(1)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-slate-400 italic">
                  {language === 'fr' ? 'Aucune position' : 'No holdings'}
                </p>
              )}
            </div>

            {/* Upcoming Earnings Card */}
            <div
              onClick={() => navigate('/investing/earnings')}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-5 cursor-pointer hover:border-amber-500 transition-colors h-[200px] flex flex-col overflow-hidden"
            >
              <div className="flex items-center gap-2 mb-3 flex-shrink-0">
                <div className="w-8 h-8 bg-amber-600 rounded-lg flex items-center justify-center">
                  <Calendar className="w-4 h-4 text-white" />
                </div>
                <span className="text-base font-bold text-white">
                  {language === 'fr' ? 'Résultats à venir' : 'Upcoming Earnings'}
                </span>
              </div>
              {earningsLoading ? (
                <div className="flex-1 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                </div>
              ) : upcomingEarnings.length > 0 ? (
                <div className="space-y-2 flex-1 overflow-y-auto scrollbar-hide pr-1">
                  {upcomingEarnings.map((earning) => {
                    const logoUrl = getCompanyLogoUrl(earning.ticker);
                    return (
                      <div key={earning.ticker} className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
                            {logoUrl ? (
                              <img src={logoUrl} alt={earning.ticker} className="w-4 h-4 object-contain" />
                            ) : (
                              <span className="text-[8px] font-bold text-slate-500">{earning.ticker.slice(0, 2)}</span>
                            )}
                          </div>
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{earning.ticker}</span>
                        </div>
                        <span className="text-sm font-bold text-white">
                          {earning.remaining_days !== null ? (
                            earning.remaining_days === 0
                              ? (language === 'fr' ? "Aujourd'hui" : 'Today')
                              : `${earning.remaining_days} ${language === 'fr' ? 'jours' : 'days'}`
                          ) : 'TBD'}
                          {earning.remaining_days !== null && !earning.date_confirmed && ' ~'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-slate-400 italic">
                  {language === 'fr' ? 'Aucun résultat prévu' : 'No upcoming earnings'}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
          {features.map((feature) => (
            <FeatureCard
              key={feature.path}
              icon={feature.icon}
              iconBg={feature.iconBg}
              hoverBorder={feature.hoverBorder}
              title={language === 'fr' ? feature.titleFr : feature.titleEn}
              description={language === 'fr' ? feature.descFr : feature.descEn}
              onClick={isAuthenticated ? () => navigate(feature.path) : undefined}
            />
          ))}
        </div>

        {/* Legal notices */}
        <div className="text-center mt-auto pb-2">
          <Link
            to="/cgu"
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-sm transition-colors"
          >
            {language === 'fr' ? 'Mentions légales' : 'Legal notices'}
          </Link>
        </div>
      </div>
    </>
  );
}
