import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Trophy, Loader2 } from 'lucide-react';

// Players to track. Add one by appending { name, fideId }.
const ROSTER: { name: string; fideId: string }[] = [
  { name: 'Tallec, Gauthier', fideId: '576029000' },
  { name: 'Rose, Louis', fideId: '560015160' },
  { name: 'Santini, Lauren', fideId: '560003979' },
  { name: 'Jia, David', fideId: '20630034' },
  { name: 'Houdard, Clément', fideId: '576014835' },
  { name: 'Dupont, Rémi', fideId: '576007308' },
  { name: 'Teboul, Raphael', fideId: '560080809' },
  { name: 'Courau, Eloi', fideId: '560003928' },
];

const DEFAULT_RATING = 1400; // provisional, replaced once a real rating is fetched
const STORAGE_KEY = 'fide-rapid-ratings-v1';

// Last-known rating per FIDE ID, kept in localStorage so the table fills in
// instantly on revisit while a fresh fetch updates it in the background.
type Cache = Record<string, { rating: number; real: boolean }>;

function loadCache(): Cache {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function saveCache(cache: Cache) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // storage unavailable — ratings just won't persist across reloads
  }
}

// Everyone starts provisional at 1400 unless we already have a saved value.
function seed(cache: Cache): Cache {
  const next: Cache = {};
  for (const p of ROSTER) next[p.fideId] = cache[p.fideId] ?? { rating: DEFAULT_RATING, real: false };
  return next;
}

export function FideDashboard() {
  const [ratings, setRatings] = useState<Cache>(() => {
    const seeded = seed(loadCache());
    saveCache(seeded);
    return seeded;
  });
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    setUpdating(true);
    const ids = ROSTER.map(p => p.fideId).join(',');
    axios.get<{ players: { fide_id: string; rapid_rating: number | null }[] }>(
      `/api/chess/fide-rankings?ids=${encodeURIComponent(ids)}`,
    )
      .then(r => {
        setRatings(prev => {
          const next = { ...prev };
          for (const p of r.data.players ?? []) {
            if (p.rapid_rating != null) next[p.fide_id] = { rating: p.rapid_rating, real: true };
          }
          saveCache(next);
          return next;
        });
      })
      .catch(() => { /* keep last-known ratings on failure */ })
      .finally(() => setUpdating(false));
  }, []);

  const rows = useMemo(() => (
    ROSTER
      .map(p => ({ ...p, ...(ratings[p.fideId] ?? { rating: DEFAULT_RATING, real: false }) }))
      .sort((a, b) => b.rating - a.rating)
  ), [ratings]);

  return (
    <div className="min-h-dvh bg-slate-900 text-slate-100 font-sans p-6">
      <div className="max-w-3xl mx-auto">
        <header className="flex items-center justify-center gap-3 mb-1">
          <Trophy className="w-7 h-7 text-emerald-400" />
          <h1 className="text-2xl font-semibold">FIDE rankings</h1>
        </header>
        <p className="text-slate-400 text-sm mb-6 flex items-center justify-center gap-2">
          Players ranked by their FIDE rapid rating.
          {updating && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" />}
        </p>

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
              {rows.map((row, i) => (
                <tr key={row.fideId} className="border-t border-slate-700/70 hover:bg-slate-800/40">
                  <td className="py-2.5 px-3 text-center font-mono text-slate-300">#{i + 1}</td>
                  <td className="py-2.5 px-3">
                    <a
                      href={`https://ratings.fide.com/profile/${row.fideId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-100 hover:text-emerald-400 transition-colors"
                    >
                      {row.name}
                    </a>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-400 text-sm">{row.fideId}</td>
                  <td className="py-2.5 px-3 text-right font-mono">
                    <span className={row.real ? 'text-slate-100' : 'text-slate-500 italic'}>{row.rating}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-slate-600 text-xs mt-3 text-center">
          Greyed 1400 ratings are provisional and get replaced once a live FIDE rating is fetched.
        </p>
      </div>
    </div>
  );
}
