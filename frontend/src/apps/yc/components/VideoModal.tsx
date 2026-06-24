import { useEffect } from 'react';
import { X } from 'lucide-react';
import type { YcVideo } from '../types';

// Lightbox that plays a single video with the YouTube embed player.
export function VideoModal({ video, onClose }: { video: YcVideo; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute -top-10 right-0 flex items-center gap-1.5 text-sm text-slate-300 transition-colors hover:text-emerald-400"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
          <iframe
            className="h-full w-full"
            src={`https://www.youtube.com/embed/${video.id}?autoplay=1`}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
        <h2 className="mt-3 text-base font-semibold text-slate-100">{video.title}</h2>
      </div>
    </div>
  );
}
