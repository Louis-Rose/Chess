// Cookie consent context for GDPR/CNIL compliance

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

type ConsentStatus = 'pending' | 'accepted' | 'refused';

interface CookieConsentContextType {
  consentStatus: ConsentStatus;
  acceptCookies: () => void;
  refuseCookies: () => void;
  resetConsent: () => void;
}

const CookieConsentContext = createContext<CookieConsentContextType | null>(null);

const STORAGE_KEY = 'cookie-consent';

export function CookieConsentProvider({ children }: { children: ReactNode }) {
  const [consentStatus, setConsentStatus] = useState<ConsentStatus>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'accepted' || stored === 'refused') {
        return stored;
      }
    }
    return 'pending';
  });

  useEffect(() => {
    if (consentStatus !== 'pending') {
      localStorage.setItem(STORAGE_KEY, consentStatus);
    }
  }, [consentStatus]);

  const acceptCookies = () => setConsentStatus('accepted');
  const refuseCookies = () => setConsentStatus('refused');
  const resetConsent = () => {
    localStorage.removeItem(STORAGE_KEY);
    setConsentStatus('pending');
  };

  return (
    <CookieConsentContext.Provider
      value={{ consentStatus, acceptCookies, refuseCookies, resetConsent }}
    >
      {children}
    </CookieConsentContext.Provider>
  );
}

export function useCookieConsent() {
  const context = useContext(CookieConsentContext);
  if (!context) {
    throw new Error('useCookieConsent must be used within a CookieConsentProvider');
  }
  return context;
}
