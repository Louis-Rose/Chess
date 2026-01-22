// Investing Welcome panel

import { useNavigate } from 'react-router-dom';
import { Briefcase, Eye, Calendar, TrendingUp, Loader2, PartyPopper, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { PWAInstallPrompt } from '../../../components/PWAInstallPrompt';
import { StockSearchBar } from '../components/StockSearchBar';

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

export function InvestingWelcomePanel() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading, user, isNewUser, clearNewUserFlag } = useAuth();
  const { language } = useLanguage();

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
      icon: Briefcase,
      iconBg: 'bg-green-600',
      hoverBorder: 'hover:border-green-500',
      path: '/investing/portfolio',
      titleEn: 'My Portfolio',
      titleFr: 'Mon Portefeuille',
      descEn: 'View your holdings, track performance, and analyze your investment distribution.',
      descFr: 'Consultez vos positions, suivez la performance et analysez la répartition de vos investissements.',
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
      icon: Calendar,
      iconBg: 'bg-amber-600',
      hoverBorder: 'hover:border-amber-500',
      path: '/investing/earnings',
      titleEn: 'Earnings Calendar',
      titleFr: 'Calendrier des Résultats',
      descEn: 'Track upcoming earnings releases for your holdings.',
      descFr: 'Suivez les prochaines publications de résultats de vos positions.',
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

      <div className="md:animate-in md:fade-in md:slide-in-from-bottom-4 md:duration-700 mt-8">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            {language === 'fr' ? 'Bienvenue' : 'Welcome'}{isAuthenticated && user?.name ? `, ${user.name}` : ''} !
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl mx-auto">
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

        {/* Stock Search Section */}
        <div className="max-w-2xl mx-auto mt-[10vh]">
          <StockSearchBar />
        </div>
      </div>
    </>
  );
}
