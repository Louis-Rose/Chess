import { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { toPng } from 'html-to-image';
import { useLanguage } from '../../../../contexts/LanguageContext';
import { useTheme } from '../../../../contexts/ThemeContext';
import { QUARTERLY_DATA } from './quarterlyData';
import { addLumnaBranding } from './utils';
import type { TableRow } from './quarterlyData';

interface QuarterlyResultsProps {
  portfolioTickers: string[];
}

export interface QuarterlyResultsHandle {
  download: () => Promise<void>;
}

const INDENT_PL = ['pl-3', 'pl-9', 'pl-[3.75rem]'];

function computePrefix(rows: TableRow[], index: number): string {
  const row = rows[index];
  const level = row.indent ?? 0;
  if (level === 0) return '';

  if (level === 1) {
    let count = 0;
    for (let i = 0; i <= index; i++) {
      if ((rows[i].indent ?? 0) === 1) count++;
    }
    return `${count}. `;
  }

  if (level === 2) {
    let count = 0;
    for (let i = index; i >= 0; i--) {
      const lvl = rows[i].indent ?? 0;
      if (lvl === 2) count++;
      if (lvl === 1) break;
    }
    return `${String.fromCharCode(96 + count)}. `;
  }

  return '';
}

export const QuarterlyResults = forwardRef<QuarterlyResultsHandle, QuarterlyResultsProps>(
  ({ portfolioTickers }, ref) => {
    const { language } = useLanguage();
    const { resolvedTheme } = useTheme();
    const [selectedTicker, setSelectedTicker] = useState<string>(
      portfolioTickers.find(t => QUARTERLY_DATA[t]) || portfolioTickers[0] || ''
    );
    const [isDownloading, setIsDownloading] = useState(false);
    const tableRef = useRef<HTMLDivElement>(null);
    const insightsRef = useRef<HTMLDivElement>(null);

    const report = QUARTERLY_DATA[selectedTicker];

    const handleDownload = async () => {
      setIsDownloading(true);
      await new Promise(r => setTimeout(r, 100));
      const bgColor = resolvedTheme === 'dark' ? '#334155' : '#f1f5f9';
      try {
        // Download table
        if (tableRef.current) {
          const tableDataUrl = await toPng(tableRef.current, { backgroundColor: bgColor, pixelRatio: 2, skipFonts: true });
          const tableBranded = await addLumnaBranding(tableDataUrl);
          const tableLink = document.createElement('a');
          tableLink.download = `quarterly-results-${selectedTicker}.png`;
          tableLink.href = tableBranded;
          tableLink.click();
        }
        // Download insights
        if (insightsRef.current) {
          await new Promise(r => setTimeout(r, 200));
          const insightsDataUrl = await toPng(insightsRef.current, { backgroundColor: bgColor, pixelRatio: 2, skipFonts: true });
          const insightsBranded = await addLumnaBranding(insightsDataUrl);
          const insightsLink = document.createElement('a');
          insightsLink.download = `conference-call-insights-${selectedTicker}.png`;
          insightsLink.href = insightsBranded;
          insightsLink.click();
        }
      } finally {
        setIsDownloading(false);
      }
    };

    useImperativeHandle(ref, () => ({ download: handleDownload }));

    return (
      <div>
        {/* Company toggle - hidden during download */}
        {!isDownloading && (
          <div className="flex flex-wrap gap-2 mb-4 justify-center">
            {portfolioTickers.map(ticker => {
              const hasData = !!QUARTERLY_DATA[ticker];
              const isSelected = ticker === selectedTicker;
              return (
                <button
                  key={ticker}
                  onClick={() => setSelectedTicker(ticker)}
                  disabled={!hasData}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    isSelected
                      ? 'bg-blue-600 text-white'
                      : hasData
                        ? 'bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-500'
                        : 'bg-slate-100 dark:bg-slate-700/50 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                  }`}
                >
                  {ticker}
                </button>
              );
            })}
          </div>
        )}

        {report ? (
          <>
            {/* Table section */}
            <div ref={tableRef} className="pb-6">
              {isDownloading && (
                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 text-center mb-4">
                  {language === 'fr' ? 'Résultats trimestriels' : 'Quarterly Results'} — {report.companyName} ({report.quarter})
                </h3>
              )}
              <div className="mx-[10%]">
                <table className="w-full border-2 border-slate-400 dark:border-slate-300 text-sm">
                  <tbody>
                    {report.tableSections.map((section, sIdx) => (
                      <>{/* Section header */}
                        <tr key={`section-${sIdx}`} className="bg-slate-200 dark:bg-slate-600 border-b border-slate-300 dark:border-slate-500">
                          <td colSpan={3} className="py-2 px-3 text-left font-bold text-slate-700 dark:text-slate-200 text-sm uppercase tracking-wide">
                            {section.title}
                          </td>
                        </tr>
                        {/* Section rows */}
                        {section.rows.map((row, rIdx) => {
                          const prefix = computePrefix(section.rows, rIdx);
                          const indentLevel = row.indent ?? 0;
                          return (
                            <tr
                              key={`row-${sIdx}-${rIdx}`}
                              className={`border-b border-slate-300 dark:border-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors ${
                                row.highlight ? 'bg-slate-100 dark:bg-slate-700' : ''
                              }`}
                            >
                              <td className={`py-2 ${INDENT_PL[indentLevel]} pr-3 border-r-2 border-slate-400 dark:border-slate-300 text-left text-slate-800 dark:text-slate-100 w-[50%] ${
                                row.highlight ? 'font-bold' : ''
                              }`}>
                                {prefix}{row.metric}
                              </td>
                              <td className="py-2 px-3 text-center font-semibold text-slate-700 dark:text-slate-200 border-r-2 border-slate-400 dark:border-slate-300 w-[25%]">
                                {row.value || '—'}
                              </td>
                              <td className={`py-2 px-3 text-center font-bold w-[25%] ${
                                row.growth
                                  ? row.growth.startsWith('+') ? 'text-green-600' : 'text-red-600'
                                  : 'text-slate-400'
                              }`}>
                                {row.growth || '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
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

            {/* Conference call insights - separate bordered box */}
            {report.insights && report.insights.length > 0 && (
              <div ref={insightsRef} className="mt-6 pb-4">
                <div className="mx-[10%]">
                  {isDownloading && (
                    <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 text-center mb-4">
                      {language === 'fr' ? 'Points clés' : 'Conference call insights'} — {report.companyName} ({report.quarter})
                    </h3>
                  )}
                  <div className="border-2 border-slate-400 dark:border-slate-300 rounded-lg p-4">
                  <h4 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">
                    {language === 'fr' ? 'Points clés de la conférence téléphonique' : 'Conference call insights'}
                  </h4>
                  {report.insights.map((topic, tIdx) => (
                    <div key={tIdx} className={tIdx < report.insights!.length - 1 ? 'mb-4' : ''}>
                      <h5 className="font-bold text-slate-700 dark:text-slate-200 mb-2">{topic.title}</h5>
                      <ul className="list-disc ml-6 space-y-1.5">
                        {topic.bullets.map((bullet, bIdx) => (
                          <li key={bIdx} className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                            {bullet}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  </div>
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
              </div>
            )}
          </>
        ) : (
          <p className="text-slate-500 text-center py-4">
            {language === 'fr' ? 'Aucune donnée trimestrielle disponible pour cette action' : 'No quarterly data available for this stock'}
          </p>
        )}
      </div>
    );
  }
);
