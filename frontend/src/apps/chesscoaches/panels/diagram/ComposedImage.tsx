// Bake region overlay onto the image via canvas, so browser-native
// "Copy image" / "Open image in new tab" returns the composite.

import { useEffect, useRef } from 'react';

export interface ComposedRegionBox { x: number; y: number; width: number; height: number; }
export interface ComposedRegion extends ComposedRegionBox {
  diagram_number?: number | null;
}

// Shared palette used for Phase 1 region boxes on the whole-page preview AND
// the Phase 2 grid overlay on each per-diagram crop, so one diagram's box and
// its grid share a color.
export const REGION_RGB: [number, number, number][] = [
  [99, 102, 241],   // indigo
  [168, 85, 247],   // purple
  [20, 184, 166],   // teal
  [245, 158, 11],   // amber
  [239, 68, 68],    // red
  [34, 197, 94],    // green
  [59, 130, 246],   // blue
  [236, 72, 153],   // pink
];

export function regionColor(index: number, alpha = 1): string {
  const [r, g, b] = REGION_RGB[((index % REGION_RGB.length) + REGION_RGB.length) % REGION_RGB.length];
  return `rgba(${r},${g},${b},${alpha})`;
}

const REGION_COLORS = REGION_RGB.map(([r, g, b]) => `rgba(${r},${g},${b},0.7)`);

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
