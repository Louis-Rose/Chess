import { useState } from 'react';
import { useLanguage } from '../../../../contexts/LanguageContext';
import { QUARTERLY_DATA } from './quarterlyData';

interface QuarterlyResultsProps {
  portfolioTickers: string[];
}

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
            <thead>
              <tr className="border-b-2 border-slate-400 dark:border-slate-300">
                <th className="py-2 px-3 text-left text-base font-semibold text-slate-600 dark:text-slate-300 border-r-2 border-slate-400 dark:border-slate-300 w-[50%]">
                  {language === 'fr' ? 'Métrique' : 'Metric'}
                </th>
                <th className="py-2 px-3 text-center text-base font-semibold text-slate-600 dark:text-slate-300 border-r-2 border-slate-400 dark:border-slate-300 w-[25%]">
                  {language === 'fr' ? 'Valeur' : 'Value'}
                </th>
                <th className="py-2 px-3 text-center text-base font-semibold text-slate-600 dark:text-slate-300 w-[25%]">
                  {language === 'fr' ? 'Croissance' : 'Growth'}
                </th>
              </tr>
            </thead>
            <tbody>
              {report.tableSections.map((section, sIdx) => (
                <>{/* Section header */}
                  <tr key={`section-${sIdx}`} className="bg-slate-200 dark:bg-slate-600 border-b border-slate-300 dark:border-slate-500">
                    <td colSpan={3} className="py-2 px-3 font-bold text-slate-700 dark:text-slate-200 text-sm uppercase tracking-wide">
                      {section.title}
                    </td>
                  </tr>
                  {/* Section rows */}
                  {section.rows.map((row, rIdx) => (
                    <tr
                      key={`row-${sIdx}-${rIdx}`}
                      className={`border-b border-slate-300 dark:border-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors ${
                        row.highlight ? 'bg-slate-100 dark:bg-slate-700' : ''
                      }`}
                    >
                      <td className={`py-2 border-r-2 border-slate-400 dark:border-slate-300 text-slate-800 dark:text-slate-100 ${
                        row.indent ? 'pl-8 pr-3' : 'px-3'
                      } ${row.highlight ? 'font-bold' : ''}`}>
                        {row.metric}
                      </td>
                      <td className="py-2 px-3 text-center font-semibold text-slate-700 dark:text-slate-200 border-r-2 border-slate-400 dark:border-slate-300">
                        {row.value || '—'}
                      </td>
                      <td className={`py-2 px-3 text-center font-bold ${
                        row.growth
                          ? row.growth.startsWith('+') ? 'text-green-600' : 'text-red-600'
                          : 'text-slate-400'
                      }`}>
                        {row.growth || '—'}
                      </td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>

          {/* FCF Table */}
          {report.fcfTable && (
            <div className="mt-6">
              <table className="w-full border-2 border-slate-400 dark:border-slate-300 text-sm">
                <thead>
                  <tr className="border-b border-slate-300 dark:border-slate-500">
                    <th className="py-1 px-3 border-r-2 border-slate-400 dark:border-slate-300" />
                    <th colSpan={report.fcfTable.headers.length} className="py-1 text-center font-semibold text-slate-600 dark:text-slate-300">
                      {report.fcfTable.title}
                    </th>
                  </tr>
                  <tr className="border-b-2 border-slate-400 dark:border-slate-300">
                    <th className="py-2 px-3 border-r-2 border-slate-400 dark:border-slate-300" />
                    {report.fcfTable.headers.map((h, i) => (
                      <th
                        key={i}
                        className={`py-2 px-3 text-center font-semibold text-slate-600 dark:text-slate-300 ${
                          i < report.fcfTable!.headers.length - 1 ? 'border-r border-slate-300 dark:border-slate-500' : ''
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.fcfTable.rows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      className={`${
                        rIdx < report.fcfTable!.rows.length - 1 ? 'border-b border-slate-300 dark:border-slate-500' : ''
                      } ${row.highlight ? 'bg-slate-100 dark:bg-slate-700' : ''}`}
                    >
                      <td
                        className={`py-2 px-3 border-r-2 border-slate-400 dark:border-slate-300 text-slate-700 dark:text-slate-200 ${
                          row.bold ? 'font-bold' : ''
                        } ${!row.bold && !row.highlight ? 'pl-6' : ''}`}
                      >
                        {row.label}
                      </td>
                      {row.values.map((v, vIdx) => (
                        <td
                          key={vIdx}
                          className={`py-2 px-3 text-right text-slate-700 dark:text-slate-200 ${
                            row.bold ? 'font-bold border-t-2 border-slate-400 dark:border-slate-300' : ''
                          } ${vIdx < row.values.length - 1 ? 'border-r border-slate-300 dark:border-slate-500' : ''}`}
                        >
                          {v}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {report.fcfTable.footnote && (
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 italic">
                  {report.fcfTable.footnote}
                </p>
              )}
            </div>
          )}

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
