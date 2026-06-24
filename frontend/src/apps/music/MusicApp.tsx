import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { SidebarLayout } from '../../components/SidebarLayout';
import type { MusicOverview } from './types';
import { StatCards } from './components/StatCards';
import { ActivityChart } from './components/ActivityChart';
import { RecentPlays } from './components/RecentPlays';
import { TopTracks, TopArtists } from './components/TopLists';

// Public listening dashboard at /music. Reads the memory trace collected by the
// standalone my-music Spotify daemon via GET /api/music/overview. No auth.
export function MusicApp() {
  const [data, setData] = useState<MusicOverview | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = 'Music | LUMNA';
  }, []);

  useEffect(() => {
    let active = true;
    axios
      .get<MusicOverview>('/api/music/overview')
      .then((r) => {
        if (!active) return;
        setData(r.data);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError(true);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-slate-900">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-emerald-500" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-slate-900 px-6 text-center">
        <p className="text-slate-300">Could not load the listening history.</p>
        <Link to="/" className="text-sm text-emerald-400 hover:underline">
          Back to LUMNA
        </Link>
      </div>
    );
  }

  const isEmpty = data.stats.total_plays === 0;

  return (
    <SidebarLayout title="Music">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        {isEmpty ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-10 text-center">
            <p className="text-slate-300">No listening history yet.</p>
            <p className="mt-1 text-sm text-slate-500">
              Start playing something on Spotify — the tracker logs it within a minute.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <StatCards stats={data.stats} />
            <ActivityChart activity={data.activity} />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <TopTracks tracks={data.top_tracks} />
              <TopArtists artists={data.top_artists} />
            </div>

            <RecentPlays plays={data.recent} />
          </div>
        )}
      </div>
    </SidebarLayout>
  );
}
