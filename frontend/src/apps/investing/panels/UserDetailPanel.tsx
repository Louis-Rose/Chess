// User detail panel - view individual user info (admin only)

import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { ArrowLeft, Loader2, User, Clock, Briefcase, Eye, Download, Search, Wallet } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { getCompanyLogoUrl } from '../utils/companyLogos';
import { findStockByTicker } from '../utils/allStocks';

interface UserData {
  id: number;
  email: string;
  name: string;
  picture: string;
  is_admin: number;
  created_at: string;
  total_minutes: number;
  last_active: string | null;
}

interface DailyActivity {
  activity_date: string;
  minutes: number;
}

interface PortfolioHolding {
  ticker: string;
  quantity: number;
  current_price: number;
  value_usd: number;
  weight: number;
  cost_basis_eur: number;
  gain_eur: number;
  gain_pct: number;
}

interface AccountWithHoldings {
  account: {
    id: number;
    name: string;
    account_type: string;
    bank: string;
    created_at: string;
  };
  holdings: PortfolioHolding[];
  total_value_eur: number;
}

interface PortfolioData {
  accounts: AccountWithHoldings[];
  total_value_eur: number;
}

interface GraphDownload {
  id: number;
  graph_type: string;
  downloaded_at: string;
}

interface StockView {
  stock_ticker: string;
  total_views: number;
  total_time_seconds: number;
}


const fetchUserDetail = async (userId: string): Promise<UserData> => {
  const response = await axios.get(`/api/admin/users/${userId}`);
  return response.data.user;
};

const fetchUserActivity = async (userId: string): Promise<DailyActivity[]> => {
  const response = await axios.get(`/api/admin/users/${userId}/activity`);
  return response.data.activity;
};

const fetchUserWatchlist = async (userId: string): Promise<string[]> => {
  const response = await axios.get(`/api/admin/users/${userId}/watchlist`);
  return response.data.symbols;
};

const fetchUserPortfolio = async (userId: string): Promise<PortfolioData> => {
  const response = await axios.get(`/api/admin/users/${userId}/portfolio`);
  return response.data;
};

const fetchUserGraphDownloads = async (userId: string): Promise<GraphDownload[]> => {
  const response = await axios.get(`/api/admin/users/${userId}/graph-downloads`);
  return response.data.downloads;
};

const fetchUserStockViews = async (userId: string): Promise<StockView[]> => {
  const response = await axios.get(`/api/admin/users/${userId}/stock-views`);
  return response.data.views;
};

const formatTime = (minutes: number): string => {
  if (minutes >= 60) {
    return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`;
  }
  return `${minutes} min`;
};

export function UserDetailPanel() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user: currentUser, isLoading: authLoading } = useAuth();
  const { language } = useLanguage();

  // Fetch user detail
  const { data: userData, isLoading: userLoading } = useQuery({
    queryKey: ['admin-user-detail', userId],
    queryFn: () => fetchUserDetail(userId!),
    enabled: !!userId && !!currentUser?.is_admin,
  });

  // Fetch user activity
  const { data: activityData, isLoading: activityLoading } = useQuery({
    queryKey: ['admin-user-activity', userId],
    queryFn: () => fetchUserActivity(userId!),
    enabled: !!userId && !!currentUser?.is_admin,
  });

  // Fetch user watchlist
  const { data: watchlistData, isLoading: watchlistLoading } = useQuery({
    queryKey: ['admin-user-watchlist', userId],
    queryFn: () => fetchUserWatchlist(userId!),
    enabled: !!userId && !!currentUser?.is_admin,
  });

  // Fetch user portfolio
  const { data: portfolioData, isLoading: portfolioLoading } = useQuery({
    queryKey: ['admin-user-portfolio', userId],
    queryFn: () => fetchUserPortfolio(userId!),
    enabled: !!userId && !!currentUser?.is_admin,
  });

  // Fetch user graph downloads
  const { data: graphDownloadsData } = useQuery({
    queryKey: ['admin-user-graph-downloads', userId],
    queryFn: () => fetchUserGraphDownloads(userId!),
    enabled: !!userId && !!currentUser?.is_admin,
  });

  // Fetch user stock views
  const { data: stockViewsData } = useQuery({
    queryKey: ['admin-user-stock-views', userId],
    queryFn: () => fetchUserStockViews(userId!),
    enabled: !!userId && !!currentUser?.is_admin,
  });

  // Redirect non-admins
  if (!authLoading && (!currentUser || !currentUser.is_admin)) {
    return <Navigate to="/investing" replace />;
  }

  if (authLoading || userLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-amber-500 animate-spin mb-4" />
        <p className="text-slate-400">{language === 'fr' ? 'Chargement...' : 'Loading...'}</p>
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-slate-400">{language === 'fr' ? 'Utilisateur non trouvé' : 'User not found'}</p>
      </div>
    );
  }

  // Filter activity to last 3 months and fill in missing days
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const rawActivity = activityData?.filter(d => new Date(d.activity_date) >= threeMonthsAgo) || [];

  // Fill in missing days with 0 minutes
  const filteredActivity = (() => {
    if (rawActivity.length === 0) return [];

    // Create a map of existing activity
    const activityMap = new Map(rawActivity.map(d => [d.activity_date, d.minutes]));

    // Find date range (from first activity to today)
    const dates = rawActivity.map(d => new Date(d.activity_date));
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = new Date(); // Today

    // Generate all dates in range
    const filledActivity: DailyActivity[] = [];
    const current = new Date(minDate);
    while (current <= maxDate) {
      const dateStr = current.toISOString().split('T')[0];
      filledActivity.push({
        activity_date: dateStr,
        minutes: activityMap.get(dateStr) || 0
      });
      current.setDate(current.getDate() + 1);
    }

    return filledActivity;
  })();

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Back button */}
      <button
        onClick={() => navigate('/investing/admin')}
        className="flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 mb-6 mt-4"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>{language === 'fr' ? 'Retour' : 'Back'}</span>
      </button>

      <div className="max-w-4xl mx-auto space-y-6">
        {/* User Header */}
        <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center overflow-hidden flex-shrink-0">
              {userData.picture ? (
                <img
                  src={userData.picture}
                  alt={userData.name}
                  className="w-16 h-16 rounded-full object-cover"
                />
              ) : (
                <User className="w-8 h-8 text-slate-400" />
              )}
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {userData.name || 'Unknown'}
              </h1>
              <p className="text-slate-500 dark:text-slate-400">{userData.email}</p>
              <div className="flex items-center gap-4 mt-2 text-sm text-slate-500 dark:text-slate-400">
                <span>
                  {language === 'fr' ? 'Inscrit le' : 'Registered'}{' '}
                  {new Date(userData.created_at).toLocaleDateString(
                    language === 'fr' ? 'fr-FR' : 'en-US',
                    { day: 'numeric', month: 'long', year: 'numeric' }
                  )}
                </span>
                {userData.is_admin === 1 && (
                  <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 rounded text-xs font-medium">
                    Admin
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {formatTime(userData.total_minutes)}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {language === 'fr' ? 'temps total' : 'total time'}
              </p>
            </div>
          </div>
        </div>

        {/* Activity Chart */}
        <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-amber-500" />
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
              {language === 'fr' ? 'Activité (3 derniers mois)' : 'Activity (last 3 months)'}
            </h2>
          </div>
          {activityLoading ? (
            <div className="h-[200px] flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
            </div>
          ) : filteredActivity.length > 0 ? (
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={filteredActivity} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis
                    dataKey="activity_date"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(date) => new Date(date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })}
                    stroke="#cbd5e1"
                  />
                  <YAxis tick={{ fontSize: 11 }} stroke="#cbd5e1" />
                  <Tooltip
                    cursor={false}
                    contentStyle={{ backgroundColor: '#1e293b', borderRadius: '6px', border: '1px solid #334155', padding: '2px 8px', fontSize: '12px' }}
                    labelStyle={{ marginBottom: '-2px', color: '#f1f5f9' }}
                    labelFormatter={(date) => new Date(String(date)).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })}
                    formatter={(value) => {
                      const mins = Number(value);
                      return [formatTime(mins), null];
                    }}
                    separator=""
                  />
                  <Bar dataKey="minutes" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-slate-400 text-center py-8">
              {language === 'fr' ? 'Aucune activité' : 'No activity'}
            </p>
          )}
        </div>

        {/* Portfolio by Account */}
        <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
          <div className="flex items-center gap-2 mb-4">
            <Briefcase className="w-5 h-5 text-green-500" />
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
              {language === 'fr' ? 'Portefeuille' : 'Portfolio'}
            </h2>
            {portfolioData && portfolioData.total_value_eur > 0 && (
              <span className="text-slate-500 dark:text-slate-400 font-normal ml-2">
                (€{portfolioData.total_value_eur?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '0'})
              </span>
            )}
          </div>
          {portfolioLoading ? (
            <div className="h-[100px] flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-green-500" />
            </div>
          ) : portfolioData && portfolioData.accounts.length > 0 ? (
            <div className="space-y-4">
              {portfolioData.accounts.map((accountData) => (
                <div key={accountData.account.id} className="space-y-2">
                  {/* Account Header */}
                  <div className="flex items-center gap-2 px-2">
                    <Wallet className="w-4 h-4 text-purple-500" />
                    <span className="font-medium text-slate-700 dark:text-slate-200">{accountData.account.name}</span>
                    <span className="text-xs text-slate-400">
                      {accountData.account.account_type} • {accountData.account.bank.replace(/_/g, ' ')}
                    </span>
                    {accountData.total_value_eur > 0 && (
                      <span className="ml-auto text-sm text-slate-500 dark:text-slate-400">
                        €{accountData.total_value_eur.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    )}
                  </div>
                  {/* Holdings */}
                  {accountData.holdings.length > 0 ? (
                    <div className="space-y-1 ml-6">
                      {accountData.holdings.map((holding) => {
                        const logoUrl = getCompanyLogoUrl(holding.ticker);
                        return (
                          <div
                            key={holding.ticker}
                            onClick={() => navigate(`/investing/stock/${holding.ticker}`)}
                            className="flex items-center gap-3 bg-slate-100 dark:bg-slate-600 rounded-lg px-4 py-2 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-500 transition-colors"
                          >
                            <div className="w-7 h-7 rounded bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
                              {logoUrl ? (
                                <img
                                  src={logoUrl}
                                  alt={holding.ticker}
                                  className="w-6 h-6 object-contain"
                                  onError={(e) => {
                                    const parent = e.currentTarget.parentElement;
                                    if (parent) {
                                      parent.innerHTML = `<span class="text-xs font-bold text-slate-400">${holding.ticker.slice(0, 2)}</span>`;
                                    }
                                  }}
                                />
                              ) : (
                                <span className="text-xs font-bold text-slate-400">{holding.ticker.slice(0, 2)}</span>
                              )}
                            </div>
                            <span className="font-bold text-slate-800 dark:text-slate-100 w-14 text-sm">{holding.ticker}</span>
                            <span className="text-slate-500 dark:text-slate-400 text-xs">{holding.quantity} shares</span>
                            <span className="ml-auto text-slate-800 dark:text-slate-100 font-medium text-sm">
                              €{(accountData.total_value_eur * (holding.weight / 100)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </span>
                            <span className={`text-xs font-medium w-14 text-right ${holding.gain_pct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {holding.gain_pct >= 0 ? '+' : ''}{holding.gain_pct.toFixed(1)}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-slate-400 text-sm ml-6 py-2">
                      {language === 'fr' ? 'Aucune position' : 'No holdings'}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-400 text-center py-8">
              {language === 'fr' ? 'Aucun compte' : 'No accounts'}
            </p>
          )}
        </div>

        {/* Watchlist */}
        <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
          <div className="flex items-center gap-2 mb-4">
            <Eye className="w-5 h-5 text-blue-500" />
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
              Watchlist
            </h2>
            {watchlistData && watchlistData.length > 0 && (
              <span className="text-slate-500 dark:text-slate-400 font-normal ml-2">
                ({watchlistData.length})
              </span>
            )}
          </div>
          {watchlistLoading ? (
            <div className="h-[60px] flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          ) : watchlistData && watchlistData.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {watchlistData.map((ticker) => {
                const logoUrl = getCompanyLogoUrl(ticker);
                const stock = findStockByTicker(ticker);
                const companyName = stock?.name || ticker;
                return (
                  <div
                    key={ticker}
                    className="group relative flex items-center gap-2 bg-slate-100 dark:bg-slate-600 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-500 transition-colors"
                    onClick={() => navigate(`/investing/stock/${ticker}`)}
                  >
                    {/* Tooltip */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
                      {companyName}
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
                    </div>
                    <div className="w-5 h-5 rounded bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
                      {logoUrl ? (
                        <img
                          src={logoUrl}
                          alt={ticker}
                          className="w-4 h-4 object-contain"
                          onError={(e) => {
                            const parent = e.currentTarget.parentElement;
                            if (parent) {
                              parent.innerHTML = `<span class="text-[8px] font-bold text-slate-400">${ticker.slice(0, 2)}</span>`;
                            }
                          }}
                        />
                      ) : (
                        <span className="text-[8px] font-bold text-slate-400">{ticker.slice(0, 2)}</span>
                      )}
                    </div>
                    <span className="font-medium text-sm text-slate-800 dark:text-slate-100">{ticker}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-slate-400 text-center py-4">
              {language === 'fr' ? 'Watchlist vide' : 'Empty watchlist'}
            </p>
          )}
        </div>

        {/* Graph Downloads */}
        <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
          <div className="flex items-center gap-2 mb-4">
            <Download className="w-5 h-5 text-slate-600 dark:text-slate-300" />
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
              {language === 'fr' ? 'Téléchargements' : 'Downloads'}
              {graphDownloadsData && graphDownloadsData.length > 0 && (
                <span className="text-slate-500 dark:text-slate-400 font-normal ml-2">
                  ({graphDownloadsData.length})
                </span>
              )}
            </h3>
          </div>
          {graphDownloadsData && graphDownloadsData.length > 0 ? (
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {graphDownloadsData.map((download) => (
                <div
                  key={download.id}
                  className="flex items-center justify-between py-2 px-3 bg-slate-100 dark:bg-slate-600 rounded-lg"
                >
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {download.graph_type === 'performance'
                      ? (language === 'fr' ? 'Performance' : 'Performance')
                      : download.graph_type === 'composition'
                      ? (language === 'fr' ? 'Composition' : 'Composition')
                      : download.graph_type}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {new Date(download.downloaded_at).toLocaleDateString(
                      language === 'fr' ? 'fr-FR' : 'en-US',
                      { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
                    )}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-400 text-center py-4">
              {language === 'fr' ? 'Aucun téléchargement' : 'No downloads'}
            </p>
          )}
        </div>

        {/* Stock Searches */}
        <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
          <div className="flex items-center gap-2 mb-4">
            <Search className="w-5 h-5 text-purple-500" />
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
              {language === 'fr' ? 'Recherches de stocks' : 'Stock Searches'}
              {stockViewsData && stockViewsData.length > 0 && (
                <span className="text-slate-500 dark:text-slate-400 font-normal ml-2">
                  ({stockViewsData.length})
                </span>
              )}
            </h3>
          </div>
          {stockViewsData && stockViewsData.length > 0 ? (
            <div className="overflow-x-auto max-h-[250px] overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-700">
                  <tr className="text-left text-slate-600 dark:text-slate-300 text-sm border-b border-slate-300 dark:border-slate-500">
                    <th className="pb-2 pl-2">Ticker</th>
                    <th className="pb-2 text-center">{language === 'fr' ? 'Vues' : 'Views'}</th>
                    <th className="pb-2 text-center">{language === 'fr' ? 'Temps' : 'Time'}</th>
                  </tr>
                </thead>
                <tbody>
                  {stockViewsData.map((view) => {
                    const logoUrl = getCompanyLogoUrl(view.stock_ticker);
                    return (
                      <tr
                        key={view.stock_ticker}
                        className="border-b border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 cursor-pointer"
                        onClick={() => navigate(`/investing/stock/${view.stock_ticker}`)}
                      >
                        <td className="py-2 pl-2">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
                              {logoUrl ? (
                                <img
                                  src={logoUrl}
                                  alt={view.stock_ticker}
                                  className="w-5 h-5 object-contain"
                                  onError={(e) => {
                                    const parent = e.currentTarget.parentElement;
                                    if (parent) {
                                      parent.innerHTML = `<span class="text-[8px] font-bold text-slate-400">${view.stock_ticker.slice(0, 2)}</span>`;
                                    }
                                  }}
                                />
                              ) : (
                                <span className="text-[8px] font-bold text-slate-400">{view.stock_ticker.slice(0, 2)}</span>
                              )}
                            </div>
                            <span className="font-medium text-slate-800 dark:text-slate-100">{view.stock_ticker}</span>
                          </div>
                        </td>
                        <td className="py-2 text-center text-slate-500 dark:text-slate-300">{view.total_views}</td>
                        <td className="py-2 text-center text-slate-500 dark:text-slate-300">
                          {view.total_time_seconds >= 60
                            ? `${Math.floor(view.total_time_seconds / 60)} min`
                            : `${view.total_time_seconds}s`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-slate-400 text-center py-4">
              {language === 'fr' ? 'Aucune recherche' : 'No searches'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
