import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

type ConsentStatus = 'pending' | 'accepted' | 'refused';

interface CookieConsentContextType {
  consentStatus: ConsentStatus;
  acceptCookies: () => void;
  refuseCookies: () => void;
}

const CookieConsentContext = createContext<CookieConsentContextType | null>(null);

const STORAGE_KEY = 'cookie-consent';

export function CookieConsentProvider({ children }: { children: ReactNode }) {
  const [consentStatus, setConsentStatus] = useState<ConsentStatus>(() => {
    if (typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY) === 'accepted') {
      return 'accepted';
    }
    return 'pending';
  });

  const acceptCookies = useCallback(() => {
    setConsentStatus('accepted');
    localStorage.setItem(STORAGE_KEY, 'accepted');
  }, []);

  const refuseCookies = useCallback(() => {
    setConsentStatus('refused');
  }, []);

  return (
    <CookieConsentContext.Provider value={{ consentStatus, acceptCookies, refuseCookies }}>
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
