import { Music2 } from 'lucide-react';

// Album thumbnail with a graceful fallback when no cover art is available.
export function AlbumArt({
  url,
  alt,
  size = 'h-12 w-12',
}: {
  url: string | null;
  alt: string;
  size?: string;
}) {
  if (!url) {
    return (
      <div
        className={`${size} flex shrink-0 items-center justify-center rounded-md bg-slate-700/60`}
      >
        <Music2 className="h-5 w-5 text-slate-500" strokeWidth={1.75} />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      className={`${size} shrink-0 rounded-md object-cover`}
    />
  );
}
