// Models offered in the page Q&A dropdown. Ids must stay in sync with the
// backend allowlist (blueprints/notice.py, which validates independently) and
// the admin GEMINI_PRICING table so usage cost is tracked.
export interface NoticeModel {
  id: string;
  label: string;
}

export const NOTICE_MODELS: NoticeModel[] = [
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite' },
];

export const DEFAULT_NOTICE_MODEL = 'gemini-3.5-flash';
