import axios from 'axios';
import * as pdfjsLib from 'pdfjs-dist';
import { renderPdfPageToImage } from './pdfRender';

// Étape 3 helpers: brand detection, web image search, and persistence of the
// detected brand (keyed by document).

export type ImageHit = { url: string; thumbnail: string; title: string; context: string; source: string };

const brandKey = (docId: string) => `notice.brand.${docId}`;

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

// Persist each part's search results + kept/discarded verdicts per document, so
// switching parts and coming back restores them (no re-search, no extra credit).
export type PartImagesResult = { candidates: ImageHit[]; kept: boolean[] };
const resultsKey = (docId: string) => `notice.realImages.${docId}`;

export function loadResults(docId: string): Record<string, PartImagesResult> {
  try {
    const raw = localStorage.getItem(resultsKey(docId));
    const obj = raw ? (JSON.parse(raw) as Record<string, PartImagesResult>) : {};
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

export function loadResult(docId: string, ref: string): PartImagesResult | undefined {
  return loadResults(docId)[ref];
}

export function saveResult(docId: string, ref: string, result: PartImagesResult) {
  try {
    const all = loadResults(docId);
    all[ref] = result;
    localStorage.setItem(resultsKey(docId), JSON.stringify(all));
  } catch {
    // ignore (e.g. quota); the in-memory state still works for this session
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

// Ask Gemini Flash-Lite which candidates are real photos of the actual part.
// Returns a keep boolean per thumbnail (same order); empty on failure so the
// caller can fall back to keeping everything. `refImage` is the part's drawing.
export async function filterPartImages(
  thumbnails: string[],
  ref: string,
  brand: string,
  refImage: string | null,
): Promise<boolean[]> {
  const { data } = await axios.post<{ keep: boolean[] }>('/api/notice/filter-images', {
    thumbnails,
    ref,
    brand,
    refImage,
  });
  return data.keep || [];
}
