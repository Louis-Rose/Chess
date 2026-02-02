// Earnings Calendar panel - displays upcoming earnings dates for portfolio holdings and watchlist

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Calendar, Loader2, CheckCircle2, HelpCircle, Briefcase, Eye, ExternalLink, Bell, BellOff, X, Mail } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { PWAInstallPrompt } from '../../../components/PWAInstallPrompt';
import { getCompanyIRUrl } from '../utils/companyIRLinks';

interface AlertPreferences {
  weekly_enabled: boolean;
  days_before_enabled: boolean;
  days_before: number;
}

interface EarningsData {
  ticker: string;
  next_earnings_date: string | null;
  remaining_days: number | null;
  date_confirmed: boolean;
  earnings_time: 'bmo' | 'amc' | null;  // before market open / after market close
  source: 'portfolio' | 'watchlist';
  error?: string;
}

interface EarningsResponse {
  earnings: EarningsData[];
  message?: string;
}

interface Account {
  id: number;
  name: string;
  account_type: string;
  bank: string;
}

type SourceFilter = 'both' | 'portfolio' | 'watchlist';

const fetchEarningsCalendar = async (accountId?: number, sourceFilter: SourceFilter = 'both'): Promise<EarningsResponse> => {
  const params = new URLSearchParams({
    include_portfolio: (sourceFilter === 'both' || sourceFilter === 'portfolio') ? 'true' : 'false',
    include_watchlist: (sourceFilter === 'both' || sourceFilter === 'watchlist') ? 'true' : 'false',
  });
  if (accountId) params.append('account_id', String(accountId));
  const response = await axios.get(`/api/investing/earnings-calendar?${params}`);
  return response.data;
};

const fetchAccounts = async (): Promise<{ accounts: Account[] }> => {
  const response = await axios.get('/api/investing/accounts');
  return response.data;
};

const fetchAlertPreferences = async (): Promise<AlertPreferences> => {
  const response = await axios.get('/api/investing/earnings-alerts');
  return response.data;
};

const saveAlertPreferences = async (prefs: AlertPreferences): Promise<void> => {
  await axios.post('/api/investing/earnings-alerts', prefs);
};

const sendTestEmail = async (): Promise<{ success: boolean; message?: string; error?: string }> => {
  const response = await axios.post('/api/investing/earnings-alerts/send-now');
  return response.data;
};

const fetchEarningsWatchlist = async (): Promise<{ symbols: string[] }> => {
  const response = await axios.get('/api/investing/earnings-watchlist');
  return response.data;
};

const addToEarningsWatchlist = async (ticker: string): Promise<void> => {
  await axios.post('/api/investing/earnings-watchlist', { symbol: ticker });
};

const removeFromEarningsWatchlist = async (ticker: string): Promise<void> => {
  await axios.delete(`/api/investing/earnings-watchlist/${ticker}`);
};

// Alert Configuration Modal
function AlertModal({
  isOpen,
  onClose,
  language,
}: {
  isOpen: boolean;
  onClose: () => void;
  language: string;
}) {
  const queryClient = useQueryClient();
  const [weeklyEnabled, setWeeklyEnabled] = useState(true);
  const [daysBeforeEnabled, setDaysBeforeEnabled] = useState(false);
  const [daysBefore, setDaysBefore] = useState(7);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Fetch existing preferences
  const { data: existingPrefs } = useQuery({
    queryKey: ['earnings-alert-preferences'],
    queryFn: fetchAlertPreferences,
    enabled: isOpen,
  });

  // Update local state when preferences are loaded
  useEffect(() => {
    if (existingPrefs) {
      setWeeklyEnabled(existingPrefs.weekly_enabled);
      setDaysBeforeEnabled(existingPrefs.days_before_enabled);
      setDaysBefore(existingPrefs.days_before || 7);
    }
  }, [existingPrefs]);

  const handleSaveAndSend = async () => {
    setIsSaving(true);
    setTestResult(null);

    try {
      // First save preferences
      await saveAlertPreferences({
        weekly_enabled: weeklyEnabled,
        days_before_enabled: daysBeforeEnabled,
        days_before: daysBefore,
      });
      queryClient.invalidateQueries({ queryKey: ['earnings-alert-preferences'] });

      // Then send test email
      const result = await sendTestEmail();
      setSaveSuccess(true);
      setTestResult({ success: true, message: result.message || 'Email sent!' });

      setTimeout(() => {
        setSaveSuccess(false);
        setTestResult(null);
        onClose();
      }, 2000);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      setTestResult({ success: false, message: err.response?.data?.error || 'Failed to send email' });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <Bell className="w-5 h-5 text-green-600" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {language === 'fr' ? 'Alertes par Email' : 'Email Alerts'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-5">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {language === 'fr'
              ? 'Recevez des alertes par email pour les prochaines publications de résultats.'
              : 'Receive email alerts for upcoming earnings releases.'}
          </p>

          {/* Alert Type Selection */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {language === 'fr' ? 'Types d\'alerte' : 'Alert Types'}
            </label>

            {/* Weekly Option */}
            <label
              className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                weeklyEnabled
                  ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                  : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
              }`}
            >
              <input
                type="checkbox"
                checked={weeklyEnabled}
                onChange={(e) => setWeeklyEnabled(e.target.checked)}
                className="mt-1 w-4 h-4 text-green-600 focus:ring-green-500 rounded"
              />
              <div>
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {language === 'fr' ? 'Résumé hebdomadaire' : 'Weekly Summary'}
                </span>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  {language === 'fr'
                    ? 'Recevez un email chaque lundi à 9h avec les résultats de la semaine.'
                    : 'Get an email every Monday at 9 AM with the week\'s earnings.'}
                </p>
              </div>
            </label>

            {/* Days Before Option */}
            <label
              className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                daysBeforeEnabled
                  ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                  : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
              }`}
            >
              <input
                type="checkbox"
                checked={daysBeforeEnabled}
                onChange={(e) => setDaysBeforeEnabled(e.target.checked)}
                className="mt-1 w-4 h-4 text-green-600 focus:ring-green-500 rounded"
              />
              <div className="flex-1">
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {language === 'fr' ? 'X jours avant' : 'X Days Before'}
                </span>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  {language === 'fr'
                    ? 'Recevez une alerte X jours avant chaque publication (à 9h).'
                    : 'Get an alert X days before each earnings release (at 9 AM).'}
                </p>
                {daysBeforeEnabled && (
                  <div className="mt-3 flex items-center gap-3">
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={daysBefore}
                      onChange={(e) => setDaysBefore(Math.min(30, Math.max(1, parseInt(e.target.value) || 7)))}
                      className="w-20 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-center font-medium focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      {language === 'fr' ? 'jours avant' : 'days before'}
                    </span>
                  </div>
                )}
              </div>
            </label>
          </div>

          {/* Test Result Message */}
          {testResult && (
            <div className={`p-3 rounded-lg text-sm ${testResult.success ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
              {testResult.message}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            {language === 'fr' ? 'Annuler' : 'Cancel'}
          </button>
          <button
            onClick={handleSaveAndSend}
            disabled={isSaving || (!weeklyEnabled && !daysBeforeEnabled)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saveSuccess ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <Mail className="w-4 h-4" />
            )}
            {saveSuccess
              ? (language === 'fr' ? 'Envoyé !' : 'Sent!')
              : (language === 'fr' ? 'Enregistrer et envoyer' : 'Save & Send now')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function EarningsCalendarPanel() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { language } = useLanguage();
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('portfolio');

  // Sync account selection with Portfolio panel via localStorage
  const [selectedAccountId, setSelectedAccountId] = useState<number | undefined>(() => {
    const saved = localStorage.getItem('selectedAccountId');
    if (saved === 'none' || !saved) return undefined;
    const parsed = parseInt(saved, 10);
    return isNaN(parsed) ? undefined : parsed;
  });

  // Fetch accounts
  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: fetchAccounts,
    enabled: isAuthenticated,
  });
  const accounts = accountsData?.accounts || [];

  // Listen for localStorage changes from other tabs/panels
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'selectedAccountId') {
        if (e.newValue === 'none' || !e.newValue) {
          setSelectedAccountId(undefined);
        } else {
          const parsed = parseInt(e.newValue, 10);
          setSelectedAccountId(isNaN(parsed) ? undefined : parsed);
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Auto-select first account if none selected
  useEffect(() => {
    if (accounts.length > 0 && selectedAccountId === undefined) {
      const saved = localStorage.getItem('selectedAccountId');
      if (saved && saved !== 'none') {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && accounts.find(a => a.id === parsed)) {
          setSelectedAccountId(parsed);
          return;
        }
      }
      setSelectedAccountId(accounts[0].id);
    }
  }, [accounts, selectedAccountId]);

  // Sync to localStorage when account changes
  useEffect(() => {
    if (selectedAccountId === undefined) {
      localStorage.setItem('selectedAccountId', 'none');
    } else {
      localStorage.setItem('selectedAccountId', String(selectedAccountId));
    }
  }, [selectedAccountId]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['earnings-calendar', selectedAccountId, sourceFilter],
    queryFn: () => fetchEarningsCalendar(selectedAccountId, sourceFilter),
    enabled: isAuthenticated && (sourceFilter === 'watchlist' || selectedAccountId !== undefined),
    staleTime: 1000 * 60 * 30, // Cache for 30 minutes
  });

  // Fetch alert preferences to show current status
  const { data: alertPrefs } = useQuery({
    queryKey: ['earnings-alert-preferences'],
    queryFn: fetchAlertPreferences,
    enabled: isAuthenticated,
  });

  // Fetch earnings alert watchlist
  const queryClient = useQueryClient();
  const { data: earningsWatchlistData } = useQuery({
    queryKey: ['earnings-watchlist'],
    queryFn: fetchEarningsWatchlist,
    enabled: isAuthenticated,
  });
  const earningsWatchlist = earningsWatchlistData?.symbols || [];

  // Toggle alert for a ticker
  const handleToggleAlert = async (ticker: string) => {
    try {
      if (earningsWatchlist.includes(ticker)) {
        await removeFromEarningsWatchlist(ticker);
      } else {
        await addToEarningsWatchlist(ticker);
      }
      queryClient.invalidateQueries({ queryKey: ['earnings-watchlist'] });
    } catch (error) {
      console.error('Failed to toggle alert:', error);
    }
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
    // Show exact same view as authenticated users with mock data (it's blurred anyway)
    return (
      <div>
        {/* Header - same as authenticated */}
        <div className="md:sticky md:top-0 z-20 bg-slate-200 dark:bg-slate-800 py-4 md:-mx-4 md:px-4 mt-8">
          <div className="flex flex-col items-center gap-2">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              {language === 'fr' ? 'Calendrier des R\u00e9sultats' : 'Earnings Calendar'}
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-lg italic">
              {language === 'fr' ? 'Prochaines publications de r\u00e9sultats' : 'Upcoming earnings releases'}
            </p>

            {/* Source filter tabs - same as authenticated */}
            <div className="flex justify-center gap-1 mt-4 bg-slate-100 dark:bg-slate-600 rounded-lg p-1">
              <div className="px-3 py-1.5 rounded-md text-sm font-medium bg-white dark:bg-slate-700 text-green-600 shadow-sm flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5" />
                {language === 'fr' ? 'Portefeuille' : 'Portfolio'}
              </div>
              <div className="px-3 py-1.5 rounded-md text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" />
                Watchlist
              </div>
              <div className="px-3 py-1.5 rounded-md text-sm font-medium text-slate-500 dark:text-slate-400">
                {language === 'fr' ? 'Tout' : 'Both'}
              </div>
            </div>

            {/* Account selector - same as authenticated */}
            <div className="flex flex-wrap justify-center gap-2 mt-3">
              <div className="px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white shadow-md">PEA Boursorama</div>
              <div className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-300">CTO Trade Republic</div>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto mt-8 space-y-6">
          {/* Earnings table - same structure as authenticated */}
          <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-slate-600 dark:text-slate-300 text-sm border-b-2 border-slate-300 dark:border-slate-500">
                    <th className="pb-3 pl-2 font-semibold">Ticker</th>
                    <th className="pb-3 font-semibold">{language === 'fr' ? 'Date' : 'Date'}</th>
                    <th className="pb-3 text-center font-semibold hidden sm:table-cell">{language === 'fr' ? 'Jours' : 'Days'}</th>
                    <th className="pb-3 text-center font-semibold">{language === 'fr' ? 'Conf.' : 'Conf.'}</th>
                    <th className="pb-3 text-center font-semibold"><Bell className="w-4 h-4 mx-auto" /></th>
                    <th className="pb-3 text-center font-semibold">IR</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { ticker: 'AAPL', date: 'Jan 30, 2026', days: 9, confirmed: true },
                    { ticker: 'MSFT', date: 'Jan 28, 2026', days: 7, confirmed: true },
                    { ticker: 'NVDA', date: 'Feb 19, 2026', days: 29, confirmed: true },
                    { ticker: 'MC.PA', date: 'Jan 27, 2026', days: 6, confirmed: false },
                    { ticker: 'OR.PA', date: 'Feb 6, 2026', days: 16, confirmed: false },
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
                      <td className="py-4 text-center">
                        {item.confirmed ? (
                          <CheckCircle2 className="w-5 h-5 text-green-500 mx-auto" />
                        ) : (
                          <HelpCircle className="w-5 h-5 text-amber-500 mx-auto" />
                        )}
                      </td>
                      <td className="py-4 text-center">
                        <Bell className="w-5 h-5 text-slate-400 mx-auto" />
                      </td>
                      <td className="py-4 text-center">
                        <ExternalLink className="w-4 h-4 text-slate-400 mx-auto" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
            {language === 'fr' ? 'Calendrier des Résultats' : 'Earnings Calendar'}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-lg italic">
            {language === 'fr'
              ? 'Prochaines publications de résultats'
              : 'Upcoming earnings releases'}
          </p>
          <PWAInstallPrompt className="max-w-md w-full mt-2" />

          {/* Source filter tabs */}
          <div className="flex justify-center gap-1 mt-4 bg-slate-100 dark:bg-slate-600 rounded-lg p-1">
            <button
              onClick={() => setSourceFilter('portfolio')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${
                sourceFilter === 'portfolio'
                  ? 'bg-white dark:bg-slate-700 text-green-600 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <Briefcase className="w-3.5 h-3.5" />
              {language === 'fr' ? 'Portefeuille' : 'Portfolio'}
            </button>
            <button
              onClick={() => setSourceFilter('watchlist')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${
                sourceFilter === 'watchlist'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              Watchlist
            </button>
            <button
              onClick={() => setSourceFilter('both')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                sourceFilter === 'both'
                  ? 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              {language === 'fr' ? 'Tout' : 'Both'}
            </button>
          </div>

          {/* Account selector tabs - only show when portfolio is included */}
          {accounts.length > 0 && sourceFilter !== 'watchlist' && (
            <div className="flex flex-wrap justify-center gap-2 mt-3">
              {accounts.map((account) => {
                const isSelected = selectedAccountId === account.id;
                return (
                  <button
                    key={account.id}
                    onClick={() => setSelectedAccountId(account.id)}
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
          <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-700">
                  <tr className="text-left text-slate-600 dark:text-slate-300 text-sm border-b-2 border-slate-300 dark:border-slate-500">
                    <th className="pb-3 pl-2 font-semibold">Ticker</th>
                    <th className="pb-3 font-semibold">
                      {language === 'fr' ? 'Date' : 'Date'}
                    </th>
                    <th className="pb-3 text-center font-semibold hidden sm:table-cell">
                      {language === 'fr' ? 'Jours' : 'Days'}
                    </th>
                    <th className="pb-3 text-center font-semibold">
                      <span className="hidden sm:inline">{language === 'fr' ? 'Confirmé' : 'Confirmed'}</span>
                      <span className="sm:hidden">{language === 'fr' ? 'Conf.' : 'Conf.'}</span>
                    </th>
                    <th className="pb-3 text-center font-semibold">
                      <span className="hidden sm:inline">{language === 'fr' ? 'Alertes' : 'Alerts'}</span>
                      <Bell className="w-4 h-4 mx-auto sm:hidden" />
                    </th>
                    <th className="pb-3 text-center font-semibold">
                      <span className="hidden sm:inline">IR</span>
                      <span className="sm:hidden">IR</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.earnings.map((item) => (
                    <tr
                      key={item.ticker}
                      className="border-b border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
                    >
                      <td className="py-4 pl-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 dark:text-slate-100">{item.ticker}</span>
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
                          <div className="flex items-center gap-2">
                            <span className="text-slate-700 dark:text-slate-200">
                              <span className="hidden sm:inline">
                                {new Date(item.next_earnings_date).toLocaleDateString(
                                  language === 'fr' ? 'fr-FR' : 'en-US',
                                  { day: 'numeric', month: 'long', year: 'numeric' }
                                )}
                              </span>
                              <span className="sm:hidden">
                                {new Date(item.next_earnings_date).toLocaleDateString(
                                  language === 'fr' ? 'fr-FR' : 'en-US',
                                  { day: 'numeric', month: 'short' }
                                )}
                              </span>
                            </span>
                            {item.earnings_time && (
                              <span
                                className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                                  item.earnings_time === 'bmo'
                                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                    : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'
                                }`}
                                title={item.earnings_time === 'bmo'
                                  ? (language === 'fr' ? 'Avant ouverture' : 'Before Market Open')
                                  : (language === 'fr' ? 'Après clôture' : 'After Market Close')
                                }
                              >
                                {item.earnings_time.toUpperCase()}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">N/A</span>
                        )}
                      </td>
                      <td className="py-4 text-center hidden sm:table-cell">
                        {item.remaining_days !== null ? (
                          <span className="inline-flex items-center justify-center min-w-[3rem] px-2 py-1 rounded-full text-sm font-medium bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200">
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
                      <td className="py-4 text-center">
                        <button
                          onClick={() => handleToggleAlert(item.ticker)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            earningsWatchlist.includes(item.ticker)
                              ? 'bg-green-100 text-green-600 hover:bg-green-200'
                              : 'bg-slate-100 dark:bg-slate-600 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-500'
                          }`}
                          title={earningsWatchlist.includes(item.ticker)
                            ? (language === 'fr' ? 'Retirer des alertes' : 'Remove from alerts')
                            : (language === 'fr' ? 'Ajouter aux alertes' : 'Add to alerts')
                          }
                        >
                          {earningsWatchlist.includes(item.ticker) ? (
                            <Bell className="w-4 h-4" />
                          ) : (
                            <BellOff className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                      <td className="py-4 text-center">
                        {(() => {
                          const irUrl = getCompanyIRUrl(item.ticker);
                          return irUrl ? (
                            <a
                              href={irUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center w-8 h-8 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-lg transition-colors"
                              title={language === 'fr' ? 'Relations Investisseurs' : 'Investor Relations'}
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          ) : (
                            <span className="text-slate-400">-</span>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-600 rounded-lg">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-300">
                <span className="inline-flex items-center gap-1">
                  <Briefcase className="w-4 h-4 text-green-600" />
                  {language === 'fr' ? 'Portefeuille' : 'Portfolio'}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Eye className="w-4 h-4 text-blue-600" />
                  Watchlist
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">BMO</span>
                  {language === 'fr' ? 'Avant ouverture' : 'Before Market Open'}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">AMC</span>
                  {language === 'fr' ? 'Après clôture' : 'After Market Close'}
                </span>
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  {language === 'fr' ? 'Confirmé' : 'Confirmed'}
                </span>
                <span className="inline-flex items-center gap-1">
                  <HelpCircle className="w-4 h-4 text-slate-400" />
                  {language === 'fr' ? 'Estimé' : 'Estimated'}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Bell className="w-4 h-4 text-green-600" />
                  {language === 'fr' ? 'Alertes mail activées' : 'Mail alerts enabled'}
                  {earningsWatchlist.length > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 bg-green-600 text-white rounded-full text-xs font-medium">
                      {earningsWatchlist.length}
                    </span>
                  )}
                </span>
              </div>
            </div>

            <div className="mt-6 flex flex-col items-center gap-3">
              <button
                onClick={() => setIsAlertModalOpen(true)}
                className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
              >
                <Bell className="w-5 h-5" />
                {language === 'fr' ? 'Recevoir des alertes mail' : 'Get mail alerts'}
              </button>
              {(alertPrefs?.weekly_enabled || alertPrefs?.days_before_enabled) && (
                <div className="text-sm text-green-600 dark:text-green-400 flex flex-col items-center gap-1">
                  {alertPrefs.weekly_enabled && (
                    <p className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      {language === 'fr' ? 'Résumé hebdomadaire activé' : 'Weekly summary enabled'}
                    </p>
                  )}
                  {alertPrefs.days_before_enabled && (
                    <p className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      {language === 'fr'
                        ? `Alerte ${alertPrefs.days_before} jours avant activée`
                        : `${alertPrefs.days_before}-day reminder enabled`}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Alert Configuration Modal */}
            <AlertModal
              isOpen={isAlertModalOpen}
              onClose={() => setIsAlertModalOpen(false)}
              language={language}
            />
          </div>
        ) : (
          <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-12 text-center shadow-sm dark:shadow-none">
            <Calendar className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-600 dark:text-slate-300 text-lg mb-2">
              {language === 'fr'
                ? 'Aucune action à suivre'
                : 'No stocks to track'}
            </p>
            <p className="text-slate-400">
              {language === 'fr'
                ? 'Ajoutez des actions à votre portefeuille ou watchlist.'
                : 'Add stocks to your portfolio or watchlist.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
