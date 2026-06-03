import { Trophy } from 'lucide-react';

// Players to track, with their last-known FIDE rapid rating. The production VM
// can't reach ratings.fide.com (FIDE blocks the datacenter IP), so ratings are
// filled in here from a manual lookup rather than fetched live. To refresh, ask
// Claude to re-run the FIDE lookup; to add a player append { name, fideId, rating }.
const ROSTER: { name: string; fideId: string; rating: number | null }[] = [
  { name: 'Jia, David', fideId: '20630034', rating: 1852 },
  { name: 'Houdard, Clément', fideId: '576014835', rating: 1642 },
  { name: 'Courau, Eloi', fideId: '560003928', rating: 1611 },
  { name: 'Tallec, Gauthier', fideId: '576029000', rating: 1541 },
  { name: 'Iwandza, Joel', fideId: '560098708', rating: 1497 },
  { name: 'Dupont, Rémi', fideId: '576007308', rating: 1460 },
  { name: 'Santini, Lauren', fideId: '560003979', rating: 1433 },
  { name: 'Rose, Louis', fideId: '560015160', rating: 1409 },
  { name: 'Teboul, Raphael', fideId: '560080809', rating: null },
];

// Rated players first (descending), unrated last.
const rows = [...ROSTER].sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));

export function FideDashboard() {
  return (
    <div className="min-h-dvh bg-slate-900 text-slate-100 font-sans p-6">
      <div className="max-w-3xl mx-auto">
        <header className="flex items-center justify-center gap-3 mb-1">
          <Trophy className="w-7 h-7 text-emerald-400" />
          <h1 className="text-2xl font-semibold">FIDE rankings</h1>
        </header>
        <p className="text-slate-400 text-sm mb-6 text-center">Players ranked by their FIDE rapid rating.</p>

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
                    {row.rating != null
                      ? <span className="text-slate-100">{row.rating}</span>
                      : <span className="text-slate-500">Not rated</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
