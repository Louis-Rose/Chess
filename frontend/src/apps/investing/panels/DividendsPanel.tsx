// Dividends panel - displays upcoming dividend dates for portfolio holdings

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { DollarSign, Loader2, Briefcase, CheckCircle2, HelpCircle } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { PWAInstallPrompt } from '../../../components/PWAInstallPrompt';
import { getCompanyLogoUrl } from '../utils/companyLogos';

interface DividendData {
  ticker: string;
  ex_dividend_date: string | null;
  payment_date: string | null;
  remaining_days: number | null;
  dividend_amount: number | null;
  dividend_yield: number | null;
  frequency: string | null;
  confirmed: boolean;
  pays_dividends?: boolean;
  quantity?: number;
  total_dividend?: number | null;
}

interface DividendsResponse {
  dividends: DividendData[];
}

interface Account {
  id: number;
  name: string;
  account_type: string;
  bank: string;
}

const fetchDividends = async (accountIds: number[]): Promise<DividendsResponse> => {
  const params = accountIds.length > 0 ? `?account_ids=${accountIds.join(',')}` : '';
  const response = await axios.get(`/api/investing/dividends-calendar${params}`);
  return response.data;
};

const fetchAccounts = async (): Promise<{ accounts: Account[] }> => {
  const response = await axios.get('/api/investing/accounts');
  return response.data;
};

export function DividendsPanel() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { language } = useLanguage();

  // Sync account selection with Portfolio panel via localStorage
  const [selectedAccountIds, setSelectedAccountIds] = useState<number[]>(() => {
    const saved = localStorage.getItem('selectedAccountIds');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [];
  });

  // Fetch accounts
  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: fetchAccounts,
    enabled: isAuthenticated,
  });
  const accounts = accountsData?.accounts || [];

  // Listen for localStorage changes
  useEffect(() => {
    const syncFromStorage = () => {
      const saved = localStorage.getItem('selectedAccountIds');
      if (saved) {
        try {
          setSelectedAccountIds(JSON.parse(saved));
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('focus', syncFromStorage);
    window.addEventListener('storage', syncFromStorage);
    return () => {
      window.removeEventListener('focus', syncFromStorage);
      window.removeEventListener('storage', syncFromStorage);
    };
  }, []);

  // Auto-select first account if none selected
  useEffect(() => {
    if (accounts.length > 0 && selectedAccountIds.length === 0) {
      const saved = localStorage.getItem('selectedAccountIds');
      if (!saved || saved === '[]') {
        setSelectedAccountIds([accounts[0].id]);
      }
    }
  }, [accounts, selectedAccountIds.length]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['dividends-calendar', selectedAccountIds],
    queryFn: () => fetchDividends(selectedAccountIds),
    enabled: isAuthenticated && selectedAccountIds.length > 0,
    staleTime: 1000 * 60 * 30,
  });

  // Toggle account selection
  const toggleAccount = (id: number) => {
    setSelectedAccountIds(prev => {
      const newIds = prev.includes(id)
        ? prev.filter(x => x !== id)
        : [...prev, id];
      localStorage.setItem('selectedAccountIds', JSON.stringify(newIds));
      return newIds;
    });
  };

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
      <div>
        <div className="md:sticky md:top-0 z-20 bg-slate-200 dark:bg-slate-800 py-4 md:-mx-4 md:px-4 mt-8">
          <div className="flex flex-col items-center gap-2">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              {language === 'fr' ? 'Calendrier des Dividendes' : 'Dividend Calendar'}
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-lg italic">
              {language === 'fr' ? 'Prochains versements de dividendes' : 'Upcoming dividend payments'}
            </p>
          </div>
        </div>
        <div className="max-w-4xl mx-auto mt-8">
          <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6">
            <table className="w-full">
              <thead>
                <tr className="text-left text-slate-600 dark:text-slate-300 text-sm border-b-2 border-slate-300 dark:border-slate-500">
                  <th className="pb-3 pl-2 font-semibold">Ticker</th>
                  <th className="pb-3 font-semibold">{language === 'fr' ? 'Date Ex-Div' : 'Ex-Div Date'}</th>
                  <th className="pb-3 text-center font-semibold hidden sm:table-cell">{language === 'fr' ? 'Jours' : 'Days'}</th>
                  <th className="pb-3 text-right font-semibold">{language === 'fr' ? 'Montant' : 'Amount'}</th>
                  <th className="pb-3 text-right font-semibold hidden sm:table-cell">{language === 'fr' ? 'Rend.' : 'Yield'}</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { ticker: 'AAPL', date: 'Feb 7, 2026', days: 7, amount: 0.25, yield: 0.5 },
                  { ticker: 'MSFT', date: 'Feb 19, 2026', days: 19, amount: 0.83, yield: 0.7 },
                  { ticker: 'JNJ', date: 'Feb 24, 2026', days: 24, amount: 1.24, yield: 3.1 },
                ].map((item) => (
                  <tr key={item.ticker} className="border-b border-slate-200 dark:border-slate-600">
                    <td className="py-4 pl-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800 dark:text-slate-100">{item.ticker}</span>
                        <Briefcase className="w-3.5 h-3.5 text-green-500" />
                      </div>
                    </td>
                    <td className="py-4 text-slate-700 dark:text-slate-300">{item.date}</td>
                    <td className="py-4 text-center hidden sm:table-cell">
                      <span className={item.days <= 7 ? 'text-amber-500 font-medium' : 'text-slate-600 dark:text-slate-400'}>{item.days}</span>
                    </td>
                    <td className="py-4 text-right text-slate-700 dark:text-slate-300">${item.amount.toFixed(2)}</td>
                    <td className="py-4 text-right text-green-600 hidden sm:table-cell">{item.yield.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="md:sticky md:top-0 z-20 bg-slate-200 dark:bg-slate-800 py-4 md:-mx-4 md:px-4 mt-8">
        <div className="flex flex-col items-center gap-2">
          <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
            {language === 'fr' ? 'Calendrier des Dividendes' : 'Dividend Calendar'}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-lg italic">
            {language === 'fr' ? 'Prochains versements de dividendes' : 'Upcoming dividend payments'}
          </p>
          <PWAInstallPrompt className="max-w-md w-full mt-2" />

          {/* Account selector */}
          {accounts.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2 mt-3">
              {accounts.map((account) => {
                const isSelected = selectedAccountIds.includes(account.id);
                return (
                  <button
                    key={account.id}
                    onClick={() => toggleAccount(account.id)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      isSelected
                        ? 'bg-green-600 text-white shadow-md'
                        : 'bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-500'
                    }`}
                  >
                    {account.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto mt-8 space-y-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-green-500 animate-spin mb-4" />
            <p className="text-slate-400">
              {language === 'fr' ? 'Récupération des dividendes...' : 'Fetching dividend data...'}
            </p>
          </div>
        ) : error ? (
          <div className="bg-red-900/20 border border-red-700 rounded-xl p-6 text-center">
            <p className="text-red-400">
              {language === 'fr' ? 'Erreur lors du chargement' : 'Error loading data'}
            </p>
          </div>
        ) : data?.dividends && data.dividends.length > 0 ? (
          <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-700">
                  <tr className="text-left text-slate-600 dark:text-slate-300 text-sm border-b-2 border-slate-300 dark:border-slate-500">
                    <th className="pb-3 pl-2 font-semibold">Ticker</th>
                    <th className="pb-3 font-semibold">
                      {language === 'fr' ? 'Date Ex-Div' : 'Ex-Div Date'}
                    </th>
                    <th className="pb-3 text-center font-semibold hidden sm:table-cell">
                      {language === 'fr' ? 'Jours' : 'Days'}
                    </th>
                    <th className="pb-3 text-center font-semibold">
                      <span className="hidden sm:inline">{language === 'fr' ? 'Confirmé' : 'Confirmed'}</span>
                      <span className="sm:hidden">{language === 'fr' ? 'Conf.' : 'Conf.'}</span>
                    </th>
                    <th className="pb-3 text-right font-semibold">
                      {language === 'fr' ? 'Montant' : 'Amount'}
                    </th>
                    <th className="pb-3 text-right font-semibold hidden sm:table-cell">
                      {language === 'fr' ? 'Rendement' : 'Yield'}
                    </th>
                    <th className="pb-3 text-center font-semibold hidden md:table-cell">
                      {language === 'fr' ? 'Fréq.' : 'Freq.'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.dividends.map((item) => {
                    const logoUrl = getCompanyLogoUrl(item.ticker);
                    const paysDividends = item.pays_dividends !== false;
                    return (
                      <tr
                        key={item.ticker}
                        className={`border-b border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors ${!paysDividends ? 'opacity-60' : ''}`}
                      >
                        <td className="py-4 pl-2">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
                              {logoUrl ? (
                                <img src={logoUrl} alt={item.ticker} className="w-5 h-5 object-contain" />
                              ) : (
                                <span className="text-[8px] font-bold text-slate-500">{item.ticker.slice(0, 2)}</span>
                              )}
                            </div>
                            <span className="font-bold text-slate-800 dark:text-slate-100">{item.ticker}</span>
                          </div>
                        </td>
                        <td className="py-4" colSpan={paysDividends ? 1 : 6}>
                          {paysDividends ? (
                            item.ex_dividend_date ? (
                              <span className="text-slate-700 dark:text-slate-200">
                                <span className="hidden sm:inline">
                                  {new Date(item.ex_dividend_date).toLocaleDateString(
                                    language === 'fr' ? 'fr-FR' : 'en-US',
                                    { day: 'numeric', month: 'long', year: 'numeric' }
                                  )}
                                </span>
                                <span className="sm:hidden">
                                  {new Date(item.ex_dividend_date).toLocaleDateString(
                                    language === 'fr' ? 'fr-FR' : 'en-US',
                                    { day: 'numeric', month: 'short' }
                                  )}
                                </span>
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">N/A</span>
                            )
                          ) : (
                            <span className="text-slate-400 italic">
                              {language === 'fr' ? 'Pas de dividende' : 'No dividend'}
                            </span>
                          )}
                        </td>
                        {paysDividends && (
                          <>
                            <td className="py-4 text-center hidden sm:table-cell">
                              {item.remaining_days !== null ? (
                                <span className={`inline-flex items-center justify-center min-w-[3rem] px-2 py-1 rounded-full text-sm font-medium ${
                                  item.remaining_days <= 7
                                    ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                                    : 'bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200'
                                }`}>
                                  {item.remaining_days}
                                </span>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                            <td className="py-4 text-center">
                              {item.confirmed ? (
                                <CheckCircle2 className="w-5 h-5 text-green-600 mx-auto" />
                              ) : (
                                <HelpCircle className="w-5 h-5 text-slate-400 mx-auto" />
                              )}
                            </td>
                            <td className="py-4 text-right">
                              {item.dividend_amount !== null ? (
                                <span className="text-slate-700 dark:text-slate-200 font-medium">
                                  ${item.dividend_amount.toFixed(2)}
                                </span>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                            <td className="py-4 text-right hidden sm:table-cell">
                              {item.dividend_yield !== null ? (
                                <span className="text-green-600 font-medium">
                                  {item.dividend_yield.toFixed(2)}%
                                </span>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                            <td className="py-4 text-center hidden md:table-cell">
                              {item.frequency ? (
                                <span className="text-xs px-2 py-1 bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 rounded">
                                  {item.frequency}
                                </span>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-600 rounded-lg">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-300">
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  {language === 'fr' ? 'Date confirmée' : 'Confirmed date'}
                </span>
                <span className="inline-flex items-center gap-1">
                  <HelpCircle className="w-4 h-4 text-slate-400" />
                  {language === 'fr' ? 'Date estimée' : 'Estimated date'}
                </span>
                <span className="inline-flex items-center gap-1 opacity-60">
                  <span className="italic">{language === 'fr' ? 'Grisé' : 'Grayed'}</span>
                  = {language === 'fr' ? 'Pas de dividende' : 'No dividend'}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-12 text-center shadow-sm dark:shadow-none">
            <DollarSign className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-600 dark:text-slate-300 text-lg mb-2">
              {language === 'fr'
                ? 'Aucun dividende à venir'
                : 'No upcoming dividends'}
            </p>
            <p className="text-slate-400">
              {language === 'fr'
                ? 'Ajoutez des actions versant des dividendes à votre portefeuille.'
                : 'Add dividend-paying stocks to your portfolio.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
