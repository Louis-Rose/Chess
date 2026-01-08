// Shared utilities for Portfolio components

// Format number with wider spacing for EUR (e.g., "1 234 567")
export const formatEur = (num: number): string => {
  return Math.round(num).toLocaleString('fr-FR').replace(/\u202F/g, ' ');
};

// Add LUMRA branding to an image
export const addLumraBranding = async (dataUrl: string, bottomOffset = 20): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;

      // Draw the original image
      ctx.drawImage(img, 0, 0);

      // Add LUMRA branding in bottom-right corner
      const padding = 20;
      const logoSize = 36;
      const fontSize = 20;
      const brandingWidth = logoSize + 10 + 70; // logo + gap + text width
      const x = canvas.width - brandingWidth - padding;
      const y = canvas.height - logoSize - bottomOffset;

      // Draw logo background (green rounded rect - matching favicon)
      ctx.fillStyle = '#16a34a';
      ctx.beginPath();
      ctx.roundRect(x, y, logoSize, logoSize, logoSize * 0.18); // ~18% corner radius like favicon
      ctx.fill();

      // Draw bar chart icon (3 white bars matching favicon proportions)
      // Favicon: bars at x=32,56,80 out of 128, heights 40,56,72 from bottom
      const scale = logoSize / 128;
      const barWidth = 16 * scale;
      const barRadius = 2 * scale;
      const baseY = y + logoSize - 24 * scale; // bottom padding
      ctx.fillStyle = 'white';

      // Left bar (shortest)
      ctx.beginPath();
      ctx.roundRect(x + 32 * scale, baseY - 40 * scale, barWidth, 40 * scale, barRadius);
      ctx.fill();

      // Middle bar
      ctx.beginPath();
      ctx.roundRect(x + 56 * scale, baseY - 56 * scale, barWidth, 56 * scale, barRadius);
      ctx.fill();

      // Right bar (tallest)
      ctx.beginPath();
      ctx.roundRect(x + 80 * scale, baseY - 72 * scale, barWidth, 72 * scale, barRadius);
      ctx.fill();

      // Draw LUMRA text
      ctx.fillStyle = '#1e293b';
      ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText('LUMRA', x + logoSize + 10, y + logoSize / 2);

      resolve(canvas.toDataURL('image/png'));
    };
    img.src = dataUrl;
  });
};

// Private mode scale factor calculation
export const PRIVATE_COST_BASIS = 10000;

export const getScaleFactor = (actualCostBasis: number, privateMode: boolean): number => {
  return privateMode && actualCostBasis > 0 ? PRIVATE_COST_BASIS / actualCostBasis : 1;
};
