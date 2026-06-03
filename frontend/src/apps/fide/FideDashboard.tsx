import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Trophy } from 'lucide-react';

type TimeClass = 'classical' | 'rapid' | 'blitz';

interface FidePlayer {
  fide_id: string;
  name: string | null;
  federation: string | null;
  fide_title: string | null;
  classical_rating: number | null;
  rapid_rating: number | null;
  blitz_rating: number | null;
}

const TIME_CLASSES: { key: TimeClass; label: string }[] = [
  { key: 'classical', label: 'Standard' },
  { key: 'rapid', label: 'Rapid' },
  { key: 'blitz', label: 'Blitz' },
];

// FIDE federation codes are 3-letter; flag emoji needs the 2-letter ISO code.
const FED_TO_ISO: Record<string, string> = {
  FRA: 'FR', USA: 'US', GER: 'DE', ENG: 'GB', RUS: 'RU', ESP: 'ES', ITA: 'IT',
  NED: 'NL', NOR: 'NO', SWE: 'SE', POL: 'PL', CZE: 'CZ', HUN: 'HU', ROU: 'RO',
  UKR: 'UA', GEO: 'GE', ARM: 'AM', AZE: 'AZ', IND: 'IN', CHN: 'CN', JPN: 'JP',
  KOR: 'KR', AUS: 'AU', CAN: 'CA', BRA: 'BR', ARG: 'AR', ISR: 'IL', TUR: 'TR',
  GRE: 'GR', POR: 'PT', BEL: 'BE', SUI: 'CH', AUT: 'AT', DEN: 'DK', FIN: 'FI',
  IRL: 'IE', CRO: 'HR', SRB: 'RS', BUL: 'BG', SVK: 'SK', SLO: 'SI', LTU: 'LT',
  LAT: 'LV', EST: 'EE', ISL: 'IS', MEX: 'MX', COL: 'CO', PER: 'PE', CHI: 'CL',
  CUB: 'CU', PHI: 'PH', INA: 'ID', VIE: 'VN', IRI: 'IR', EGY: 'EG', RSA: 'ZA',
  MAR: 'MA', NZL: 'NZ', UZB: 'UZ', KAZ: 'KZ',
};

function federationToFlag(federation: string | null): string {
  if (!federation) return '';
  const iso = FED_TO_ISO[federation.toUpperCase()] || federation.slice(0, 2);
  return String.fromCodePoint(...[...iso.toUpperCase()].map(c => 0x1f1e6 + c.charCodeAt(0) - 65));
}

function ratingFor(p: FidePlayer, tc: TimeClass): number | null {
  return p[`${tc}_rating`];
}

export function FideDashboard() {
  const [players, setPlayers] = useState<FidePlayer[]>([]);
  const [timeClass, setTimeClass] = useState<TimeClass>('rapid');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get<{ players: FidePlayer[] }>('/api/chess/fide-rankings')
      .then(r => setPlayers(r.data.players ?? []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  // Rated players ranked by the selected time control (descending); unrated
  // players fall to the bottom and share one rank.
  const ranked = useMemo(() => {
    const rows = [...players].sort((a, b) => {
      const ra = ratingFor(a, timeClass);
      const rb = ratingFor(b, timeClass);
      if (ra != null && rb != null) return rb - ra;
      if (ra != null) return -1;
      if (rb != null) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });
    const ratedCount = rows.filter(r => ratingFor(r, timeClass) != null).length;
    return rows.map((row, i) => ({
      row,
      rank: ratingFor(row, timeClass) != null ? i + 1 : ratedCount + 1,
    }));
  }, [players, timeClass]);

  return (
    <div className="min-h-dvh bg-slate-900 text-slate-100 font-sans p-6">
      <div className="max-w-3xl mx-auto">
        <header className="flex items-center gap-3 mb-1">
          <Trophy className="w-7 h-7 text-emerald-400" />
          <h1 className="text-2xl font-semibold">FIDE rankings</h1>
        </header>
        <p className="text-slate-400 text-sm mb-6">
          Players ranked by their FIDE rating.
          {players.length > 0 && <> {players.length} player{players.length === 1 ? '' : 's'} tracked.</>}
        </p>

        <div className="inline-flex rounded-lg border border-slate-700 bg-slate-800/50 p-1 mb-6">
          {TIME_CLASSES.map(tc => (
            <button
              key={tc.key}
              onClick={() => setTimeClass(tc.key)}
              className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                timeClass === tc.key ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              {tc.label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="h-64 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-slate-700 border-t-emerald-500 rounded-full animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6 text-center text-slate-400 text-sm">
            Could not load FIDE ratings. Try again later.
          </div>
        )}

        {!loading && !error && (
          <div className="overflow-hidden rounded-lg border border-slate-700">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-800 text-slate-300 text-xs uppercase tracking-wide">
                  <th className="text-center py-2.5 px-3 font-medium w-14">Rank</th>
                  <th className="text-left py-2.5 px-3 font-medium">Player</th>
                  <th className="text-left py-2.5 px-3 font-medium">FIDE ID</th>
                  <th className="text-right py-2.5 px-3 font-medium">Rating</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map(({ row, rank }) => {
                  const rating = ratingFor(row, timeClass);
                  return (
                    <tr key={row.fide_id} className="border-t border-slate-700/70 hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 text-center font-mono text-slate-300">#{rank}</td>
                      <td className="py-2.5 px-3">
                        <a
                          href={`https://ratings.fide.com/profile/${row.fide_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-100 hover:text-emerald-400 transition-colors"
                        >
                          <span className="mr-1.5">{federationToFlag(row.federation)}</span>
                          {row.fide_title && row.fide_title !== 'None' && (
                            <span className="text-amber-400 font-medium mr-1">{row.fide_title}</span>
                          )}
                          {row.name || row.fide_id}
                        </a>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-400 text-sm">{row.fide_id}</td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        {rating != null ? (
                          <span className="text-slate-100">{rating}</span>
                        ) : (
                          <span className="text-slate-500">Not rated</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {ranked.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-500 text-sm">
                      No players tracked yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
