import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type DisplayCurrency = 'EUR' | 'USD';

interface PrefsCtx {
  display: DisplayCurrency;
  setDisplay: (c: DisplayCurrency) => void;
  isPrivate: boolean;
  setIsPrivate: (v: boolean) => void;
}

const Ctx = createContext<PrefsCtx>({
  display: 'EUR',
  setDisplay: () => {},
  isPrivate: false,
  setIsPrivate: () => {},
});

const STORAGE_KEY = 'investing.displayCurrency';

// App-wide preferences for the Investing section: display currency (persisted)
// and private mode (hides money amounts; session-only).
export function InvestingCurrencyProvider({ children }: { children: ReactNode }) {
  const [display, setDisplay] = useState<DisplayCurrency>(() =>
    localStorage.getItem(STORAGE_KEY) === 'USD' ? 'USD' : 'EUR',
  );
  const [isPrivate, setIsPrivate] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, display);
  }, [display]);

  return (
    <Ctx.Provider value={{ display, setDisplay, isPrivate, setIsPrivate }}>{children}</Ctx.Provider>
  );
}

export const useDisplayCurrency = () => useContext(Ctx);
