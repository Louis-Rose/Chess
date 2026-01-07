// Stock view detail panel - shows who searched for a specific stock (admin only)

import { useParams, Navigate, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { ArrowLeft, Loader2, AlertCircle, Users, Eye, Clock } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { getCompanyLogoUrl } from '../utils/companyLogos';

interface StockViewDetail {
  id: number;
  name: string;
  picture: string;
  view_date: string;
  view_count: number;
  time_spent_seconds: number;
  last_viewed_at: string;
}

interface StockViewResponse {
  ticker: string;
  views: StockViewDetail[];
  totals: {
    unique_users: number;
    total_views: number;
    total_time_seconds: number;
  };
}

const fetchStockViewDetail = async (ticker: string): Promise<StockViewResponse> => {
  const response = await axios.get(`/api/admin/stock-views/${ticker}`);
  return response.data;
};

export function StockViewDetailPanel() {
  const { ticker } = useParams<{ ticker: string }>();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const { language } = useLanguage();

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-stock-views', ticker],
    queryFn: () => fetchStockViewDetail(ticker!),
    enabled: !!user?.is_admin && !!ticker,
  });

  // Redirect non-admins
  if (!authLoading && (!user || !user.is_admin)) {
    return <Navigate to="/investing" replace />;
  }

  if (authLoading || isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-green-500 animate-spin mb-4" />
        <p className="text-slate-400">{language === 'fr' ? 'Chargement...' : 'Loading...'}</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="w-10 h-10 text-red-500 mb-4" />
        <p className="text-slate-400">{language === 'fr' ? 'Erreur lors du chargement' : 'Error loading data'}</p>
      </div>
    );
  }

  const formatTime = (seconds: number) => {
    if (seconds >= 60) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return secs > 0 ? `${mins}m ${secs}s` : `${mins} min`;
    }
    return `${seconds}s`;
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="flex flex-col items-center gap-4 mb-6 mt-8">
        <button
          onClick={() => navigate('/investing/admin')}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 self-start"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>{language === 'fr' ? 'Retour' : 'Back'}</span>
        </button>

        <div className="flex items-center gap-4">
          <img
            src={getCompanyLogoUrl(ticker!) || ''}
            alt={ticker}
            className="w-12 h-12 rounded-lg bg-white"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
            {ticker}
          </h2>
        </div>

        {/* Summary stats */}
        <div className="flex items-center gap-6 text-slate-600 dark:text-slate-300">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            <span>{data.totals.unique_users} {language === 'fr' ? 'utilisateurs' : 'users'}</span>
          </div>
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4" />
            <span>{data.totals.total_views} {language === 'fr' ? 'vues' : 'views'}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            <span>{formatTime(data.totals.total_time_seconds || 0)}</span>
          </div>
        </div>
      </div>

      {/* Views Table */}
      <div className="max-w-4xl mx-auto">
        <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4">
            {language === 'fr' ? 'Historique des vues' : 'View History'}
          </h3>

          {data.views.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-slate-600 dark:text-slate-300 text-sm border-b-2 border-slate-300 dark:border-slate-500">
                    <th className="pb-3 pl-2">{language === 'fr' ? 'Utilisateur' : 'User'}</th>
                    <th className="pb-3 text-center">{language === 'fr' ? 'Date' : 'Date'}</th>
                    <th className="pb-3 text-center">{language === 'fr' ? 'Vues' : 'Views'}</th>
                    <th className="pb-3 text-center">{language === 'fr' ? 'Temps' : 'Time'}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.views.map((view, index) => (
                    <tr
                      key={`${view.id}-${view.view_date}-${index}`}
                      className="border-b border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 cursor-pointer"
                      onClick={() => navigate(`/investing/admin/user/${view.id}`)}
                    >
                      <td className="py-3 pl-2">
                        <div className="flex items-center gap-3">
                          {view.picture ? (
                            <img
                              src={view.picture}
                              alt={view.name}
                              className="w-8 h-8 rounded-full bg-white"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-slate-300 dark:bg-slate-500" />
                          )}
                          <span className="font-medium text-slate-800 dark:text-slate-100">
                            {view.name || '-'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 text-center text-sm text-slate-500 dark:text-slate-300">
                        {new Date(view.view_date).toLocaleDateString(
                          language === 'fr' ? 'fr-FR' : 'en-US',
                          { day: 'numeric', month: 'short', year: 'numeric' }
                        )}
                      </td>
                      <td className="py-3 text-center text-slate-500 dark:text-slate-300">
                        {view.view_count}
                      </td>
                      <td className="py-3 text-center text-slate-500 dark:text-slate-300">
                        {formatTime(view.time_spent_seconds || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-slate-500 text-center py-8">
              {language === 'fr' ? 'Aucune vue enregistrée' : 'No views recorded'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
