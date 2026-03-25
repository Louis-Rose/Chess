// Compress an image file to JPEG, resizing if larger than maxDim on either side.
// Returns a smaller File + a data URL preview.

const MAX_DIM = 2000;
const QUALITY = 0.85;

export async function compressImage(file: File): Promise<{ file: File; preview: string }> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  // Compute scale factor
  const scale = Math.min(1, MAX_DIM / Math.max(width, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: QUALITY });
  const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });

  // Generate preview data URL
  const preview = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(compressed);
  });

  return { file: compressed, preview };
}
