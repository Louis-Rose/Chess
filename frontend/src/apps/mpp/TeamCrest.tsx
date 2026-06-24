import { useEffect, useState } from 'react';
import { Flag } from 'lucide-react';

// A team crest that degrades to a neutral badge when the image is missing or
// 404s (some MPP clubs have no logo), instead of a broken-image icon.
export function TeamCrest({ src, className = 'h-7 w-7' }: { src: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);

  // Reset when the source changes (e.g. list re-renders with a new team).
  useEffect(() => setFailed(false), [src]);

  if (!src || failed) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center rounded-full bg-slate-700 text-slate-400 ${className}`}
      >
        <Flag className="h-1/2 w-1/2" />
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      onError={() => setFailed(true)}
      className={`shrink-0 rounded-full object-cover ${className}`}
    />
  );
}
