import { useState } from 'react';
import axios from 'axios';
import { Loader2, Send, Sparkles } from 'lucide-react';
import { SECTION_WIDTH } from './sectionWidth';

// Ask a question about the page currently shown in the viewer. The page is
// captured as a PNG via `getPageImage` and sent to the backend (Gemini) along
// with the question; the answer is shown below while a spinner runs in between.
export function PageQA({ getPageImage }: { getPageImage: () => string | null }) {
  const [question, setQuestion] = useState('');
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
      const { data } = await axios.post<{ answer: string }>('/api/notice/ask', { question: q, image });
      setAnswer(data.answer);
    } catch (err) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error : null;
      setError(msg || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`mt-4 ${SECTION_WIDTH}`}>
      <form onSubmit={ask} className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask anything about this page…"
          className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!question.trim() || loading}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold transition-colors hover:border-emerald-500 hover:bg-emerald-500/10 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Ask
        </button>
      </form>

      {loading && (
        <div className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-800/40 py-6 text-sm text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          Reading this page…
        </div>
      )}

      {error && !loading && (
        <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>
      )}

      {answer && !loading && (
        <div className="mt-3 rounded-xl border border-slate-800 bg-slate-800/40 p-4">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-400">
            <Sparkles className="h-3.5 w-3.5" />
            Answer
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{answer}</p>
        </div>
      )}
    </div>
  );
}
