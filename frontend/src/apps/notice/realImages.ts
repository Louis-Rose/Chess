import axios from 'axios';
import * as pdfjsLib from 'pdfjs-dist';
import { renderPdfPageToImage } from './pdfRender';

// Étape 3 helpers: brand detection, web image search, and persistence of the
// detected brand (keyed by document).

export type ImageHit = { url: string; thumbnail: string; title: string; context: string; source: string };

// General info read off the manual's cover page. `brand` qualifies the part
// image search; `time` / `people` are shown when the page states them (often
// absent, hence empty strings). Persisted as one object per document.
// `reasoning` / `raw` are the model's thought summary and raw reply, surfaced in
// a hover tooltip (same as the categories table) so the extraction is inspectable.
export type NoticeInfo = { brand: string; time: string; people: string; reasoning: string; raw: string };
const emptyInfo = (): NoticeInfo => ({ brand: '', time: '', people: '', reasoning: '', raw: '' });

const infoKey = (docId: string) => `notice.info.${docId}`;
const legacyBrandKey = (docId: string) => `notice.brand.${docId}`;

export function loadInfo(docId: string): NoticeInfo {
  try {
    const raw = localStorage.getItem(infoKey(docId));
    if (raw) {
      const o = JSON.parse(raw) as Partial<NoticeInfo>;
      return {
        brand: o.brand || '',
        time: o.time || '',
        people: o.people || '',
        reasoning: o.reasoning || '',
        raw: o.raw || '',
      };
    }
    // Fall back to the older brand-only key so a previously detected brand survives.
    return { ...emptyInfo(), brand: localStorage.getItem(legacyBrandKey(docId)) || '' };
  } catch {
    return emptyInfo();
  }
}

export function saveInfo(docId: string, info: NoticeInfo) {
  try {
    localStorage.setItem(infoKey(docId), JSON.stringify(info));
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

// Render the cover (page 1) and ask the model for the manual's general info
// (brand, plus estimated time and number of people when the page states them).
export async function detectInfo(file: Blob): Promise<NoticeInfo> {
  const buf = await file.arrayBuffer();
  const task = pdfjsLib.getDocument({ data: buf });
  const doc = await task.promise;
  try {
    const image = await renderPdfPageToImage(doc, 1, 1100);
    if (!image) return emptyInfo();
    const { data } = await axios.post<Partial<NoticeInfo>>('/api/notice/brand', { image });
    return {
      brand: (data.brand || '').trim(),
      time: (data.time || '').trim(),
      people: (data.people || '').trim(),
      reasoning: data.reasoning || '',
      raw: data.raw || '',
    };
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
