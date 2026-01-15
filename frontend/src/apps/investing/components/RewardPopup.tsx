// Reward popup for the first user to reach 5 visits

import { useState, useEffect } from 'react';
import { Gift, X, Loader2, Check, ChevronDown } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { getAllStocks, type Stock } from '../utils/allStocks';

export function RewardPopup() {
  const { isAuthenticated } = useAuth();
  const { language } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedStock, setSelectedStock] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [allStocks, setAllStocks] = useState<Stock[]>([]);

  const texts = {
    en: {
      title: 'Congratulations!',
      message: "This is your 5th visit on LUMNA! To thank you for your support, you won a report analysis on the listed company of your choice.",
      selectLabel: 'Choose a company',
      searchPlaceholder: 'Search for a company...',
      submit: 'Claim my reward',
      success: 'Reward claimed! We will contact you soon.',
      error: 'Something went wrong. Please try again.',
      close: 'Close',
    },
    fr: {
      title: 'Félicitations !',
      message: "C'est votre 5ème visite sur LUMNA ! Pour vous remercier de votre soutien, vous avez gagné une analyse détaillée sur la société cotée de votre choix.",
      selectLabel: 'Choisissez une entreprise',
      searchPlaceholder: 'Rechercher une entreprise...',
      submit: 'Réclamer ma récompense',
      success: 'Récompense réclamée ! Nous vous contacterons bientôt.',
      error: 'Une erreur est survenue. Veuillez réessayer.',
      close: 'Fermer',
    },
  };

  const t = texts[language];

  // Load all stocks on mount
  useEffect(() => {
    setAllStocks(getAllStocks());
  }, []);

  // Check eligibility on mount
  useEffect(() => {
    if (!isAuthenticated) return;

    const checkEligibility = async () => {
      try {
        const response = await axios.get('/api/reward/eligibility');
        if (response.data.eligible) {
          setIsOpen(true);
        }
      } catch {
        // Silently fail - user just won't see the popup
      }
    };

    checkEligibility();
  }, [isAuthenticated]);

  const handleSubmit = async () => {
    if (!selectedStock || status === 'submitting') return;

    setStatus('submitting');
    try {
      await axios.post('/api/reward/claim', { company: selectedStock });
      setStatus('success');
      // Close after 3 seconds
      setTimeout(() => {
        setIsOpen(false);
      }, 3000);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  const filteredStocks = allStocks.filter(stock =>
    stock.ticker.toLowerCase().includes(searchQuery.toLowerCase()) ||
    stock.name.toLowerCase().includes(searchQuery.toLowerCase())
  ).slice(0, 50); // Limit results for performance

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-in fade-in duration-200" />

      {/* Modal */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] max-w-[90vw] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-amber-400 to-orange-500">
          <div className="flex items-center gap-3">
            <Gift className="w-6 h-6 text-white" />
            <span className="font-bold text-white text-xl">{t.title}</span>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 rounded-lg hover:bg-white/20 transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {status === 'success' ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-center text-lg font-medium text-slate-800 dark:text-slate-200">
                {t.success}
              </p>
            </div>
          ) : (
            <>
              {/* Message */}
              <p className="text-slate-700 dark:text-slate-300 text-base leading-relaxed mb-6">
                {t.message}
              </p>

              {/* Company Selector */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {t.selectLabel}
                </label>
                <div className="relative">
                  <div
                    className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 cursor-pointer flex items-center justify-between"
                    onClick={() => setShowDropdown(!showDropdown)}
                  >
                    <span className={selectedStock ? 'text-slate-800 dark:text-slate-200 font-medium' : 'text-slate-400'}>
                      {selectedStock || t.searchPlaceholder}
                    </span>
                    <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
                  </div>

                  {showDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl shadow-lg z-10 max-h-60 overflow-hidden">
                      {/* Search input */}
                      <div className="p-2 border-b border-slate-200 dark:border-slate-600">
                        <input
                          type="text"
                          placeholder={t.searchPlaceholder}
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-500 rounded-lg bg-slate-50 dark:bg-slate-600 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                          autoFocus
                        />
                      </div>
                      {/* Stock list */}
                      <div className="max-h-48 overflow-auto">
                        {filteredStocks.map((stock) => (
                          <button
                            key={stock.ticker}
                            type="button"
                            onClick={() => {
                              setSelectedStock(stock.ticker);
                              setShowDropdown(false);
                              setSearchQuery('');
                            }}
                            className="w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-amber-50 dark:hover:bg-slate-600"
                          >
                            <span className="font-bold text-slate-800 dark:text-slate-200 w-16">{stock.ticker}</span>
                            <span className="text-slate-600 dark:text-slate-400 text-sm truncate">{stock.name}</span>
                          </button>
                        ))}
                        {filteredStocks.length === 0 && (
                          <div className="px-4 py-3 text-slate-500 text-center">
                            {language === 'fr' ? 'Aucun résultat' : 'No results'}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Error message */}
              {status === 'error' && (
                <div className="mb-4 px-4 py-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-red-600 dark:text-red-400 text-sm">{t.error}</p>
                </div>
              )}

              {/* Submit button */}
              <button
                onClick={handleSubmit}
                disabled={!selectedStock || status === 'submitting'}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:from-slate-300 disabled:to-slate-400 dark:disabled:from-slate-600 dark:disabled:to-slate-700 disabled:cursor-not-allowed text-white text-base font-semibold py-3 rounded-xl transition-all"
              >
                {status === 'submitting' ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Gift className="w-5 h-5" />
                )}
                {t.submit}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
