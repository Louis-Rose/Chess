// Chess analysis section components

import { useState, useMemo, useEffect, useCallback } from 'react';
import { ChevronRight, Maximize2, Minimize2, Info } from 'lucide-react';
import { useChessData } from '../contexts/ChessDataContext';
import { useLanguage } from '../../../contexts/LanguageContext';
// import { fetchChessInsight } from '../hooks/api';
import type { ApiResponse, StreakStats, TodayStats, DailyVolumeStats } from '../utils/types';
import {
  ComposedChart, BarChart, Line, Bar, ReferenceLine,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

function NotEnoughGames({ totalGames }: { totalGames: number }) {
  const { t, language } = useLanguage();
  const { selectedTimeClass } = useChessData();
  const timeClassLabel = language === 'fr'
    ? (selectedTimeClass === 'rapid' ? 'rapide' : 'blitz')
    : selectedTimeClass;
  const gamesWord = totalGames === 1
    ? (language === 'fr' ? 'partie' : 'game')
    : (language === 'fr' ? 'parties' : 'games');
  const msg = t('chess.notEnoughGames')
    .replace('{count}', String(totalGames))
    .replace('{timeClass}', timeClassLabel)
    .replace('{games}', gamesWord);
  return <p className="text-slate-400 text-center py-8 max-w-md mx-auto">{msg}</p>;
}

export function CollapsibleSection({ title, defaultExpanded = true, standalone = false, children }: { title: string; defaultExpanded?: boolean; standalone?: boolean; children: React.ReactNode | ((fullscreen: boolean, title?: string) => React.ReactNode) }) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const closeFullscreen = useCallback(() => setIsFullscreen(false), []);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeFullscreen(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen, closeFullscreen]);

  // Standalone mode: children handle their own card containers; pass title for embedding
  if (standalone) {
    return (
      <>
        {typeof children === 'function' ? children(false, title) : children}
      </>
    );
  }

  const card = (
    <div className={isFullscreen
      ? 'bg-slate-50 dark:bg-slate-700 rounded-xl shadow-lg flex flex-col overflow-hidden w-full h-full'
      : 'bg-slate-50 dark:bg-slate-700 rounded-xl shadow-sm dark:shadow-none'
    }>
      <div className="flex items-center p-4">
        <button
          onClick={() => { if (!isFullscreen) setIsExpanded(!isExpanded); }}
          className="flex items-center gap-3 text-left flex-1"
        >
          {!isFullscreen && (
            <ChevronRight className={`w-5 h-5 text-slate-500 dark:text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
          )}
          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 select-text">{title}</h3>
        </button>
        <button
          onClick={isFullscreen ? closeFullscreen : () => setIsFullscreen(true)}
          className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-400 transition-colors"
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen
            ? <Minimize2 className="w-4 h-4" />
            : <Maximize2 className="w-4 h-4" />
          }
        </button>
      </div>
      {(isExpanded || isFullscreen) && (
        <div className={`select-text ${isFullscreen ? 'px-4 pb-4 flex-1 min-h-0 flex flex-col *:flex-1 *:!h-auto' : 'px-0 pb-4 sm:px-4'}`}>
          {typeof children === 'function' ? children(isFullscreen) : children}
        </div>
      )}
    </div>
  );

  if (isFullscreen) {
    return (
      <>
        {/* placeholder to keep layout stable */}
        <div className="bg-slate-50 dark:bg-slate-700 rounded-xl shadow-sm dark:shadow-none p-4 opacity-0 pointer-events-none" aria-hidden />
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-8 bg-black/50 backdrop-blur-sm" onClick={closeFullscreen}>
          <div className="w-[90vw] h-[80vh]" onClick={e => e.stopPropagation()}>
            {card}
          </div>
        </div>
      </>
    );
  }

  return card;
}

function StandaloneCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-700 rounded-xl px-3 sm:px-6 py-4 mx-4 select-text space-y-3">
      <h2 className="text-lg font-bold text-slate-100 text-center select-text">{title}</h2>
      {children}
    </div>
  );
}

export function TodaySection({ data, standalone = false }: { data: ApiResponse; standalone?: boolean }) {
  const { t } = useLanguage();

  const today = data.today_stats;
  if (!today) return null;

  const gamesToday = today.games_today;
  const streakType = today.current_streak_type;
  const streakLength = today.current_streak_length;

  // Predicted win rate from daily volume: find entry matching current games count
  const dvs = data.daily_volume_stats;
  const lookupCount = Math.max(gamesToday, 1);
  let volumeEntry = dvs?.find(d => d.games_per_day === lookupCount && d.days >= 10);
  if (!volumeEntry && dvs) {
    const significant = dvs.filter(d => d.days >= 10);
    volumeEntry = significant.reduce<typeof significant[0] | undefined>((best, d) => {
      if (!best) return d;
      return Math.abs(d.games_per_day - lookupCount) < Math.abs(best.games_per_day - lookupCount) ? d : best;
    }, undefined);
  }
  const volumeWinRate = volumeEntry ? (volumeEntry.win_pct + volumeEntry.draw_pct / 2) : null;

  // Predicted win rate from streak
  const streakStats = data.streak_stats;
  const streakEntry = streakType && streakLength > 0
    ? streakStats?.find(s => s.streak_type === streakType && s.streak_length === streakLength)
    : undefined;
  const streakWinRate = streakEntry && streakEntry.sample_size >= 30
    ? streakEntry.win_rate : null;

  const formatStreak = (type: TodayStats['current_streak_type'], len: number) => {
    if (!type || len === 0) return '—';
    const label = type === 'win'
      ? (len === 1 ? t('chess.win') : t('chess.wins'))
      : (len === 1 ? t('chess.loss') : t('chess.losses'));
    return `${len} ${label}`;
  };

  const winRateColor = (rate: number) => rate >= 50 ? 'text-green-400' : 'text-red-400';

  const title = t('chess.todayTitle');

  const table = (
    <table className="w-full border-collapse border border-slate-600">
      <thead>
        <tr className="border border-slate-600 bg-slate-800">
          <th className="text-center text-white text-sm font-semibold py-3 px-4 border border-slate-600">{t('chess.currentSituation')}</th>
          <th className="text-center text-white text-sm font-semibold py-3 px-4 border border-slate-600">{t('chess.predictedWinRate')}</th>
        </tr>
      </thead>
      <tbody>
        <tr className="border border-slate-600">
          <td className="text-center text-white text-sm py-3 px-4 border border-slate-600">
            {gamesToday} {(gamesToday === 1 ? t('chess.gamePerDay') : t('chess.gamesPlayed')).toLowerCase()}
          </td>
          <td className="text-center text-sm font-semibold py-3 px-4 border border-slate-600">
            {volumeWinRate !== null ? (
              <span className={winRateColor(volumeWinRate)}>{volumeWinRate.toFixed(1)}%</span>
            ) : (
              <span className="text-slate-500">—</span>
            )}
          </td>
        </tr>
        {gamesToday > 0 && streakLength > 0 && (
          <tr className="border border-slate-600">
            <td className="text-center text-white text-sm py-3 px-4 border border-slate-600">
              {formatStreak(streakType, streakLength)}
            </td>
            <td className="text-center text-sm font-semibold py-3 px-4 border border-slate-600">
              {streakWinRate !== null ? (
                <span className={winRateColor(streakWinRate)}>{streakWinRate.toFixed(1)}%</span>
              ) : (
                <span className="text-slate-500">—</span>
              )}
            </td>
          </tr>
        )}
          </tbody>
        </table>
      );

  if (standalone) {
    return (
      <div className="bg-slate-700 rounded-xl p-0.5 sm:p-4 select-text">
        <h2 className="text-2xl font-bold text-slate-100 text-center select-text py-3">{title}</h2>
        {table}
      </div>
    );
  }

  return (
    <CollapsibleSection title={t('chess.todaysData')} defaultExpanded>
      {() => table}
    </CollapsibleSection>
  );
}

// // Module-level cache so Gemini results survive component unmount/remount
// const insightCache = new Map<string, { en: string; fr: string }>();
//
// function DailyVolumeSummary({ sorted }: { sorted: { games_per_day: number; winRate: number; days: number }[] }) {
//   const { t, language } = useLanguage();
//   const [summaries, setSummaries] = useState<{ en: string | null; fr: string | null }>({ en: null, fr: null });
//   const [loading, setLoading] = useState(false);
//
//   useEffect(() => {
//     let aborted = false;
//
//     const significant = sorted.filter(d => d.days >= 10);
//     if (significant.length === 0) {
//       setSummaries({ en: null, fr: null });
//       setLoading(false);
//       return;
//     }
//
//     const key = significant.map(d => `${d.games_per_day}:${d.winRate.toFixed(1)}`).join(',');
//
//     const cached = insightCache.get(key);
//     if (cached) {
//       setSummaries(cached);
//       setLoading(false);
//       return;
//     }
//
//     const rows = significant.map(d => ({ games_per_day: d.games_per_day, win_rate: d.winRate }));
//     setSummaries({ en: null, fr: null });
//     setLoading(true);
//     fetchChessInsight('daily_volume', rows)
//       .then(result => {
//         insightCache.set(key, result);
//         if (!aborted) setSummaries(result);
//       })
//       .catch(() => { if (!aborted) setSummaries({ en: null, fr: null }); })
//       .finally(() => { if (!aborted) setLoading(false); });
//
//     return () => { aborted = true; };
//   }, [sorted]);
//
//   if (loading) {
//     return (
//       <div className="flex items-center justify-center py-3 text-slate-400 text-sm">
//         <Loader2 className="w-4 h-4 animate-spin mr-2" />
//         <span>{t('chess.analysisLoading')}</span>
//       </div>
//     );
//   }
//
//   const summary = summaries[language];
//   if (!summary) return null;
//
//   return (
//     <div className="text-slate-300 text-sm pb-3 whitespace-pre-line leading-relaxed text-center">
//       {summary}
//     </div>
//   );
// }

type TimePeriod = '1M' | '3M' | '6M' | '1Y' | '2Y' | 'ALL';
const TIME_PERIODS: TimePeriod[] = ['ALL', '2Y', '1Y', '6M', '3M', '1M'];

function TimePeriodToggle({ selected, onChange }: { selected: TimePeriod; onChange: (p: TimePeriod) => void }) {
  return (
    <div className="inline-flex bg-slate-800 rounded-lg p-0.5 gap-0.5">
      {TIME_PERIODS.map(p => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
            selected === p
              ? 'bg-slate-600 text-white'
              : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

function getDateCutoff(period: TimePeriod): string | null {
  if (period === 'ALL') return null;
  const now = new Date();
  const months: Record<Exclude<TimePeriod, 'ALL'>, number> = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12, '2Y': 24 };
  now.setMonth(now.getMonth() - months[period]);
  return now.toISOString().slice(0, 10);
}

function aggregateDailyVolume(data: ApiResponse, period: TimePeriod): { stats: DailyVolumeStats[]; filteredGames: number } {
  const raw = data.daily_game_results;
  const totalGames = data.total_games;

  if (!raw || raw.length === 0) return { stats: data.daily_volume_stats ?? [], filteredGames: totalGames };
  if (period === 'ALL') return { stats: data.daily_volume_stats ?? [], filteredGames: totalGames };

  const cutoff = getDateCutoff(period);
  const filtered = cutoff ? raw.filter(d => d.date >= cutoff) : raw;
  let filteredGames = 0;

  const buckets = new Map<number, { days: number; wins: number; draws: number; losses: number; total: number }>();
  for (const day of filtered) {
    const n = day.total;
    filteredGames += day.total;
    if (!buckets.has(n)) buckets.set(n, { days: 0, wins: 0, draws: 0, losses: 0, total: 0 });
    const b = buckets.get(n)!;
    b.days += 1;
    b.wins += day.wins;
    b.draws += day.draws;
    b.losses += day.losses;
    b.total += day.total;
  }

  const result: DailyVolumeStats[] = [];
  for (const [nGames, b] of [...buckets.entries()].sort((a, c) => a[0] - c[0])) {
    const t = b.total || 1;
    result.push({
      games_per_day: nGames,
      days: b.days,
      win_pct: Math.round(b.wins / t * 1000) / 10,
      draw_pct: Math.round(b.draws / t * 1000) / 10,
      loss_pct: Math.round(b.losses / t * 1000) / 10,
      total_games: b.total,
    });
  }
  return { stats: result, filteredGames };
}

export function DailyVolumeSection({ data, standalone = false, period: controlledPeriod, onPeriodChange }: { data: ApiResponse; standalone?: boolean; period?: TimePeriod; onPeriodChange?: (p: TimePeriod) => void }) {
  const { t, language } = useLanguage();
  const [internalPeriod, setInternalPeriod] = useState<TimePeriod>('ALL');
  const period = controlledPeriod ?? internalPeriod;
  const setPeriod = onPeriodChange ?? setInternalPeriod;

  const { stats: rawDvs } = useMemo(() => aggregateDailyVolume(data, period), [data, period]);

  return (
    <CollapsibleSection title={t('chess.dailyVolumeTitle')} defaultExpanded standalone={standalone}>
      {(_fullscreen, sectionTitle) => {
        const toggle = (
          <TimePeriodToggle selected={period} onChange={setPeriod} />
        );

        const dvs = (rawDvs ?? []).filter(d => d.days > 0);

        // Group into buckets
        const BUCKETS: { label: string; min: number; max: number }[] = [
          { label: '1-3', min: 1, max: 3 },
          { label: '4-6', min: 4, max: 6 },
          { label: '7-10', min: 7, max: 10 },
          { label: '11-15', min: 11, max: 15 },
          { label: '15-20', min: 15, max: 20 },
          { label: '20+', min: 21, max: Infinity },
        ];

        const MIN_GAMES = 30;

        const grouped = BUCKETS.map(bucket => {
          const matching = dvs.filter(d => d.games_per_day >= bucket.min && d.games_per_day <= bucket.max);
          const days = matching.reduce((s, d) => s + d.days, 0);
          const totalGames = matching.reduce((s, d) => s + d.total_games, 0);
          const wins = matching.reduce((s, d) => s + Math.round(d.win_pct * d.total_games / 100), 0);
          const draws = matching.reduce((s, d) => s + Math.round(d.draw_pct * d.total_games / 100), 0);
          const winRate = totalGames > 0 ? ((wins + draws * 0.5) / totalGames) * 100 : 0;
          // 95% CI for binomial proportion: 1.96 * sqrt(p*(1-p)/n)
          const p = winRate / 100;
          const ci = totalGames > 0 ? 1.96 * Math.sqrt(p * (1 - p) / totalGames) * 100 : 0;
          return { label: bucket.label, days, totalGames, winRate, ci };
        }).filter(b => b.totalGames > 0);

        const infoTooltip = language === 'fr'
          ? 'Le taux de victoire indique votre performance selon le nombre de parties jouées par jour.\n\nL\'intervalle de confiance (±) représente la marge d\'erreur à 95%. Plus il est petit, plus le résultat est fiable.'
          : 'Win rate shows your performance based on how many games you play per day.\n\nThe confidence interval (±) represents the 95% margin of error. Smaller means more reliable.';

        const table = grouped.length > 0 ? (
          <table className="w-full table-fixed border-collapse border border-slate-600">
            <thead>
              <tr className="border border-slate-600 bg-slate-800">
                <th className="w-1/2 text-center text-white text-sm font-semibold py-3 px-4 border border-slate-600">{t('chess.gamesPerDay')}</th>
                <th className="w-1/2 text-center text-white text-sm font-semibold py-3 px-4 border border-slate-600">
                  <div className="flex items-center justify-center gap-1.5">
                    {t('chess.winRate')}
                    <span className="relative group">
                      <Info className="w-3.5 h-3.5 text-slate-400 cursor-help" />
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-900 text-white text-xs font-normal rounded-lg opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity z-20 w-64 text-left whitespace-pre-line after:content-[''] after:absolute after:top-full after:left-0 after:right-0 after:h-3">
                        {infoTooltip}
                      </div>
                    </span>
                  </div>
                </th>
              </tr>
            </thead>
              <tbody>
                {grouped.map(b => (
                  <tr key={b.label} className="border border-slate-600">
                    <td className="text-center text-white text-sm py-3 px-4 border border-slate-600">{b.label} {t('chess.gamesPerDay').toLowerCase()}</td>
                    <td className="text-center text-sm font-semibold py-3 px-4 border border-slate-600">
                      {b.totalGames >= MIN_GAMES ? (
                        <>
                          <span className={b.winRate >= 50 ? 'text-green-400' : 'text-red-400'}>{b.winRate.toFixed(1)}%</span>
                          <span className={`ml-1 text-xs ${b.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>(<span className="inline-flex flex-col items-center leading-[0.5] align-middle text-[9px]"><span>+</span><span>−</span></span>{b.ci.toFixed(1)}%)</span>
                        </>
                      ) : (
                        <span className="text-slate-500 text-xs">{t('chess.insufficientData')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        ) : (
          <NotEnoughGames totalGames={data.total_games} />
        );

        if (standalone) {
          return (
            <div className="bg-slate-700 rounded-xl px-3 sm:px-6 py-4 mx-4 select-text space-y-3">
              <div className="flex justify-end">
                {toggle}
              </div>
              <h2 className="text-lg font-bold text-slate-100 select-text text-center">{sectionTitle ?? ''}</h2>
              <div />
              {table}
            </div>
          );
        }

        return (
          <div className="space-y-3">
            <div className="flex justify-end px-1">
              {toggle}
            </div>
            {table}
          </div>
        );
      }}
    </CollapsibleSection>
  );
}

export { aggregateDailyVolume };
export type { TimePeriod };

export function GameNumberSection({ data, standalone = false }: { data: ApiResponse; standalone?: boolean }) {
  const { t } = useLanguage();

  const raw = data.game_number_stats;

  return (
    <CollapsibleSection title={t('chess.gameNumberTitle')} defaultExpanded standalone={standalone}>
      {(fullscreen, sectionTitle) => {
        if (!raw || raw.length === 0) return <NotEnoughGames totalGames={data.total_games} />;

        const fs = fullscreen ? 18 : 14;

        // Sort by game number, truncate after last entry with sample_size >= 10
        const sorted = [...raw].sort((a, b) => a.game_number - b.game_number);
        const lastSigIdx = sorted.reduce((last, g, i) => g.sample_size >= 10 ? i : last, -1);
        const filtered = lastSigIdx >= 0 ? sorted.slice(0, lastSigIdx + 1) : [];

        if (filtered.length === 0) return <NotEnoughGames totalGames={data.total_games} />;

        // Compute loss_rate and draw_rate for stacked bars (win_rate already provided)
        const chartData = filtered.map(g => ({
          ...g,
          label: `#${g.game_number}`,
          win_pct: g.win_rate,
          loss_pct: 100 - g.win_rate,
        }));

        const chart = (
          <div>
            <div className="text-center mb-3">
              <h4 className="text-white font-semibold">{t('chess.winRate')}</h4>
            </div>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 0, left: 0, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                  <ReferenceLine y={50} stroke="#f1f5f9" strokeWidth={2} strokeOpacity={0.5} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: fs, fill: '#f1f5f9', fontWeight: 700 }}
                    label={{ value: t('chess.gameNumber'), position: 'insideBottom', offset: -15, fill: '#f1f5f9', fontSize: fs, fontWeight: 700 }}
                  />
                  <YAxis
                    tick={{ fontSize: fs, fill: '#f1f5f9', fontWeight: 700 }}
                    domain={[0, 100]}
                    ticks={[0, 25, 50, 75, 100]}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    content={({ active, payload }: any) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0]?.payload;
                      if (!d) return null;
                      const gameLabel = t('chess.nthGame');
                      return (
                        <div style={{ backgroundColor: '#1e293b', borderRadius: '8px', border: '1px solid #334155', padding: '8px 12px' }}>
                          <p style={{ color: '#f1f5f9', fontWeight: 700, marginBottom: 4 }}>{d.game_number}{d.game_number === 1 ? 'st' : d.game_number === 2 ? 'nd' : d.game_number === 3 ? 'rd' : 'th'} {gameLabel}</p>
                          <p style={{ color: '#f1f5f9' }}>{t('chess.winRate')}: {d.win_rate.toFixed(1)}%</p>
                          <p style={{ color: '#94a3b8', fontSize: 12 }}>{d.sample_size} {t('chess.games')}</p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="win_pct" stackId="a" fill="#16a34a" />
                  <Bar dataKey="loss_pct" stackId="a" fill="#dc2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        );

        const table = (
          <table className="w-full border-collapse border border-slate-600">
            <thead>
              <tr className="border border-slate-600 bg-slate-800">
                <th className="text-center text-white text-sm font-semibold py-3 px-4 border border-slate-600">{t('chess.gameNumber')}</th>
                <th className="text-center text-white text-sm font-semibold py-3 px-4 border border-slate-600">{t('chess.winRate')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(g => (
                <tr key={g.game_number} className="border border-slate-600">
                  <td className="text-center text-white text-sm py-3 px-4 border border-slate-600">
                    {g.game_number}{g.game_number === 1 ? 'st' : g.game_number === 2 ? 'nd' : g.game_number === 3 ? 'rd' : 'th'} {t('chess.nthGame')}
                  </td>
                  <td className="text-center text-sm font-semibold py-3 px-4 border border-slate-600">
                    {g.sample_size >= 10 ? (
                      <>
                        <span className={g.win_rate >= 50 ? 'text-green-400' : 'text-red-400'}>{g.win_rate.toFixed(1)}%</span>
                        <span className="text-slate-500 font-normal ml-2 text-xs">({g.sample_size} {t('chess.games')})</span>
                      </>
                    ) : (
                      <span className="text-slate-500 text-xs">{t('chess.insufficientData')} ({g.sample_size} {t('chess.games')})</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        );

        if (standalone) {
          return (
            <>
              <div className="bg-slate-700 rounded-xl p-0.5 sm:p-4 select-text">
                <h2 className="text-2xl font-bold text-slate-100 text-center select-text py-3">{sectionTitle}</h2>
                {chart}
              </div>
              <div className="bg-slate-700 rounded-xl p-0.5 sm:p-4 select-text">{table}</div>
            </>
          );
        }

        return (
          <div className="space-y-4">
            {chart}
            {table}
          </div>
        );
      }}
    </CollapsibleSection>
  );
}

export function StreakSection({ data, standalone = false }: { data: ApiResponse; standalone?: boolean }) {
  const { t } = useLanguage();

  const stats = data.streak_stats;

  const formatLabel = (type: string, len: number) => {
    if (len === 1) return type === 'win' ? t('chess.after1Win') : t('chess.after1Loss');
    return (type === 'win' ? t('chess.afterNWins') : t('chess.afterNLosses')).replace('{n}', String(len));
  };

  const renderRow = (s: StreakStats) => (
    <tr key={`${s.streak_type}-${s.streak_length}`} className="border border-slate-600">
      <td className="text-center text-white text-sm py-3 px-4 border border-slate-600">{formatLabel(s.streak_type, s.streak_length)}</td>
      <td className="text-center text-sm font-semibold py-3 px-4 border border-slate-600">
        {s.sample_size >= 30 ? (
          <span className={s.win_rate >= 50 ? 'text-green-400' : 'text-red-400'}>{s.win_rate}%</span>
        ) : (
          <span className="text-slate-500 text-xs">{t('chess.insufficientData')}</span>
        )}
      </td>
    </tr>
  );

  return (
    <CollapsibleSection title={t('chess.streaksCardTitle')} defaultExpanded standalone={standalone}>
      {(_fullscreen, sectionTitle) => {
        if (!stats || stats.length === 0) return <NotEnoughGames totalGames={data.total_games} />;

        // Wins: descending (max, ..., 2, 1). Losses: ascending (1, 2, ..., max)
        // Truncate each after the last row with N >= 30
        const allWins = stats.filter(s => s.streak_type === 'win').sort((a, b) => b.streak_length - a.streak_length);
        const allLosses = stats.filter(s => s.streak_type === 'loss').sort((a, b) => a.streak_length - b.streak_length);
        // Wins descending: trim leading insufficient rows (from top)
        const firstSigWin = allWins.findIndex(s => s.sample_size >= 30);
        const wins = firstSigWin >= 0 ? allWins.slice(firstSigWin) : [];
        // Losses ascending: trim trailing insufficient rows (from bottom)
        const lastSigLoss = allLosses.reduce((last, s, i) => s.sample_size >= 30 ? i : last, -1);
        const losses = lastSigLoss >= 0 ? allLosses.slice(0, lastSigLoss + 1) : [];

        // Compute recommendation from significant data (N >= 30)
        const sigWins = wins.filter(s => s.sample_size >= 30).sort((a, b) => a.streak_length - b.streak_length);
        const sigLosses = losses.filter(s => s.sample_size >= 30).sort((a, b) => a.streak_length - b.streak_length);

        // Wins: if all significant entries > 50%, recommend keeping playing
        const allWinsPositive = sigWins.length > 0 && sigWins.every(s => s.win_rate > 50);
        // Find the last win streak length where win rate is still > 50%
        const lastGoodWin = sigWins.filter(s => s.win_rate > 50).pop();

        // Losses: find the first loss streak length where win rate drops below 48%
        const firstBadLoss = sigLosses.find(s => s.win_rate < 48);

        const table = (
          <table className="w-full border-collapse border border-slate-600">
            <thead>
              <tr className="border border-slate-600 bg-slate-800">
                <th className="text-center text-white text-sm font-semibold py-3 px-4 border border-slate-600">{t('chess.situation')}</th>
                <th className="text-center text-white text-sm font-semibold py-3 px-4 border border-slate-600">{t('chess.winRate')}</th>
              </tr>
            </thead>
            <tbody>
              {wins.map(renderRow)}
              <tr className="border border-slate-600">
                <td colSpan={2} className="py-1 bg-slate-800 border border-slate-600" />
              </tr>
              {losses.map(renderRow)}
            </tbody>
          </table>
        );

        const recommendation = (lastGoodWin || firstBadLoss) ? (
          <div className="bg-slate-800 rounded-lg p-4 text-sm text-center">
            {allWinsPositive && (
              <p className="text-green-400 font-semibold">{t('chess.keepPlayingWhileWinning')}</p>
            )}
            {!allWinsPositive && lastGoodWin && (
              <p className="text-green-400 font-semibold">
                {t('chess.keepPlayingUpTo').replace('{n}', String(lastGoodWin.streak_length))}
              </p>
            )}
            {(allWinsPositive || lastGoodWin) && firstBadLoss && (
              <div className="my-2 border-t border-slate-600" />
            )}
            {firstBadLoss && (
              <p className="text-red-400 font-semibold">
                {(firstBadLoss.streak_length === 1 ? t('chess.stopAfter1Loss') : t('chess.stopAfterNLosses').replace('{n}', String(firstBadLoss.streak_length)))}
              </p>
            )}
          </div>
        ) : null;

        if (standalone) {
          return (
            <StandaloneCard title={sectionTitle ?? ''}>
              {recommendation}
              {table}
            </StandaloneCard>
          );
        }

        return (
          <div className="space-y-4">
            {table}
            {recommendation}
          </div>
        );
      }}
    </CollapsibleSection>
  );
}

export function EloSection({ data, standalone = false }: { data: ApiResponse; standalone?: boolean }) {
  const { t } = useLanguage();
  const { selectedTimeClass } = useChessData();

  // Handle both new {date} and old cached {year, week} format
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getDateStr = (item: any): string => {
    if (typeof item.date === 'string') return item.date;
    const year = item.year as number, week = item.week as number;
    const jan4 = new Date(year, 0, 4);
    const dayOfWeek = jan4.getDay() || 7;
    const monday = new Date(jan4);
    monday.setDate(jan4.getDate() - dayOfWeek + 1 + (week - 1) * 7);
    return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
  };

  const formatAxisLabel = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const formatTooltipLabel = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const month = date.toLocaleDateString('en-US', { month: 'long' });
    const day = date.getDate();
    const suffix = day === 1 || day === 21 || day === 31 ? 'st' : day === 2 || day === 22 ? 'nd' : day === 3 || day === 23 ? 'rd' : 'th';
    return `${month} ${day}${suffix}, ${date.getFullYear()}`;
  };

  const DATA_CUTOFF = '2024-01-01';
  const mergedMap = new Map<string, { date: string; elo?: number; games_played?: number }>();

  for (const item of data.elo_history || []) {
    const d = getDateStr(item);
    if (d < DATA_CUTOFF) continue;
    mergedMap.set(d, { ...mergedMap.get(d), date: d, elo: item.elo });
  }
  for (const item of data.history || []) {
    const d = getDateStr(item);
    if (d < DATA_CUTOFF) continue;
    mergedMap.set(d, { ...mergedMap.get(d), date: d, games_played: item.games_played });
  }

  const chartData = Array.from(mergedMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(item => ({ ...item, tooltipLabel: formatTooltipLabel(item.date) }));

  const allMonthBoundaries: number[] = [];
  let prevMonth = '';
  chartData.forEach((item, i) => {
    const ml = formatAxisLabel(item.date);
    if (ml !== prevMonth) { allMonthBoundaries.push(i); prevMonth = ml; }
  });
  const step = allMonthBoundaries.length > 18 ? 2 : 1;
  const monthBoundaries = new Set(allMonthBoundaries.filter((_, i) => i !== 0 && i % step === 0));

  const eloValues = chartData.map(d => d.elo).filter((v): v is number => v != null);
  const eloMin = eloValues.length > 0 ? Math.floor(Math.min(...eloValues) / 100) * 100 : 0;
  const eloMax = eloValues.length > 0 ? Math.ceil(Math.max(...eloValues) / 100) * 100 : 100;
  const eloTicks: number[] = [];
  for (let v = eloMin; v <= eloMax; v += 100) eloTicks.push(v);

  const gamesValues = chartData.map(d => d.games_played).filter((v): v is number => v != null);
  const gamesMax = gamesValues.length > 0 ? Math.ceil(Math.max(...gamesValues) / 5) * 5 : 5;
  const gamesTicks: number[] = [];
  for (let v = 0; v <= gamesMax; v += 5) gamesTicks.push(v);

  const stats = (
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-slate-800 rounded-xl p-6 text-center">
        <p className="text-3xl font-bold text-slate-100">
          {(selectedTimeClass === 'rapid' ? data.total_rapid : data.total_blitz)?.toLocaleString() || 0}
        </p>
        <p className="text-slate-400 text-sm">
          {selectedTimeClass === 'rapid' ? 'Rapid' : 'Blitz'} Games
        </p>
      </div>
      <div className="bg-slate-800 rounded-xl p-6 text-center">
        <p className="text-3xl font-bold text-slate-100">
          {eloValues.length > 0 ? eloValues[eloValues.length - 1]?.toLocaleString() : '—'}
        </p>
        <p className="text-slate-400 text-sm">Current Elo</p>
      </div>
    </div>
  );

  return (
    <CollapsibleSection title={t('chess.eloTitle')} defaultExpanded standalone={standalone}>
      {(fullscreen, sectionTitle) => {
        const chart = chartData.length > 0 ? (
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: fullscreen ? 30 : 0, left: fullscreen ? 20 : 0, bottom: fullscreen ? 80 : 60 }}>
                <CartesianGrid vertical={false} stroke="#475569" strokeWidth={0.5} />
                <XAxis
                  dataKey="date"
                  tick={(props: { x: number; y: number; index: number; payload: { value: string } }) => {
                    if (!monthBoundaries.has(props.index)) return <g />;
                    return (
                      <g transform={`translate(${props.x},${props.y})`}>
                        <text x={0} y={0} dy={20} textAnchor="end" fill="#f1f5f9" fontSize={fullscreen ? 18 : 14} fontWeight={700} transform="rotate(-45)">
                          {formatAxisLabel(props.payload.value)}
                        </text>
                      </g>
                    );
                  }}
                  interval={0}
                  height={fullscreen ? 100 : 80}
                />
                <YAxis
                  yAxisId="elo"
                  tick={{ fontSize: fullscreen ? 18 : 11, fill: '#16a34a', fontWeight: 700 }}
                  width={fullscreen ? 60 : 40}
                  domain={[eloMin, eloMax]}
                  ticks={eloTicks}
                  allowDecimals={false}
                />
                <YAxis
                  yAxisId="games"
                  orientation="right"
                  tick={{ fontSize: fullscreen ? 18 : 11, fill: '#3b82f6', fontWeight: 700 }}
                  width={fullscreen ? 60 : 30}
                  domain={[0, gamesMax]}
                  ticks={gamesTicks}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}
                  labelStyle={{ color: '#f1f5f9', fontWeight: 700 }}
                  itemStyle={{ color: '#f1f5f9' }}
                  labelFormatter={(_label, payload) => payload?.[0]?.payload?.tooltipLabel ?? _label}
                  formatter={(value, name) => [value ?? 0, name === 'elo' ? 'Elo' : 'Games']}
                />
                <Bar
                  yAxisId="games"
                  dataKey="games_played"
                  fill="#3b82f6"
                  opacity={0.4}
                  radius={[4, 4, 0, 0]}
                />
                <Line
                  yAxisId="elo"
                  type="monotone"
                  dataKey="elo"
                  stroke="#16a34a"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <NotEnoughGames totalGames={data.total_games} />
        );

        if (standalone) {
          return (
            <div className="bg-slate-700 rounded-xl p-0.5 sm:p-4 select-text space-y-4">
              <h2 className="text-2xl font-bold text-slate-100 text-center select-text py-3">{sectionTitle}</h2>
              {stats}
              {chart}
            </div>
          );
        }

        return (
          <div className="space-y-4">
            {stats}
            {chart}
          </div>
        );
      }}
    </CollapsibleSection>
  );
}

