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
  const [level, setLevel] = useState(1); // 1=fit, 2=large

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
      <div className="relative m-auto">
        <img
          src={src}
          alt={alt}
          onClick={(e) => { e.stopPropagation(); if (level < 2) setLevel(prev => prev + 1); }}
          className={
            level === 2
              ? 'max-w-[150vw] max-h-[150vh] rounded-xl object-contain cursor-default'
              : 'max-w-[90vw] max-h-[90vh] rounded-xl object-contain cursor-zoom-in'
          }
        />
        {overlay}
      </div>
    </div>
  );
}
