import type { TopArtist, TopTrack } from '../types';
import { formatCount } from '../format';
import { AlbumArt } from './AlbumArt';

function PlayCount({ n }: { n: number }) {
  return (
    <span className="shrink-0 text-xs text-slate-500">
      {formatCount(n)} {n === 1 ? 'play' : 'plays'}
    </span>
  );
}

function Rank({ i }: { i: number }) {
  return (
    <span className="w-5 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-500">
      {i + 1}
    </span>
  );
}

// Most-played tracks, ranked.
export function TopTracks({ tracks }: { tracks: TopTrack[] }) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-800/40 p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Top tracks
      </h2>
      {tracks.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">Nothing logged yet.</p>
      ) : (
        <ul className="space-y-1">
          {tracks.map((t, i) => (
            <li key={t.id} className="flex items-center gap-3 py-1.5">
              <Rank i={i} />
              <AlbumArt url={t.image_url} alt={t.track_name} size="h-10 w-10" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-slate-100">{t.track_name}</div>
                <div className="truncate text-sm text-slate-400">{t.artists}</div>
              </div>
              <PlayCount n={t.play_count} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Most-played artists, ranked.
export function TopArtists({ artists }: { artists: TopArtist[] }) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-800/40 p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Top artists
      </h2>
      {artists.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">Nothing logged yet.</p>
      ) : (
        <ul className="space-y-1">
          {artists.map((a, i) => (
            <li key={a.id} className="flex items-center gap-3 py-2">
              <Rank i={i} />
              <span className="min-w-0 flex-1 truncate font-medium text-slate-100">
                {a.artist_name}
              </span>
              <PlayCount n={a.play_count} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
