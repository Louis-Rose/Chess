import type { RecentPlay } from '../types';
import { timeAgo } from '../format';
import { AlbumArt } from './AlbumArt';

// Reverse-chronological feed of the latest listens.
export function RecentPlays({ plays }: { plays: RecentPlay[] }) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-800/40 p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Recently played
      </h2>

      {plays.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">Nothing logged yet.</p>
      ) : (
        <ul className="divide-y divide-slate-800">
          {plays.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2.5">
              <AlbumArt url={p.image_url} alt={p.track_name} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-slate-100">{p.track_name}</div>
                <div className="truncate text-sm text-slate-400">{p.artists}</div>
              </div>
              <span className="shrink-0 text-xs text-slate-500">{timeAgo(p.played_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
