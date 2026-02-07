import { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Loader2, Download, ChevronUp, ChevronDown } from 'lucide-react';
import { toPng } from 'html-to-image';
import axios from 'axios';
import { useLanguage } from '../../../../contexts/LanguageContext';
import { useTheme } from '../../../../contexts/ThemeContext';
import type { CompositionData, CompositionItem } from './types';
import { formatEur, addLumnaBranding, getScaleFactor } from './utils';

// Sorting types
type SortColumn = 'ticker' | 'quantity' | 'price' | 'value' | 'gain' | 'held';
type SortDirection = 'asc' | 'desc';

const formatHoldingPeriod = (firstBuyDate: string | undefined): string => {
  if (!firstBuyDate) return '—';
  const start = new Date(firstBuyDate);
  const now = new Date();
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months--;
  if (months < 0) months = 0;
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  if (years === 0) return `${remainingMonths}m`;
  if (remainingMonths === 0) return `${years}y`;
  return `${years}y ${remainingMonths}m`;
};

const getHoldingMonths = (firstBuyDate: string | undefined): number => {
  if (!firstBuyDate) return 0;
  const start = new Date(firstBuyDate);
  const now = new Date();
  return (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
};

export interface PortfolioCompositionHandle {
  download: () => Promise<void>;
  isDownloading: boolean;
}

// Currency symbols for display
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  CHF: 'CHF ',
  DKK: 'kr ',
  SEK: 'kr ',
  NOK: 'kr ',
};

const getCurrencySymbol = (currency: string): string => {
  return CURRENCY_SYMBOLS[currency] || `${currency} `;
};

interface PortfolioCompositionProps {
  compositionData: CompositionData | undefined;
  isLoading: boolean;
  privateMode: boolean;
  currency: 'EUR' | 'USD';
  hideTitle?: boolean;
  hideDownloadButton?: boolean;
}

export const PortfolioComposition = forwardRef<PortfolioCompositionHandle, PortfolioCompositionProps>(({
  compositionData,
  isLoading,
  privateMode,
  currency,
  hideTitle = false,
  hideDownloadButton = false,
}, ref) => {
  const navigate = useNavigate();
  const { language, t } = useLanguage();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const positionsChartRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // Sorting state
  const [sortColumn, setSortColumn] = useState<SortColumn>('value');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Handle column header click for sorting
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc'); // Default to descending for new column
    }
  };

  // Sort indicator component - only shows on active sort column
  const SortIndicator = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) {
      return null;
    }
    return sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
  };

  const downloadPositionsChart = async () => {
    if (!positionsChartRef.current) {
      console.error('Positions chart container ref not found');
      return;
    }
    setIsDownloading(true);
    await new Promise(resolve => setTimeout(resolve, 100));
    try {
      const dataUrl = await toPng(positionsChartRef.current, {
        backgroundColor: isDark ? '#334155' : '#f1f5f9', // slate-700 (lighter gray)
        pixelRatio: 2,
        skipFonts: true, // Skip fonts to avoid CORS issues with external stylesheets
      });

      const brandedDataUrl = await addLumnaBranding(dataUrl);

      const link = document.createElement('a');
      link.href = brandedDataUrl;
      link.download = `portfolio-positions-${new Date().toISOString().split('T')[0]}.png`;
      link.click();

      axios.post('/api/investing/graph-download', { graph_type: 'composition' }).catch(() => {});
    } catch (error) {
      console.error('Failed to download positions chart:', error);
      alert(language === 'fr' ? 'Erreur lors du telechargement' : 'Download failed');
    } finally {
      setIsDownloading(false);
    }
  };

  // Expose download function to parent via ref
  useImperativeHandle(ref, () => ({
    download: downloadPositionsChart,
    isDownloading,
  }));

  const content = (
    <>
      {!hideTitle && (
        <div className="flex items-center justify-center gap-3 mb-6">
          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">{t('holdings.title')}</h3>
          {!hideDownloadButton && (
            <button
              onClick={downloadPositionsChart}
              disabled={isDownloading || isLoading}
              className="flex items-center gap-1.5 px-2 py-1 text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors text-sm"
              title={language === 'fr' ? 'Telecharger le graphique' : 'Download chart'}
            >
              {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <span>{language === 'fr' ? 'Télécharger' : 'Download'}</span>
            </button>
          )}
        </div>
      )}
      {hideTitle && !hideDownloadButton && (
        <div className="flex justify-end mb-4">
          <button
            onClick={downloadPositionsChart}
            disabled={isDownloading || isLoading}
            className="flex items-center gap-1.5 px-2 py-1 text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors text-sm"
            title={language === 'fr' ? 'Telecharger le graphique' : 'Download chart'}
          >
            {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span>{language === 'fr' ? 'Télécharger' : 'Download'}</span>
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-green-500 animate-spin" />
        </div>
      ) : compositionData?.holdings && compositionData.holdings.length > 0 ? (
        <div ref={positionsChartRef} className="bg-slate-100 dark:bg-slate-700 rounded-xl p-4 overflow-visible">
          {/* Title for download capture - only visible during download */}
          {isDownloading && (
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 text-center mb-4">{t('holdings.title')}</h3>
          )}
          <div className="flex flex-col md:flex-row items-center gap-4 md:gap-8 overflow-visible">
            {/* Pie Chart */}
            {(() => {
              // Pre-calculate "Others" total for small slices
              const smallSlices = compositionData.holdings.filter(h => h.weight < 5);
              const othersTotal = smallSlices.reduce((sum, h) => sum + h.weight, 0);
              // Find the middle small slice to position "Others" label
              const middleSmallSliceIndex = Math.floor(smallSlices.length / 2);
              const middleSmallSliceTicker = smallSlices.length > 0 ? smallSlices[middleSmallSliceIndex].ticker : null;

              return (
                <div className="w-full md:w-1/2 h-[280px] md:h-[380px] overflow-visible">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 40, right: 80, bottom: 40, left: 80 }}>
                      <Pie
                        data={compositionData.holdings as unknown as Record<string, unknown>[]}
                        dataKey="weight"
                        nameKey="ticker"
                        cx="50%"
                        cy="50%"
                        outerRadius="50%"
                        label={({ name, value, x, y, textAnchor, fill }) => {
                          // For small slices (<5%), show "OTHERS X%" only on the middle one
                          if (value < 5) {
                            if (name === middleSmallSliceTicker && othersTotal > 0) {
                              return (
                                <text
                                  x={x}
                                  y={y}
                                  textAnchor={textAnchor}
                                  dominantBaseline="central"
                                  fontSize={15}
                                  fontWeight="bold"
                                  fill={isDark ? '#94a3b8' : '#64748b'}
                                >
                                  {language === 'fr' ? 'AUTRES' : 'OTHERS'} {othersTotal.toFixed(1)}%
                                </text>
                              );
                            }
                            return null;
                          }
                          return (
                            <text
                              x={x}
                              y={y}
                              textAnchor={textAnchor}
                              dominantBaseline="central"
                              fontSize={15}
                              fontWeight="bold"
                              fill={fill}
                              style={{ cursor: 'pointer' }}
                              onClick={() => navigate(`/investing/stock/${name}`)}
                            >
                              {name} {value}%
                            </text>
                          );
                        }}
                        labelLine={({ percent, name }) => {
                          // Show label line for large slices, and for middle small slice (Others)
                          if (percent >= 0.05) return <path />;
                          if (name === middleSmallSliceTicker && othersTotal > 0) return <path />;
                          return <path style={{ display: 'none' }} />;
                        }}
                        isAnimationActive={!isDownloading}
                        onClick={(data) => {
                          if (data?.ticker) {
                            navigate(`/investing/stock/${data.ticker}`);
                          }
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        {compositionData.holdings.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} style={{ cursor: 'pointer' }} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1e293b', borderRadius: '6px', border: '1px solid #334155', padding: '8px 12px' }}
                        itemStyle={{ color: '#f1f5f9' }}
                        formatter={(value, _name, props) => {
                          const payload = props.payload as CompositionItem;
                          const valueEur = payload.current_value;
                          const valueInCurrency = currency === 'EUR' ? valueEur : valueEur * compositionData.eurusd_rate;
                          const scaleFactor = getScaleFactor(compositionData.total_cost_basis_eur, privateMode);
                          const displayValue = Math.round(valueInCurrency * scaleFactor);
                          const formattedValue = currency === 'EUR'
                            ? `${formatEur(displayValue)}€`
                            : `$${displayValue.toLocaleString('en-US')}`;
                          return [`${formattedValue} (${value}%)`, payload.ticker];
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              );
            })()}

            {/* Holdings Table */}
            <div className="w-full md:w-1/2 overflow-x-auto">
              {(() => {
                const scaleFactor = getScaleFactor(compositionData.total_cost_basis_eur, privateMode);

                // Sort holdings
                const sortedHoldings = [...compositionData.holdings].sort((a, b) => {
                  let comparison = 0;
                  switch (sortColumn) {
                    case 'ticker':
                      comparison = a.ticker.localeCompare(b.ticker);
                      break;
                    case 'quantity':
                      comparison = a.quantity - b.quantity;
                      break;
                    case 'price':
                      comparison = (a.current_price_native ?? a.current_price) - (b.current_price_native ?? b.current_price);
                      break;
                    case 'value':
                      comparison = a.current_value - b.current_value;
                      break;
                    case 'gain':
                      comparison = a.gain_pct - b.gain_pct;
                      break;
                    case 'held':
                      comparison = getHoldingMonths(a.first_buy_date) - getHoldingMonths(b.first_buy_date);
                      break;
                  }
                  return sortDirection === 'asc' ? comparison : -comparison;
                });

                return (
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-slate-600 dark:text-slate-300 text-sm border-b border-slate-300 dark:border-slate-500">
                        <th className="pb-2">
                          <button onClick={() => handleSort('ticker')} className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-white transition-colors">
                            {t('holdings.stock')}
                            <SortIndicator column="ticker" />
                          </button>
                        </th>
                        {!privateMode && (
                          <th className="pb-2 text-right">
                            <button onClick={() => handleSort('quantity')} className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-white transition-colors ml-auto">
                              {t('holdings.shares')}
                              <SortIndicator column="quantity" />
                            </button>
                          </th>
                        )}
                        <th className="pb-2 text-right">
                          <button onClick={() => handleSort('price')} className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-white transition-colors ml-auto">
                            {t('holdings.price')}
                            <SortIndicator column="price" />
                          </button>
                        </th>
                        <th className="pb-2 text-right">
                          <button onClick={() => handleSort('value')} className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-white transition-colors ml-auto">
                            {privateMode ? t('holdings.weight') : t('holdings.value')}
                            <SortIndicator column="value" />
                          </button>
                        </th>
                        <th className="pb-2 text-right">
                          <button onClick={() => handleSort('gain')} className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-white transition-colors ml-auto">
                            {t('holdings.gain')}
                            <SortIndicator column="gain" />
                          </button>
                        </th>
                        <th className="pb-2 text-right">
                          <button onClick={() => handleSort('held')} className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-white transition-colors ml-auto">
                            {t('holdings.held')}
                            <SortIndicator column="held" />
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedHoldings.map((h) => {
                        // Value in EUR (already from backend)
                        const valueEur = h.current_value;
                        // Convert to USD if needed
                        const valueInCurrency = currency === 'EUR' ? valueEur : valueEur * compositionData.eurusd_rate;
                        const displayValue = Math.round(valueInCurrency * scaleFactor);
                        // Scale quantity in private mode to match the theoretical 10K portfolio
                        const scaledQuantity = h.quantity * scaleFactor;
                        const displayQuantity = privateMode ? (scaledQuantity < 1 ? scaledQuantity.toFixed(2) : Math.round(scaledQuantity)) : h.quantity;
                        // Show price in selected currency
                        const priceToShow = currency === 'EUR' ? h.current_price : (h.current_price_native ?? h.current_price);
                        const priceSymbol = currency === 'EUR' ? '€' : getCurrencySymbol(h.native_currency || 'USD');
                        return (
                          <tr
                            key={h.ticker}
                            onClick={() => navigate(`/investing/stock/${h.ticker}`)}
                            className="border-b border-slate-200 dark:border-slate-600 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                          >
                            <td className="py-2 font-bold" style={{ color: h.color }}>{h.ticker}</td>
                            {!privateMode && (
                              <td className="py-2 text-right text-slate-600 dark:text-slate-300">{displayQuantity}</td>
                            )}
                            <td className="py-2 text-right text-slate-600 dark:text-slate-300">
                              {currency === 'EUR' ? `${priceToShow.toFixed(2)}€` : `${priceSymbol}${priceToShow.toFixed(2)}`}
                            </td>
                            <td className="py-2 text-right text-slate-800 dark:text-slate-100 font-medium">
                              {privateMode
                                ? `${h.weight.toFixed(1)}%`
                                : currency === 'EUR'
                                  ? `${formatEur(displayValue)}€`
                                  : `$${displayValue.toLocaleString('en-US')}`}
                            </td>
                            <td className={`py-2 text-right font-medium ${h.gain_pct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {h.gain_pct >= 0 ? '+' : ''}{h.gain_pct}%
                            </td>
                            <td className="py-2 text-right text-slate-500 dark:text-slate-400 text-sm">
                              {formatHoldingPeriod(h.first_buy_date)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </div>
          {/* LUMNA branding - hidden during download since addLumnaBranding adds it */}
          {!isDownloading && (
            <div className="flex items-center justify-end gap-2 mt-3 mr-2">
              <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-end">
                <svg viewBox="0 0 128 128" className="w-6 h-6 mr-0.5">
                  <rect x="28" y="64" width="16" height="40" rx="2" fill="white" />
                  <rect x="56" y="48" width="16" height="56" rx="2" fill="white" />
                  <rect x="84" y="32" width="16" height="72" rx="2" fill="white" />
                </svg>
              </div>
              <span className="text-lg font-bold text-slate-300">LUMNA</span>
            </div>
          )}
        </div>
      ) : (
        <p className="text-slate-500 text-center py-8">No holdings data available.</p>
      )}
    </>
  );

  if (hideTitle) {
    return content;
  }

  return (
    <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6">
      {content}
    </div>
  );
});
