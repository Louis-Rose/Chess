import { Play } from 'lucide-react';
import type { YcVideo } from '../types';

// Relative "3 days ago" style label; falls back to a date for older items.
function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.max(0, (Date.now() - then) / 1000);
  const units: [number, string][] = [
    [60, 'second'],
    [60, 'minute'],
    [24, 'hour'],
    [7, 'day'],
    [4.345, 'week'],
    [12, 'month'],
  ];
  let value = secs;
  for (const [step, name] of units) {
    if (value < step) {
      const n = Math.floor(value);
      return `${n} ${name}${n === 1 ? '' : 's'} ago`;
    }
    value /= step;
  }
  const years = Math.floor(value);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

function formatViews(views: number | null): string | null {
  if (views == null) return null;
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M views`;
  if (views >= 1_000) return `${(views / 1_000).toFixed(0)}K views`;
  return `${views} views`;
}

function VideoCard({ video, onPlay }: { video: YcVideo; onPlay: () => void }) {
  const views = formatViews(video.views);
  const ago = timeAgo(video.published);
  const meta = [views, ago].filter(Boolean).join(' · ');

  return (
    <button
      onClick={onPlay}
      className="group flex flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-800/40 text-left transition-colors hover:border-emerald-500"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-[#0f0f0f]">
        <img
          src={video.thumbnail}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/90 opacity-0 transition-opacity group-hover:opacity-100">
            <Play className="h-5 w-5 translate-x-0.5 text-white" fill="currentColor" />
          </span>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 text-sm font-semibold text-slate-100">{video.title}</h3>
        {meta && <p className="text-xs text-slate-500">{meta}</p>}
      </div>
    </button>
  );
}

export function VideoGrid({
  videos,
  onPlay,
}: {
  videos: YcVideo[];
  onPlay: (video: YcVideo) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {videos.map((v) => (
        <VideoCard key={v.id} video={v} onPlay={() => onPlay(v)} />
      ))}
    </div>
  );
}
