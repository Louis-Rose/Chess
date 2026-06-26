import { useEffect, useState } from 'react';
import axios from 'axios';
import { TeamCrest } from './TeamCrest';
import { MppPageTitle } from './MppPageTitle';
import { useLanguage } from '../../contexts/LanguageContext';
import { countryName } from './mppLocale';
import type { MppCoteCell, MppTestMatch, MppTests } from './types';

// Algorithme tab: pulls the same data as Matchs - Tout and flattens every
// upcoming match into a single table of its latest cotes and probabilities.

const pct = (v: number | null) => (v == null ? '.' : `${Math.round(v * 100)}%`);
const num = (v: number | null) => (v == null ? '.' : `${v}`);

// Most recent snapshot for a match (columns are oldest-first).
function latestCell(m: MppTestMatch, columns: string[]): MppCoteCell | undefined {
  for (let i = columns.length - 1; i >= 0; i--) {
    const cell = m.cells[columns[i]];
    if (cell) return cell;
  }
  return undefined;
}

export function MppAlgorithm() {
  const { t, language } = useLanguage();
  const [data, setData] = useState<MppTests | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    axios
      .get<MppTests>('/api/mpp/tests')
      .then((r) => active && setData(r.data))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, []);

  const rows = (data?.matches ?? [])
    .map((m) => ({ match: m, cell: latestCell(m, data!.columns) }))
    .filter((r): r is { match: MppTestMatch; cell: MppCoteCell } => r.cell != null);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <div className="mb-5">
        <MppPageTitle />
      </div>

      {error ? (
        <p className="py-12 text-center text-sm text-slate-500">{t('mpp.tests.empty')}</p>
      ) : data === null ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-500">{t('mpp.tests.empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-slate-700 text-center text-sm">
            <thead className="bg-slate-800/60 text-slate-300">
              <tr>
                <th rowSpan={2} className="border border-slate-700 px-3 py-2 font-medium">
                  {t('mpp.tests.match')}
                </th>
                <th colSpan={3} className="border border-slate-700 px-3 py-2 font-medium">
                  {t('mpp.tests.odds')}
                </th>
                <th colSpan={3} className="border border-slate-700 px-3 py-2 font-medium">
                  {t('mpp.tests.probability')}
                </th>
              </tr>
              <tr className="text-xs text-slate-400">
                {['1', 'N', '2', '1', 'N', '2'].map((h, i) => (
                  <th key={i} className="border border-slate-700 px-3 py-1.5 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ match: m, cell }) => (
                <tr key={m.match_id}>
                  <td className="border border-slate-700 px-3 py-2 text-left">
                    <Team crest={m.home_crest} name={m.home} language={language} />
                    <Team crest={m.away_crest} name={m.away} language={language} />
                  </td>
                  <td className="border border-slate-700 px-3 py-2 font-mono">{num(cell.cote.home)}</td>
                  <td className="border border-slate-700 px-3 py-2 font-mono">{num(cell.cote.draw)}</td>
                  <td className="border border-slate-700 px-3 py-2 font-mono">{num(cell.cote.away)}</td>
                  <td className="border border-slate-700 px-3 py-2 font-mono text-slate-400">{pct(cell.prono.home)}</td>
                  <td className="border border-slate-700 px-3 py-2 font-mono text-slate-400">{pct(cell.prono.draw)}</td>
                  <td className="border border-slate-700 px-3 py-2 font-mono text-slate-400">{pct(cell.prono.away)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Team({
  crest,
  name,
  language,
}: {
  crest: string | null;
  name: string | null;
  language: string;
}) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap font-semibold text-slate-100">
      <TeamCrest src={crest} className="h-4 w-4" />
      {name ? countryName(name, language) : '?'}
    </span>
  );
}

function Spinner() {
  return (
    <div className="flex h-40 items-center justify-center">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-700 border-t-emerald-500" />
    </div>
  );
}
