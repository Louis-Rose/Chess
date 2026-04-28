import { useCookieConsent } from '../contexts/CookieConsentContext';
import { useLanguage } from '../contexts/LanguageContext';

export function CookieBanner() {
  const { consentStatus, acceptCookies, refuseCookies } = useCookieConsent();
  const { language } = useLanguage();

  if (consentStatus !== 'pending') return null;

  const copy = {
    fr: {
      title: 'Cookies et confidentialité',
      body: "Nous utilisons des cookies pour analyser l'utilisation de la plateforme et l'améliorer. Acceptez-vous le suivi de votre navigation ?",
      refuse: 'Refuser',
      accept: 'Accepter',
    },
    es: {
      title: 'Cookies y privacidad',
      body: 'Usamos cookies para analizar el uso de la plataforma y mejorarla. ¿Aceptas el seguimiento de tu navegación?',
      refuse: 'Rechazar',
      accept: 'Aceptar',
    },
    en: {
      title: 'Cookies & Privacy',
      body: 'We use cookies to analyze platform usage and improve it. Do you accept tracking of your browsing?',
      refuse: 'Refuse',
      accept: 'Accept',
    },
  }[language];

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-md z-50">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 sm:p-6 shadow-2xl">
        <h2 className="text-base font-semibold text-white mb-2">{copy.title}</h2>
        <p className="text-slate-300 text-sm mb-4 leading-relaxed">{copy.body}</p>
        <div className="flex gap-3">
          <button
            onClick={refuseCookies}
            className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700"
          >
            {copy.refuse}
          </button>
          <button
            onClick={acceptCookies}
            className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl bg-green-600 hover:bg-green-500 text-white transition-colors"
          >
            {copy.accept}
          </button>
        </div>
      </div>
    </div>
  );
}
