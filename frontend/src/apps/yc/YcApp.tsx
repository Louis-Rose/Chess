import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { AppHeader } from '../../components/AppHeader';
import type { YcVideo, YcVideosResponse } from './types';
import { VideoGrid } from './components/VideoGrid';
import { VideoModal } from './components/VideoModal';

// Public page at /yc. Shows the latest Y Combinator YouTube uploads, fetched
// (and cached) server-side from the channel's Atom feed via GET /api/yc/videos.
// No auth.
export function YcApp() {
  const [videos, setVideos] = useState<YcVideo[] | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<YcVideo | null>(null);

  useEffect(() => {
    document.title = 'YC Advisor | LUMNA';
  }, []);

  useEffect(() => {
    let alive = true;
    axios
      .get<YcVideosResponse>('/api/yc/videos')
      .then((r) => {
        if (!alive) return;
        setVideos(r.data.videos);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setError(true);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-[#0f0f0f]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-emerald-500" />
      </div>
    );
  }

  if (error || !videos) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-[#0f0f0f] px-6 text-center">
        <p className="text-slate-300">Could not load the videos.</p>
        <Link to="/" className="text-sm text-emerald-400 hover:underline">
          Back to LUMNA
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#0f0f0f] text-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <AppHeader title="YC Advisor" />

        {videos.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-10 text-center">
            <p className="text-slate-300">No videos available right now.</p>
            <p className="mt-1 text-sm text-slate-500">Check back in a little while.</p>
          </div>
        ) : (
          <VideoGrid videos={videos} onPlay={setActive} />
        )}
      </div>

      {active && <VideoModal video={active} onClose={() => setActive(null)} />}
    </div>
  );
}
