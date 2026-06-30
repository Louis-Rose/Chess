import axios from 'axios';
import * as pdfjsLib from 'pdfjs-dist';
import { renderPdfPageToImage } from './pdfRender';

// Étape 3 helpers: brand detection, web image search, and persistence of the
// detected brand and the user's chosen image per part (keyed by reference).

export type ImageHit = { url: string; thumbnail: string; title: string; context: string };

const brandKey = (docId: string) => `notice.brand.${docId}`;
const chosenKey = (docId: string) => `notice.partImages.${docId}`;

export function loadBrand(docId: string): string {
  try {
    return localStorage.getItem(brandKey(docId)) || '';
  } catch {
    return '';
  }
}

export function saveBrand(docId: string, brand: string) {
  try {
    localStorage.setItem(brandKey(docId), brand);
  } catch {
    // ignore
  }
}

export function loadChosen(docId: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(chosenKey(docId));
    const obj = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

export function saveChosen(docId: string, chosen: Record<string, string>) {
  try {
    localStorage.setItem(chosenKey(docId), JSON.stringify(chosen));
  } catch {
    // ignore
  }
}

// Render the cover (page 1) and ask the model for the manual's brand.
export async function detectBrand(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  const task = pdfjsLib.getDocument({ data: buf });
  const doc = await task.promise;
  try {
    const image = await renderPdfPageToImage(doc, 1, 1100);
    if (!image) return '';
    const { data } = await axios.post<{ brand: string }>('/api/notice/brand', { image });
    return (data.brand || '').trim();
  } finally {
    void task.destroy();
  }
}

// Search real photos of a part by reference, qualified by the brand.
export async function searchPartImages(ref: string, brand: string): Promise<ImageHit[]> {
  const { data } = await axios.get<{ images: ImageHit[] }>('/api/notice/part-images', {
    params: { ref, brand },
  });
  return data.images || [];
}
