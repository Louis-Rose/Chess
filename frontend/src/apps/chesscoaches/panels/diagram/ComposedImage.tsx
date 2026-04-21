// Bake region overlay onto the image via canvas, so browser-native
// "Copy image" / "Open image in new tab" returns the composite.

import { useEffect, useRef } from 'react';

export interface ComposedRegionBox { x: number; y: number; width: number; height: number; }
export interface ComposedRegion extends ComposedRegionBox {
  diagram_number?: number | null;
}

const REGION_COLORS = [
  'rgba(99,102,241,0.7)',   // indigo
  'rgba(168,85,247,0.7)',   // purple
  'rgba(20,184,166,0.7)',   // teal
  'rgba(245,158,11,0.7)',   // amber
  'rgba(239,68,68,0.7)',    // red
  'rgba(34,197,94,0.7)',    // green
  'rgba(59,130,246,0.7)',   // blue
  'rgba(236,72,153,0.7)',   // pink
];

interface Props {
  src: string;
  regions?: ComposedRegion[];
  className?: string;
  onClick?: () => void;
}

export function ComposedImage({ src, regions, className, onClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!src) return;
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      if (!regions || regions.length === 0) return;

      const strokeW = Math.max(2, img.naturalWidth * 0.004);
      const fontSize = Math.max(14, img.naturalWidth * 0.02);
      ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
      ctx.textBaseline = 'top';

      regions.forEach((r, i) => {
        const color = REGION_COLORS[i % REGION_COLORS.length];
        const x = (r.x / 100) * canvas.width;
        const y = (r.y / 100) * canvas.height;
        const w = (r.width / 100) * canvas.width;
        const h = (r.height / 100) * canvas.height;
        ctx.strokeStyle = color;
        ctx.lineWidth = strokeW;
        ctx.strokeRect(x, y, w, h);
        const label = typeof r.diagram_number === 'number' ? String(r.diagram_number) : String(i + 1);
        ctx.fillStyle = color;
        ctx.fillText(label, x + strokeW, y + strokeW * 0.5);
      });
    };
    img.src = src;
  }, [src, regions]);
  return <canvas ref={canvasRef} className={className} onClick={onClick} />;
}
