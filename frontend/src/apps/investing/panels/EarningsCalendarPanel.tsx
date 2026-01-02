// Earnings Calendar panel - displays upcoming earnings dates for portfolio holdings and watchlist

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Calendar, Loader2, CheckCircle2, HelpCircle, Briefcase, Eye } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { LoginButton } from '../../../components/LoginButton';

interface EarningsData {
  ticker: string;
  next_earnings_date: string | null;
  remaining_days: number | null;
  date_confirmed: boolean;
  source: 'portfolio' | 'watchlist';
  error?: string;
}

interface EarningsResponse {
  earnings: EarningsData[];
  message?: string;
}

const fetchEarningsCalendar = async (includePortfolio: boolean, includeWatchlist: boolean): Promise<EarningsResponse> => {
  const response = await axios.get(`/api/investing/earnings-calendar?include_portfolio=${includePortfolio}&include_watchlist=${includeWatchlist}`);
  return response.data;
};

export function EarningsCalendarPanel() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { language } = useLanguage();

  const [includePortfolio, setIncludePortfolio] = useState(true);
  const [includeWatchlist, setIncludeWatchlist] = useState(true);

  const { data, isLoading, error } = useQuery({
    queryKey: ['earnings-calendar', includePortfolio, includeWatchlist],
    queryFn: () => fetchEarningsCalendar(includePortfolio, includeWatchlist),
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 30, // Cache for 30 minutes
  });

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-green-500 animate-spin mb-4" />
        <p className="text-slate-400">{language === 'fr' ? 'Chargement...' : 'Loading...'}</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex flex-col items-center justify-center py-20">
          <Calendar className="w-16 h-16 text-slate-500 mb-4" />
          <h2 className="text-2xl font-bold text-slate-300 mb-2">
            {language === 'fr' ? 'Connexion requise' : 'Sign In Required'}
          </h2>
          <p className="text-slate-500 mb-6">
            {language === 'fr'
              ? 'Connectez-vous pour voir le calendrier des résultats.'
              : 'Please sign in to view the earnings calendar.'}
          </p>
          <LoginButton />
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="sticky top-0 z-20 bg-slate-800 py-4 -mx-4 px-4 mt-8">
        <div className="flex flex-col items-center gap-2">
          <h2 className="text-3xl font-bold text-slate-100">
            {language === 'fr' ? 'Calendrier des Résultats' : 'Earnings Calendar'}
          </h2>
          <p className="text-slate-400 text-lg italic">
            {language === 'fr'
              ? 'Prochaines publications de résultats'
              : 'Upcoming earnings releases'}
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto mt-8 space-y-6">
        {/* Controls: Portfolio and Watchlist toggles */}
        <div className="bg-slate-100 rounded-xl p-6">
          <div className="flex flex-wrap gap-6 items-center justify-center">
            {/* Portfolio toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includePortfolio}
                onChange={(e) => setIncludePortfolio(e.target.checked)}
                className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
              />
              <span className="text-sm text-slate-600 flex items-center gap-1">
                <Briefcase className="w-4 h-4" />
                {language === 'fr' ? 'Inclure portefeuille' : 'Include portfolio'}
              </span>
            </label>

            {/* Watchlist toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeWatchlist}
                onChange={(e) => setIncludeWatchlist(e.target.checked)}
                className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
              />
              <span className="text-sm text-slate-600 flex items-center gap-1">
                <Eye className="w-4 h-4" />
                {language === 'fr' ? 'Inclure watchlist' : 'Include watchlist'}
              </span>
            </label>
          </div>
        </div>

        {/* Earnings table */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-green-500 animate-spin mb-4" />
            <p className="text-slate-400">
              {language === 'fr' ? 'Récupération des dates...' : 'Fetching earnings dates...'}
            </p>
          </div>
        ) : error ? (
          <div className="bg-red-900/20 border border-red-700 rounded-xl p-6 text-center">
            <p className="text-red-400">
              {language === 'fr' ? 'Erreur lors du chargement' : 'Error loading data'}
            </p>
          </div>
        ) : data?.earnings && data.earnings.length > 0 ? (
          <div className="bg-slate-100 rounded-xl p-6">
            <div className="overflow-x-auto">
              <table className="w-full table-fixed">
                <thead>
                  <tr className="text-left text-slate-600 text-sm border-b-2 border-slate-300">
                    <th className="pb-3 pl-2 font-semibold w-1/4">Ticker</th>
                    <th className="pb-3 font-semibold w-1/4">
                      {language === 'fr' ? 'Date' : 'Date'}
                    </th>
                    <th className="pb-3 text-center font-semibold w-1/4">
                      {language === 'fr' ? 'Jours restants' : 'Remaining'}
                    </th>
                    <th className="pb-3 text-center font-semibold w-1/4">
                      {language === 'fr' ? 'Confirmé' : 'Confirmed'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.earnings.map((item) => (
                    <tr
                      key={item.ticker}
                      className="border-b border-slate-200 hover:bg-slate-50 transition-colors"
                    >
                      <td className="py-4 pl-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800">{item.ticker}</span>
                          {item.source === 'portfolio' ? (
                            <span title={language === 'fr' ? 'Portefeuille' : 'Portfolio'}>
                              <Briefcase className="w-3 h-3 text-green-600" />
                            </span>
                          ) : (
                            <span title="Watchlist">
                              <Eye className="w-3 h-3 text-blue-600" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4">
                        {item.next_earnings_date ? (
                          <span className="text-slate-700">
                            {new Date(item.next_earnings_date).toLocaleDateString(
                              language === 'fr' ? 'fr-FR' : 'en-US',
                              { day: 'numeric', month: 'long', year: 'numeric' }
                            )}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">
                            {language === 'fr' ? 'N/A' : 'N/A'}
                          </span>
                        )}
                      </td>
                      <td className="py-4 text-center">
                        {item.remaining_days !== null ? (
                          <span className="inline-flex items-center justify-center min-w-[3rem] px-2 py-1 rounded-full text-sm font-medium bg-slate-200 text-slate-700">
                            {item.remaining_days}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-4 text-center">
                        {item.date_confirmed ? (
                          <CheckCircle2 className="w-5 h-5 text-green-600 mx-auto" />
                        ) : (
                          <HelpCircle className="w-5 h-5 text-slate-400 mx-auto" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 p-4 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-500">
                <span className="font-medium text-slate-600">
                  {language === 'fr' ? 'Légende : ' : 'Legend: '}
                </span>
                <Briefcase className="w-4 h-4 text-green-600 inline-block mx-1" />
                {language === 'fr' ? 'Portefeuille' : 'Portfolio'}
                {' • '}
                <Eye className="w-4 h-4 text-blue-600 inline-block mx-1" />
                {language === 'fr' ? 'Watchlist' : 'Watchlist'}
                {' • '}
                <CheckCircle2 className="w-4 h-4 text-green-600 inline-block mx-1" />
                {language === 'fr' ? 'Date confirmée' : 'Confirmed'}
                {' • '}
                <HelpCircle className="w-4 h-4 text-slate-400 inline-block mx-1" />
                {language === 'fr' ? 'Date estimée' : 'Estimated'}
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-slate-100 rounded-xl p-12 text-center">
            <Calendar className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-600 text-lg mb-2">
              {language === 'fr'
                ? 'Aucune action à suivre'
                : 'No stocks to track'}
            </p>
            <p className="text-slate-400">
              {language === 'fr'
                ? 'Activez le portefeuille ou la watchlist ci-dessus.'
                : 'Enable portfolio or watchlist tracking above.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
