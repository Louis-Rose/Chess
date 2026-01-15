// Cookie consent banner for GDPR/CNIL compliance

import { useCookieConsent } from '../contexts/CookieConsentContext';
import { useLanguage } from '../contexts/LanguageContext';

export function CookieBanner() {
  const { consentStatus, acceptCookies, refuseCookies } = useCookieConsent();
  const { language } = useLanguage();

  if (consentStatus !== 'pending') {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700 p-4 z-50 shadow-lg">
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-slate-300 text-sm text-center sm:text-left">
          {language === 'fr'
            ? 'Nous utilisons des cookies pour analyser l\'utilisation de la plateforme et l\'améliorer. Acceptez-vous le suivi anonyme de votre navigation ?'
            : 'We use cookies to analyze platform usage and improve it. Do you accept anonymous tracking of your browsing?'}
        </p>
        <div className="flex gap-3 flex-shrink-0">
          <button
            onClick={refuseCookies}
            className="px-4 py-2 text-sm rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
          >
            {language === 'fr' ? 'Refuser' : 'Refuse'}
          </button>
          <button
            onClick={acceptCookies}
            className="px-4 py-2 text-sm rounded-lg bg-green-600 hover:bg-green-500 text-white transition-colors"
          >
            {language === 'fr' ? 'Accepter' : 'Accept'}
          </button>
        </div>
      </div>
    </div>
  );
}
