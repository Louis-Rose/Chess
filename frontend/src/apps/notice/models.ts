// Models offered in the page Q&A dropdown. Ids must stay in sync with the
// backend allowlist (blueprints/notice.py, which validates independently) and
// the admin GEMINI_PRICING table so usage cost is tracked.
export interface NoticeModel {
  id: string;
  label: string;
}

export const NOTICE_MODELS: NoticeModel[] = [
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash' },
  { id: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite' },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
];

export const DEFAULT_NOTICE_MODEL = NOTICE_MODELS[0].id;
