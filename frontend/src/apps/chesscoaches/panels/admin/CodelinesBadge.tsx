import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

const LANG_COLORS: Record<string, string> = {
  tsx: 'text-sky-400',
  ts: 'text-blue-400',
  js: 'text-yellow-400',
  jsx: 'text-cyan-400',
  py: 'text-emerald-400',
  html: 'text-orange-400',
  css: 'text-pink-400',
};

export function CodelinesBadge() {
  const { data } = useQuery({
    queryKey: ['admin-codelines'],
    queryFn: async () => {
      const res = await axios.get('/api/admin/codelines');
      return res.data as { lines: number; by_lang: Record<string, number> };
    },
  });
  if (!data) return null;
  const breakdown = Object.entries(data.by_lang)
    .sort(([, a], [, b]) => b - a)
    .map(([lang, count]) => ({ lang, count, pct: data.lines ? (count / data.lines) * 100 : 0 }));
  return (
    <div className="rounded-lg border border-slate-700 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-700/50">
        <h3 className="text-sm font-medium text-slate-300">Codebase</h3>
      </div>
      <div className="px-4 py-3">
        <div className="flex items-baseline justify-center gap-2">
          <span className="font-mono text-2xl font-bold text-slate-100">{data.lines.toLocaleString()}</span>
          <span className="text-base text-slate-400">lines of code</span>
        </div>
        <div className="mt-2 flex flex-wrap justify-center gap-x-6 gap-y-1 text-base">
          {breakdown.map(({ lang, pct }) => (
            <span key={lang}>
              <span className={`font-semibold ${LANG_COLORS[lang] ?? 'text-slate-300'}`}>{lang}</span>{' '}
              <span className="text-slate-400">{pct.toFixed(1)}%</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
