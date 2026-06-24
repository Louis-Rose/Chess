import { useState } from 'react';
import axios from 'axios';
import { Loader2, Send, Sparkles } from 'lucide-react';
import { GeminiLogo } from './GeminiLogo';
import { NOTICE_MODELS, DEFAULT_NOTICE_MODEL } from './models';

// The "asking window" beside the document: pick a Gemini model, ask about the
// page currently shown, and read the answer. The page is captured as a PNG via
// `getPageImage` and posted with the question and chosen model; a spinner runs
// while the answer is awaited.
export function PageQA({ getPageImage }: { getPageImage: () => string | null }) {
  const [question, setQuestion] = useState('');
  const [model, setModel] = useState(DEFAULT_NOTICE_MODEL);
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (!q || loading) return;

    const image = getPageImage();
    if (!image) {
      setError('The page is still rendering. Try again in a moment.');
      return;
    }

    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const { data } = await axios.post<{ answer: string }>('/api/notice/ask', {
        question: q,
        image,
        model,
      });
      setAnswer(data.answer);
    } catch (err) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error : null;
      setError(msg || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-800/30">
      {/* Header: Gemini logo + model selector (shows the active model) */}
      <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
        <GeminiLogo className="h-6 w-6 shrink-0" />
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          aria-label="Model"
          className="min-w-0 flex-1 cursor-pointer rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-base font-medium text-slate-200 focus:border-emerald-500 focus:outline-none"
        >
          {NOTICE_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {/* Centered ask area: large question box, answer below */}
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-5 overflow-auto p-6">
        <form onSubmit={ask} className="flex flex-col gap-3">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask anything about this page…"
            className="w-full rounded-xl border border-slate-700 bg-slate-900/50 px-4 py-3.5 text-base text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!question.trim() || loading}
            className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-5 py-3 text-base font-semibold transition-colors hover:border-emerald-500 hover:bg-emerald-500/10 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            Ask
          </button>
        </form>

        {loading ? (
          <div className="flex items-center justify-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            Reading this page…
          </div>
        ) : error ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>
        ) : answer ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-400">
              <Sparkles className="h-3.5 w-3.5" />
              Answer
            </div>
            <p className="whitespace-pre-wrap text-base leading-relaxed text-slate-200">{answer}</p>
          </div>
        ) : (
          <p className="text-center text-base text-slate-500">Ask a question about the page on the left.</p>
        )}
      </div>
    </div>
  );
}
