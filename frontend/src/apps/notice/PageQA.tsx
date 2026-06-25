import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Loader2, Send } from 'lucide-react';
import { GeminiLogo } from './GeminiLogo';
import { NOTICE_MODELS, DEFAULT_NOTICE_MODEL } from './models';
import { useLanguage } from '../../contexts/LanguageContext';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// The "asking window" beside the document: pick a Gemini model and chat about
// the page currently shown. Successive questions and answers stack as a
// conversation above the asking bar (like Gemini). The page is captured as a
// PNG via `getPageImage` and posted with each question.
export function PageQA({ getPageImage }: { getPageImage: () => string | null }) {
  const { t } = useLanguage();
  const [question, setQuestion] = useState('');
  const [model, setModel] = useState(DEFAULT_NOTICE_MODEL);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the latest exchange in view as the conversation grows.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Keep the input focused — on first load (centered) and after each exchange
  // (once it has dropped to the bottom).
  useEffect(() => {
    inputRef.current?.focus();
  }, [messages.length]);

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (!q || loading) return;

    const image = getPageImage();
    if (!image) {
      setError(t('notice.err.rendering'));
      return;
    }

    setError(null);
    setMessages((m) => [...m, { role: 'user', content: q }]);
    setQuestion('');
    setLoading(true);
    try {
      const { data } = await axios.post<{ answer: string }>('/api/notice/ask', {
        question: q,
        image,
        model,
      });
      setMessages((m) => [...m, { role: 'assistant', content: data.answer }]);
    } catch (err) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error : null;
      setError(msg || t('notice.err.generic'));
    } finally {
      setLoading(false);
    }
  };

  const started = messages.length > 0 || loading || !!error;

  // The asking bar: press Enter to send; a send icon appears once there's text.
  const askBar = (
    <form onSubmit={ask} className="w-full">
      <div className="relative">
        <input
          ref={inputRef}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t('notice.qa.placeholder')}
          className="w-full rounded-xl border border-slate-300 bg-white py-3.5 pl-4 pr-12 text-base text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100 dark:placeholder:text-slate-600"
        />
        {(question.trim() || loading) && (
          <button
            type="submit"
            disabled={!question.trim() || loading}
            aria-label={t('notice.qa.ask')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-emerald-600 transition-colors hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </button>
        )}
      </div>
    </form>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-lg">
      {/* Header: Gemini logo + model selector (shows the active model) */}
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <GeminiLogo className="h-6 w-6 shrink-0" />
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          aria-label="Model"
          className="min-w-0 flex-1 cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-base font-medium text-slate-800 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200"
        >
          {NOTICE_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {started ? (
        // Conversation: history fills the middle, asking bar pinned to the bottom.
        <>
          <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
            {messages.map((m, i) =>
              m.role === 'user' ? (
                <div
                  key={i}
                  className="ml-auto max-w-[85%] rounded-2xl bg-slate-100 px-4 py-2.5 text-sm text-slate-900 dark:bg-slate-700/50 dark:text-slate-100"
                >
                  {m.content}
                </div>
              ) : (
                <div key={i} className="flex gap-2">
                  <GeminiLogo className="mt-0.5 h-4 w-4 shrink-0" />
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                    {m.content}
                  </p>
                </div>
              ),
            )}
            {loading && (
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('notice.qa.reading')}
              </div>
            )}
            {error && (
              <p className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                {error}
              </p>
            )}
            <div ref={endRef} />
          </div>
          <div className="border-t border-slate-200 p-3 dark:border-slate-800">{askBar}</div>
        </>
      ) : (
        // Empty: the asking bar sits vertically centered (Gemini-style).
        <div className="flex flex-1 items-center px-3">{askBar}</div>
      )}
    </div>
  );
}
