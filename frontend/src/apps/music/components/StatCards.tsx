import { Disc3, ListMusic, Mic2, Clock } from 'lucide-react';
import type { MusicStats } from '../types';
import { formatCount, formatListeningTime } from '../format';

// The four headline counters at the top of the dashboard.
export function StatCards({ stats }: { stats: MusicStats }) {
  const cards = [
    { label: 'Plays', value: formatCount(stats.total_plays), Icon: ListMusic },
    { label: 'Tracks', value: formatCount(stats.distinct_tracks), Icon: Disc3 },
    { label: 'Artists', value: formatCount(stats.distinct_artists), Icon: Mic2 },
    { label: 'Listening time', value: formatListeningTime(stats.total_ms_played), Icon: Clock },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map(({ label, value, Icon }) => (
        <div
          key={label}
          className="rounded-2xl border border-slate-800 bg-slate-800/40 p-4"
        >
          <div className="flex items-center gap-2 text-slate-400">
            <Icon className="h-4 w-4 text-emerald-400" strokeWidth={1.75} />
            <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-100">{value}</div>
        </div>
      ))}
    </div>
  );
}
