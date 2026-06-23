import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type DisplayCurrency = 'EUR' | 'USD';

interface CurrencyCtx {
  display: DisplayCurrency;
  setDisplay: (c: DisplayCurrency) => void;
}

const Ctx = createContext<CurrencyCtx>({ display: 'EUR', setDisplay: () => {} });

const STORAGE_KEY = 'investing.displayCurrency';

// App-wide display currency for the Investing section. Persisted so the choice
// sticks across reloads.
export function InvestingCurrencyProvider({ children }: { children: ReactNode }) {
  const [display, setDisplay] = useState<DisplayCurrency>(() =>
    localStorage.getItem(STORAGE_KEY) === 'USD' ? 'USD' : 'EUR',
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, display);
  }, [display]);

  return <Ctx.Provider value={{ display, setDisplay }}>{children}</Ctx.Provider>;
}

export const useDisplayCurrency = () => useContext(Ctx);
