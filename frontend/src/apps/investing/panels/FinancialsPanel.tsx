// Financials panel - search stocks

import { useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronRight, Loader2 } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { findStockByTicker } from '../utils/allStocks';
import { getCompanyLogoUrl } from '../utils/companyLogos';
import { GICS_SECTORS, getStocksBySubIndustry, getStocksBySector, getStocksByIndustryGroup, getStocksByIndustry, type GICSSector, type GICSIndustryGroup, type GICSIndustry, type GICSSubIndustry } from '../utils/gics';
import { addRecentStock } from '../utils/recentStocks';
import { PWAInstallPrompt } from '../../../components/PWAInstallPrompt';
import { StockSearchBar } from '../components/StockSearchBar';
import { StockDetailPanel } from './StockDetailPanel';

export function FinancialsPanel() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { language } = useLanguage();

  // Derive GICS state from URL params
  const gicsState = useMemo(() => {
    const sectorCode = searchParams.get('sector');
    const industryGroupCode = searchParams.get('industryGroup');
    const industryCode = searchParams.get('industry');
    const subIndustryCode = searchParams.get('subIndustry');

    let selectedSector: GICSSector | null = null;
    let selectedIndustryGroup: GICSIndustryGroup | null = null;
    let selectedIndustry: GICSIndustry | null = null;
    let selectedSubIndustry: GICSSubIndustry | null = null;

    if (sectorCode) {
      selectedSector = GICS_SECTORS.find(s => s.code === sectorCode) || null;
      if (selectedSector && industryGroupCode) {
        selectedIndustryGroup = selectedSector.industryGroups.find(g => g.code === industryGroupCode) || null;
        if (selectedIndustryGroup && industryCode) {
          selectedIndustry = selectedIndustryGroup.industries.find(i => i.code === industryCode) || null;
          if (selectedIndustry && subIndustryCode) {
            selectedSubIndustry = selectedIndustry.subIndustries.find(si => si.code === subIndustryCode) || null;
          }
        }
      }
    }

    return { selectedSector, selectedIndustryGroup, selectedIndustry, selectedSubIndustry };
  }, [searchParams]);

  const { selectedSector, selectedIndustryGroup, selectedIndustry, selectedSubIndustry } = gicsState;

  // Helper to update URL params
  const updateGICSParams = useCallback((params: {
    sector?: string | null;
    industryGroup?: string | null;
    industry?: string | null;
    subIndustry?: string | null;
  }) => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);

      if (params.sector !== undefined) {
        if (params.sector) {
          newParams.set('sector', params.sector);
        } else {
          newParams.delete('sector');
        }
      }

      if (params.industryGroup !== undefined) {
        if (params.industryGroup) {
          newParams.set('industryGroup', params.industryGroup);
        } else {
          newParams.delete('industryGroup');
        }
      }

      if (params.industry !== undefined) {
        if (params.industry) {
          newParams.set('industry', params.industry);
        } else {
          newParams.delete('industry');
        }
      }

      if (params.subIndustry !== undefined) {
        if (params.subIndustry) {
          newParams.set('subIndustry', params.subIndustry);
        } else {
          newParams.delete('subIndustry');
        }
      }

      return newParams;
    }, { replace: true });
  }, [setSearchParams]);

  const handleSelectStock = (ticker: string) => {
    addRecentStock(ticker);
    navigate(`/investing/stock/${ticker}`);
  };

  // GICS handlers - update URL params
  const handleSelectSector = (sector: GICSSector) => {
    updateGICSParams({
      sector: sector.code,
      industryGroup: null,
      industry: null,
      subIndustry: null
    });
  };

  const handleSelectIndustryGroup = (group: GICSIndustryGroup) => {
    updateGICSParams({
      industryGroup: group.code,
      industry: null,
      subIndustry: null
    });
  };

  const handleSelectIndustry = (industry: GICSIndustry) => {
    updateGICSParams({
      industry: industry.code,
      subIndustry: null
    });
  };

  const handleSelectSubIndustry = (subIndustry: GICSSubIndustry) => {
    updateGICSParams({ subIndustry: subIndustry.code });
  };

  const handleResetGICS = () => {
    updateGICSParams({
      sector: null,
      industryGroup: null,
      industry: null,
      subIndustry: null
    });
  };

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-green-500 animate-spin mb-4" />
        <p className="text-slate-400">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Show Tesla stock detail preview for logged-off users (blurred by LoginOverlay)
    return <StockDetailPanel />;
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col items-center gap-2 mb-6 mt-8">
        <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100">{language === 'fr' ? 'Recherche d\'actions' : 'Stock Research'}</h2>
        <p className="text-slate-500 dark:text-slate-400 text-lg italic">
          {language === 'fr' ? 'Recherchez 2 500+ actions sur 8 marchés mondiaux' : 'Research 2,500+ stocks across 8 global markets'}
        </p>
        <PWAInstallPrompt className="max-w-md w-full mt-2" />
      </div>

      <div className="max-w-2xl mx-auto space-y-6">
        {/* Search Individual Stocks - Title inside card */}
        <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
            {language === 'fr' ? 'Rechercher des actions' : 'Search Individual Stocks'}
          </h3>
          <StockSearchBar hideContainer />
        </div>

        {/* Horizontal Separator */}
        <div className="h-px bg-slate-300 dark:bg-slate-600"></div>

        {/* GICS Industry Search - Always visible */}
        <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              {language === 'fr' ? 'Rechercher par secteur GICS' : 'Search by GICS Sector'}
            </h3>
            {selectedSector && (
              <button
                onClick={handleResetGICS}
                className="text-sm text-purple-600 hover:text-purple-700 font-medium"
              >
                {language === 'fr' ? 'Réinitialiser' : 'Reset'}
              </button>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Global Industry Classification Standard
          </p>

          {/* Breadcrumb */}
          {selectedSector && (
            <div className="flex items-center gap-1 text-sm mb-4 flex-wrap">
              <button
                onClick={handleResetGICS}
                className="text-purple-600 hover:underline"
              >
                GICS
              </button>
              <ChevronRight className="w-4 h-4 text-slate-400" />
              <button
                onClick={() => updateGICSParams({ industryGroup: null, industry: null, subIndustry: null })}
                className={`${selectedIndustryGroup ? 'text-purple-600 hover:underline' : 'text-slate-700 dark:text-slate-300 font-medium'}`}
              >
                {selectedSector.name}
              </button>
              {selectedIndustryGroup && (
                <>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                  <button
                    onClick={() => updateGICSParams({ industry: null, subIndustry: null })}
                    className={`${selectedIndustry ? 'text-purple-600 hover:underline' : 'text-slate-700 dark:text-slate-300 font-medium'}`}
                  >
                    {selectedIndustryGroup.name}
                  </button>
                </>
              )}
              {selectedIndustry && (
                <>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                  <button
                    onClick={() => updateGICSParams({ subIndustry: null })}
                    className={`${selectedSubIndustry ? 'text-purple-600 hover:underline' : 'text-slate-700 dark:text-slate-300 font-medium'}`}
                  >
                    {selectedIndustry.name}
                  </button>
                </>
              )}
              {selectedSubIndustry && (
                <>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                  <span className="text-slate-700 dark:text-slate-300 font-medium">
                    {selectedSubIndustry.name}
                  </span>
                </>
              )}
            </div>
          )}

          {/* Level 1: Sectors */}
          {!selectedSector && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {GICS_SECTORS.map((sector) => {
                const companyCount = getStocksBySector(sector.code).length;
                return (
                  <button
                    key={sector.code}
                    onClick={() => handleSelectSector(sector)}
                    className="p-3 bg-white dark:bg-slate-600 rounded-lg border border-slate-200 dark:border-slate-500 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-slate-500 transition-colors text-left"
                  >
                    <p className="font-medium text-slate-800 dark:text-slate-100 text-sm">{sector.name}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-100">GICS code: {sector.code}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-100">{companyCount} companies</p>
                  </button>
                );
              })}
            </div>
          )}

          {/* Level 2: Industry Groups */}
          {selectedSector && !selectedIndustryGroup && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {selectedSector.industryGroups.map((group) => {
                const companyCount = getStocksByIndustryGroup(group.code).length;
                return (
                  <button
                    key={group.code}
                    onClick={() => handleSelectIndustryGroup(group)}
                    className="p-3 bg-white dark:bg-slate-600 rounded-lg border border-slate-200 dark:border-slate-500 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-slate-500 transition-colors text-left flex items-center justify-between"
                  >
                    <div>
                      <p className="font-medium text-slate-800 dark:text-slate-100 text-sm">{group.name}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-100">GICS code: {group.code}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-100">{companyCount} companies</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>
                );
              })}
            </div>
          )}

          {/* Level 3: Industries */}
          {selectedIndustryGroup && !selectedIndustry && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {selectedIndustryGroup.industries.map((industry) => {
                const companyCount = getStocksByIndustry(industry.code).length;
                return (
                  <button
                    key={industry.code}
                    onClick={() => handleSelectIndustry(industry)}
                    className="p-3 bg-white dark:bg-slate-600 rounded-lg border border-slate-200 dark:border-slate-500 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-slate-500 transition-colors text-left flex items-center justify-between"
                  >
                    <div>
                      <p className="font-medium text-slate-800 dark:text-slate-100 text-sm">{industry.name}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-100">GICS code: {industry.code}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-100">{companyCount} companies</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>
                );
              })}
            </div>
          )}

          {/* Level 4: Sub-Industries */}
          {selectedIndustry && !selectedSubIndustry && (
            <div className="grid grid-cols-1 gap-2">
              {selectedIndustry.subIndustries.map((subIndustry) => {
                const companyCount = getStocksBySubIndustry(subIndustry.code).length;
                return (
                  <button
                    key={subIndustry.code}
                    onClick={() => handleSelectSubIndustry(subIndustry)}
                    className="p-3 bg-white dark:bg-slate-600 rounded-lg border border-slate-200 dark:border-slate-500 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-slate-500 transition-colors text-left"
                  >
                    <p className="font-medium text-slate-800 dark:text-slate-100 text-sm">{subIndustry.name}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-100">GICS code: {subIndustry.code}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-100">{companyCount} companies</p>
                  </button>
                );
              })}
            </div>
          )}

          {/* Selected Sub-Industry Info */}
          {selectedSubIndustry && (() => {
            const stocksInSubIndustry = getStocksBySubIndustry(selectedSubIndustry.code);
            return (
              <div className="bg-purple-50 dark:bg-purple-900/30 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-mono bg-purple-200 dark:bg-purple-800 text-purple-800 dark:text-purple-200 px-2 py-0.5 rounded">
                    {selectedSubIndustry.code}
                  </span>
                </div>
                <p className="font-semibold text-purple-900 dark:text-purple-100 mb-3">{selectedSubIndustry.name}</p>
                {stocksInSubIndustry.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm text-purple-700 dark:text-purple-300">
                      {language === 'fr' ? `${stocksInSubIndustry.length} action(s) dans cette sous-industrie:` : `${stocksInSubIndustry.length} stock(s) in this sub-industry:`}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {stocksInSubIndustry.map((ticker) => {
                        const stock = findStockByTicker(ticker);
                        const logoUrl = getCompanyLogoUrl(ticker);
                        return (
                          <button
                            key={ticker}
                            onClick={() => handleSelectStock(ticker)}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors bg-white dark:bg-slate-600 border-purple-200 dark:border-purple-700 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-800/50"
                            title={stock?.name || ticker}
                          >
                            <div className="w-5 h-5 rounded bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
                              {logoUrl ? (
                                <img
                                  src={logoUrl}
                                  alt={`${ticker} logo`}
                                  className="w-5 h-5 object-contain"
                                  onError={(e) => {
                                    const parent = e.currentTarget.parentElement;
                                    if (parent) {
                                      parent.innerHTML = `<span class="text-[8px] font-bold text-slate-500">${ticker.slice(0, 2)}</span>`;
                                    }
                                  }}
                                />
                              ) : (
                                <span className="text-[8px] font-bold text-slate-500 dark:text-slate-300">{ticker.slice(0, 2)}</span>
                              )}
                            </div>
                            <span className="font-medium text-sm text-purple-800 dark:text-purple-100">{ticker}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-purple-600 dark:text-purple-400 italic">
                    {language === 'fr' ? 'Aucune action mappée dans cette sous-industrie' : 'No stocks mapped to this sub-industry'}
                  </p>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
