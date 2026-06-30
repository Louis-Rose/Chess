// Models offered for page categorization. Ids must stay in sync with the
// backend allowlist (blueprints/notice.py, which validates independently) and
// the admin GEMINI_PRICING table so usage cost is tracked.
export interface NoticeModel {
  id: string;
  label: string;
  // Color identifying the model in shared UI (e.g. the section-boundary lines
  // drawn on the PDF). Hex so it can feed inline canvas/SVG styles directly.
  color: string;
}

export const NOTICE_MODELS: NoticeModel[] = [
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', color: '#10b981' }, // emerald-500
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', color: '#f59e0b' }, // amber-500
];
