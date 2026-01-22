// Login overlay for unauthenticated users - shows a centered login popup
// while allowing them to see a blurred preview of the content behind

import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { LoginButton } from '../../../components/LoginButton';

export function LoginOverlay() {
  const { isAuthenticated, isLoading } = useAuth();
  const { language } = useLanguage();

  // Don't show anything if authenticated or still loading
  if (isAuthenticated || isLoading) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-10 flex items-start justify-start pointer-events-none pt-8" style={{ paddingLeft: 'calc(min(256px, 20vw) + 2rem)' }}>
      <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm rounded-2xl p-8 shadow-2xl border border-slate-200 dark:border-slate-700 max-w-md pointer-events-auto">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-100 text-center mb-4">
          {language === 'fr' ? 'Suivez vos Investissements' : 'Track Your Investments'}
        </h1>
        <p className="text-slate-600 dark:text-slate-300 text-center mb-6">
          {language === 'fr'
            ? 'Connectez-vous pour accéder à votre tableau de bord personnalis\u00e9.'
            : 'Sign in to access your personalized dashboard.'}
        </p>
        <div className="flex justify-center">
          <LoginButton />
        </div>
      </div>
    </div>
  );
}
