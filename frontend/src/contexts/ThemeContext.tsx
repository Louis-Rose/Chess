import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

interface ThemeContextType {
  theme: 'dark';
  setTheme: (theme: string) => void;
  resolvedTheme: 'dark';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Always apply dark mode
if (typeof window !== 'undefined') {
  document.documentElement.classList.add('dark');
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeContext.Provider value={{ theme: 'dark', setTheme: () => {}, resolvedTheme: 'dark' }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
