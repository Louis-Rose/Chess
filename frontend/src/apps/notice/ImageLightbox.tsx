import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

// A full-screen image zoom overlay: click the backdrop, the close button, or
// press Escape to dismiss. Shared by the parts table (PIÈCE crops) and Étape 3's
// candidate web images, so every Notice image zooms the same way. Renders
// nothing when `src` is null.
export function ImageLightbox({
  src,
  alt,
  onClose,
}: {
  src: string | null;
  alt?: string;
  onClose: () => void;
}) {
  const { t } = useLanguage();

  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [src, onClose]);

  if (!src) return null;
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/80 p-4"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={t('notice.pdf.close')}
        className="absolute right-4 top-4 cursor-pointer rounded-lg border border-slate-600 bg-slate-800/80 p-2 text-slate-200 transition-colors hover:bg-slate-700"
      >
        <X className="h-5 w-5" />
      </button>
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] max-w-[90vw] cursor-default rounded-lg bg-white shadow-2xl"
      />
    </div>
  );
}
