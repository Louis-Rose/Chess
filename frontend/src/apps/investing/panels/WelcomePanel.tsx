// Investing Welcome panel

import { useNavigate } from 'react-router-dom';
import { Briefcase, Eye, Calendar, TrendingUp, Loader2, PartyPopper, X } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { LoginButton } from '../../../components/LoginButton';
import { PWAInstallPrompt } from '../../../components/PWAInstallPrompt';
import { StockSearchBar } from '../components/StockSearchBar';

export function InvestingWelcomePanel() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading, user, isNewUser, clearNewUserFlag } = useAuth();
  const { language } = useLanguage();

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-green-500 animate-spin mb-4" />
        <p className="text-slate-400">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center py-8 md:py-16">
        <h1 className="text-3xl md:text-5xl font-bold text-slate-900 dark:text-slate-100 text-center px-4">
          {language === 'fr' ? 'Suivez vos Investissements' : 'Track Your Investments'}
        </h1>
        <div className="flex items-start pt-6 md:pt-8 h-[72px] md:h-[144px]">
          <span className="text-7xl md:text-9xl opacity-15 leading-none">&#128200;</span>
        </div>
        <div className="flex flex-col items-center mt-6 md:mt-8 px-4">
          <p className="text-lg md:text-xl text-slate-600 dark:text-slate-300 mb-3 text-center max-w-lg font-light tracking-wide">
            {language === 'fr' ? 'Suivez la performance de votre portefeuille.' : 'Monitor your portfolio performance.'}
          </p>
          <p className="text-lg md:text-xl text-slate-600 dark:text-slate-300 mb-8 md:mb-10 text-center max-w-lg font-light tracking-wide">
            {language === 'fr' ? 'Obtenez des informations pour prendre de meilleures décisions.' : 'Get insights to make better investment decisions.'}
          </p>
          <LoginButton />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100">
          {language === 'fr' ? 'Tableau de Bord' : 'Your Investment Dashboard'}
        </h1>
        <PWAInstallPrompt className="max-w-md mx-auto" />
      </div>

      {/* New user welcome banner */}
      {isNewUser && (
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

      <div className="md:animate-in md:fade-in md:slide-in-from-bottom-4 md:duration-700 mt-8">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            {language === 'fr' ? 'Bienvenue' : 'Welcome'}{user?.name ? `, ${user.name}` : ''} !
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl mx-auto">
          {/* Stocks Research */}
          <button
            onClick={() => navigate('/investing/financials')}
            className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-5 hover:border-purple-500 transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {language === 'fr' ? 'Recherche d\'actions' : 'Stock research'}
              </h3>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              {language === 'fr'
                ? 'Données financières et analyses sur toute entreprise cotée.'
                : 'Financials and insights on any listed company.'}
            </p>
          </button>

          {/* My Portfolio */}
          <button
            onClick={() => navigate('/investing/portfolio')}
            className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-5 hover:border-green-500 transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
                <Briefcase className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {language === 'fr' ? 'Mon Portefeuille' : 'My Portfolio'}
              </h3>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              {language === 'fr'
                ? 'Consultez vos positions, suivez la performance et analysez la répartition de vos investissements.'
                : 'View your holdings, track performance, and analyze your investment distribution.'}
            </p>
          </button>

          {/* My Watchlist */}
          <button
            onClick={() => navigate('/investing/watchlist')}
            className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-5 hover:border-blue-500 transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <Eye className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {language === 'fr' ? 'Ma Watchlist' : 'My Watchlist'}
              </h3>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              {language === 'fr'
                ? 'Gérez la liste des actions que vous souhaitez suivre.'
                : 'Manage the list of stocks you want to follow.'}
            </p>
          </button>

          {/* Earnings Calendar */}
          <button
            onClick={() => navigate('/investing/earnings')}
            className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-5 hover:border-amber-500 transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-amber-600 rounded-lg flex items-center justify-center">
                <Calendar className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {language === 'fr' ? 'Calendrier des Résultats' : 'Earnings Calendar'}
              </h3>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              {language === 'fr'
                ? 'Suivez les prochaines publications de résultats de vos positions.'
                : 'Track upcoming earnings releases for your holdings.'}
            </p>
          </button>
        </div>

        {/* Stock Search Section */}
        <div className="max-w-2xl mx-auto mt-[10vh]">
          <StockSearchBar />
        </div>
      </div>
    </>
  );
}
