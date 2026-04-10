import React, { useCallback, useEffect, useState } from 'react';

interface ImageZoomModalProps {
  src: string;
  alt?: string;
  onClose: () => void;
  /** Extra content to overlay on the image at zoom (e.g. highlight box) */
  overlay?: React.ReactNode;
}

/**
 * Full-screen image zoom modal.
 * Click image to zoom in (2 levels), click backdrop or zoomed-out to close.
 * Escape key closes.
 */
export function ImageZoomModal({ src, alt = 'Image', onClose, overlay }: ImageZoomModalProps) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const maxLevel = isMobile ? 2 : 3;
  const [level, setLevel] = useState(1); // 1=fit, 2=large, 3=extra large (desktop only)

  const handleBackdrop = useCallback(() => {
    if (level > 1) setLevel(prev => prev - 1);
    else onClose();
  }, [level, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={handleBackdrop}
      className="fixed inset-0 md:left-56 2xl:left-64 z-50 bg-slate-900/60 backdrop-blur-[2px] cursor-zoom-out overflow-auto p-4 flex"
    >
      <div
        className="relative m-auto"
        onClick={(e) => { e.stopPropagation(); if (level < maxLevel) setLevel(prev => prev + 1); }}
      >
        <img
          src={src}
          alt={alt}
          className={`rounded-xl object-contain ${level < maxLevel ? 'cursor-zoom-in' : 'cursor-default'} ${
            level === 1
              ? 'max-w-[90vw] max-h-[90vh]'
              : level === 2
                ? 'max-w-[120vw] max-h-[120vh]'
                : 'max-w-[180vw] max-h-[180vh]'
          }`}
        />
        {overlay}
      </div>
    </div>
  );
}
