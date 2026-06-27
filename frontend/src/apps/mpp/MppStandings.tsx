import { useEffect, useState } from 'react';
import axios from 'axios';
import { useLanguage } from '../../contexts/LanguageContext';
import { localeFor } from './mppLocale';
import type { MppStandings as Standings } from './types';

// Full league leaderboard (the MPP "Classement"): every player with their
// Bons / Exacts / Points, the owner's own row highlighted. Lazy-loaded when a
// league card is expanded.
export function MppStandingsPanel({ challengeId }: { challengeId: string }) {
  const { t, language } = useLanguage();
  const loc = localeFor(language);
  const [data, setData] = useState<Standings | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setData(null);
    setError(false);
    axios
      .get<Standings>('/api/mpp/standings', { params: { challengeId } })
      .then((r) => active && setData(r.data))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [challengeId]);

  if (error) {
    return <p className="px-5 py-4 text-sm text-amber-300">{t('mpp.standings.error')}</p>;
  }
  if (!data) {
    return <p className="px-5 py-4 text-sm text-slate-500">{t('mpp.standings.loading')}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-800 text-xs uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2 text-left font-medium">{t('mpp.standings.rank')}</th>
            <th className="px-3 py-2 text-left font-medium">{t('mpp.standings.player')}</th>
            <th className="px-2 py-2 text-right font-medium">{t('mpp.standings.good')}</th>
            <th className="px-2 py-2 text-right font-medium">{t('mpp.standings.exact')}</th>
            <th className="px-3 py-2 text-right font-medium">{t('mpp.standings.points')}</th>
          </tr>
        </thead>
        <tbody>
          {data.standings.map((s) => {
            const isMe = s.user_id === data.me_user_id;
            return (
              <tr
                key={s.user_id}
                className={`border-b border-slate-200/60 dark:border-slate-800/60 ${
                  isMe ? 'bg-emerald-500/10' : 'hover:bg-slate-100/40 dark:hover:bg-slate-800/40'
                }`}
              >
                <td className="px-3 py-2">
                  <RankBadge rank={s.rank} />
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {s.avatar_url && (
                      <img
                        src={s.avatar_url}
                        alt=""
                        className="h-7 w-7 shrink-0 rounded-full object-cover"
                      />
                    )}
                    <span className={`truncate ${isMe ? 'font-semibold text-emerald-300' : 'text-slate-800 dark:text-slate-200'}`}>
                      {s.username}
                    </span>
                  </div>
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">{s.good}</td>
                <td className="px-2 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">{s.exact}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {s.points?.toLocaleString(loc)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const MEDAL: Record<number, string> = {
  1: 'bg-amber-400/20 text-amber-300',
  2: 'bg-slate-300/20 text-slate-800 dark:text-slate-200',
  3: 'bg-orange-500/20 text-orange-300',
};

function RankBadge({ rank }: { rank: number }) {
  const medal = MEDAL[rank];
  if (medal) {
    return (
      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${medal}`}>
        {rank}
      </span>
    );
  }
  return <span className="inline-block w-6 text-center text-slate-500">{rank}</span>;
}
