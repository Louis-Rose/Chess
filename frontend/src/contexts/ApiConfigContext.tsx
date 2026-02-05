// API Configuration Context
// Allows demo apps to override API base paths

import { createContext, useContext, type ReactNode } from 'react';

interface ApiConfig {
  // Base paths for different API categories
  investing: string;
}

const defaultConfig: ApiConfig = {
  investing: '/api/investing',
};

const ApiConfigContext = createContext<ApiConfig>(defaultConfig);

export function ApiConfigProvider({
  children,
  config,
}: {
  children: ReactNode;
  config: Partial<ApiConfig>;
}) {
  const mergedConfig = { ...defaultConfig, ...config };
  return (
    <ApiConfigContext.Provider value={mergedConfig}>
      {children}
    </ApiConfigContext.Provider>
  );
}

export function useApiConfig() {
  return useContext(ApiConfigContext);
}
