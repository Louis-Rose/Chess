import { useState } from 'react';
import { useLanguage } from '../../../../contexts/LanguageContext';
import { QUARTERLY_DATA } from './quarterlyData';

interface QuarterlyResultsProps {
  portfolioTickers: string[];
}

const INDENT_CLASSES = ['px-3', 'pl-10 pr-3', 'pl-16 pr-3'];

export function QuarterlyResults({ portfolioTickers }: QuarterlyResultsProps) {
  const { language } = useLanguage();
  const [selectedTicker, setSelectedTicker] = useState<string>(
    portfolioTickers.find(t => QUARTERLY_DATA[t]) || portfolioTickers[0] || ''
  );

  const report = QUARTERLY_DATA[selectedTicker];

  return (
    <div>
      {/* Company toggle */}
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

      {report ? (
        <div className="mx-[10%]">
          {/* Main metrics table */}
          <table className="w-full border-2 border-slate-400 dark:border-slate-300 text-sm">
            <tbody>
              {report.tableSections.map((section, sIdx) => (
                <>{/* Section header */}
                  <tr key={`section-${sIdx}`} className="bg-slate-200 dark:bg-slate-600 border-b border-slate-300 dark:border-slate-500">
                    <td colSpan={3} className="py-2 px-3 text-center font-bold text-slate-700 dark:text-slate-200 text-sm uppercase tracking-wide">
                      {section.title}
                    </td>
                  </tr>
                  {/* Section rows */}
                  {section.rows.map((row, rIdx) => {
                    const indentLevel = row.indent ?? 0;
                    return (
                      <tr
                        key={`row-${sIdx}-${rIdx}`}
                        className={`border-b border-slate-300 dark:border-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors ${
                          row.highlight ? 'bg-slate-100 dark:bg-slate-700' : ''
                        }`}
                      >
                        <td className={`py-2 border-r-2 border-slate-400 dark:border-slate-300 text-center text-slate-800 dark:text-slate-100 w-[50%] ${
                          INDENT_CLASSES[indentLevel]
                        } ${row.highlight ? 'font-bold' : ''}`}>
                          {row.metric}
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

          {/* Conference call insights */}
          {report.insights && report.insights.length > 0 && (
            <div className="mt-8">
              <h4 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">
                {language === 'fr' ? 'Points clés de la conférence téléphonique' : 'Conference call insights'}
              </h4>
              {report.insights.map((topic, tIdx) => (
                <div key={tIdx} className="mb-4">
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
          )}
        </div>
      ) : (
        <p className="text-slate-500 text-center py-4">
          {language === 'fr' ? 'Aucune donnée trimestrielle disponible pour cette action' : 'No quarterly data available for this stock'}
        </p>
      )}
    </div>
  );
}
