import { useState, useRef } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Loader2, Download } from 'lucide-react';
import { toPng } from 'html-to-image';
import axios from 'axios';
import { useLanguage } from '../../../../contexts/LanguageContext';
import type { CompositionData, CompositionItem } from './types';
import { formatEur, addLumraBranding, getScaleFactor } from './utils';

interface PortfolioCompositionProps {
  compositionData: CompositionData | undefined;
  isLoading: boolean;
  privateMode: boolean;
  currency: 'EUR' | 'USD';
}

export function PortfolioComposition({
  compositionData,
  isLoading,
  privateMode,
}: PortfolioCompositionProps) {
  const { language, t } = useLanguage();
  const positionsChartRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const downloadPositionsChart = async () => {
    if (!positionsChartRef.current) {
      console.error('Positions chart container ref not found');
      return;
    }
    setIsDownloading(true);
    await new Promise(resolve => setTimeout(resolve, 100));
    try {
      const dataUrl = await toPng(positionsChartRef.current, {
        backgroundColor: '#f1f5f9',
        pixelRatio: 2,
      });

      const brandedDataUrl = await addLumraBranding(dataUrl);

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

  return (
    <div className="bg-slate-50 dark:bg-slate-100 rounded-xl p-6">
      <div className="flex items-center justify-center gap-3 mb-6">
        <h3 className="text-xl font-bold text-slate-800 dark:text-slate-800">{t('holdings.title')}</h3>
        <button
          onClick={downloadPositionsChart}
          disabled={isDownloading || isLoading}
          className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
          title={language === 'fr' ? 'Telecharger le graphique' : 'Download chart'}
        >
          {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-green-500 animate-spin" />
        </div>
      ) : compositionData?.holdings && compositionData.holdings.length > 0 ? (
        <div ref={positionsChartRef} className="bg-slate-100 rounded-xl p-4 overflow-visible">
          <div className="flex flex-col md:flex-row items-center gap-4 md:gap-8 overflow-visible">
            {/* Pie Chart */}
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
                    label={({ name, value }) => `${name} ${value}%`}
                    labelLine={true}
                    isAnimationActive={!isDownloading}
                  >
                    {compositionData.holdings.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, _name, props) => {
                      const payload = props.payload as CompositionItem;
                      const valueEur = Math.round(payload.current_value / compositionData.eurusd_rate);
                      const scaleFactor = getScaleFactor(compositionData.total_cost_basis_eur, privateMode);
                      const displayValue = Math.round(valueEur * scaleFactor);
                      return [`${formatEur(displayValue)}€ (${value}%)`, payload.ticker];
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Holdings Table */}
            <div className="w-full md:w-1/2 overflow-x-auto">
              {(() => {
                const scaleFactor = getScaleFactor(compositionData.total_cost_basis_eur, privateMode);

                return (
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-slate-600 text-sm border-b border-slate-300">
                        <th className="pb-2">{t('holdings.stock')}</th>
                        <th className="pb-2 text-right">{t('holdings.shares')}</th>
                        <th className="pb-2 text-right">{t('holdings.price')}</th>
                        <th className="pb-2 text-right">{t('holdings.value')}</th>
                        <th className="pb-2 text-right">{t('holdings.gain')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {compositionData.holdings.map((h) => {
                        const valueEur = Math.round(h.current_value / compositionData.eurusd_rate);
                        const displayValue = Math.round(valueEur * scaleFactor);
                        const displayQuantity = privateMode ? Math.round(h.quantity * scaleFactor) : h.quantity;
                        return (
                          <tr key={h.ticker} className="border-b border-slate-200">
                            <td className="py-2 font-bold" style={{ color: h.color }}>{h.ticker}</td>
                            <td className="py-2 text-right text-slate-600">{displayQuantity}</td>
                            <td className="py-2 text-right text-slate-600">${h.current_price}</td>
                            <td className="py-2 text-right text-slate-800 font-medium">
                              {`${formatEur(displayValue)}€`}
                            </td>
                            <td className={`py-2 text-right font-medium ${h.gain_usd >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {h.gain_usd >= 0 ? '+' : ''}{h.gain_pct}%
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
        </div>
      ) : (
        <p className="text-slate-500 text-center py-8">No holdings data available.</p>
      )}
    </div>
  );
}
