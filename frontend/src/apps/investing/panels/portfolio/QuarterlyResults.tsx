import { useState } from 'react';
import { useLanguage } from '../../../../contexts/LanguageContext';
import { QUARTERLY_DATA, LineItem } from './quarterlyData';

interface QuarterlyResultsProps {
  portfolioTickers: string[];
}

function BulletItem({ item, depth = 0 }: { item: LineItem; depth?: number }) {
  const listStyle = depth === 0 ? 'list-[circle]' : 'list-[square]';

  return (
    <li className={`${depth === 0 ? 'mb-1.5' : 'mb-0.5'}`}>
      <span className={`text-slate-800 dark:text-slate-100 ${item.highlight ? 'font-bold' : ''}`}>
        {item.label}
        {item.value && <span className="font-semibold">: {item.value}</span>}
        {item.change && (
          <span className="text-slate-400">
            {item.value ? ` (${item.change})` : `: ${item.change}`}
          </span>
        )}
      </span>
      {item.children && item.children.length > 0 && (
        <ul className={`${listStyle} ml-6 mt-0.5`}>
          {item.children.map((child, i) => (
            <BulletItem key={i} item={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
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
          {/* Company header */}
          <h4 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">
            {report.companyName} ({report.ticker})
          </h4>

          {/* Sections */}
          {report.sections.map((section, sIdx) => (
            <ul key={sIdx} className="list-disc ml-6 mb-4 text-slate-700 dark:text-slate-200">
              {section.map((item, iIdx) => (
                <BulletItem key={iIdx} item={item} />
              ))}
            </ul>
          ))}

          {/* FCF Table */}
          {report.fcfTable && (
            <div className="mt-6 mb-2">
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
        </div>
      ) : (
        <p className="text-slate-500 text-center py-4">
          {language === 'fr' ? 'Aucune donnée trimestrielle disponible pour cette action' : 'No quarterly data available for this stock'}
        </p>
      )}
    </div>
  );
}
