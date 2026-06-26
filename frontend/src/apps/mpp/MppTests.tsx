import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { RefreshCw, X } from 'lucide-react';
import { TeamCrest } from './TeamCrest';
import { MppPageTitle } from './MppPageTitle';
import { useLanguage } from '../../contexts/LanguageContext';
import { localeFor, countryName } from './mppLocale';
import type { MppCoteCell, MppTestMatch, MppTests } from './types';

type TFn = (key: string) => string;

// "Matches" tab: every upcoming fixture, one row per match, with the cotes and
// prono split for each re-fetch round across the columns. A date strip at the
// top filters the rows to a single day, starting from today. A column (one
// fetch round) is removed via a confirm modal.

const asUtc = (iso: string) => (iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`);

const fmtFetch = (iso: string, loc: string) =>
  new Date(asUtc(iso)).toLocaleString(loc, {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });

const fmtKickoff = (iso: string | null, loc: string) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleString(loc, {
        weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      });
};

const num = (v: number | null, suffix = '') => (v == null ? '.' : `${v}${suffix}`);
const pct = (v: number | null) => (v == null ? null : Math.round(v * 100));

// Local calendar day (YYYY-MM-DD) of a match, or 'tbc' when the date is unknown.
// Zero-padded so plain string comparison orders days correctly. ALL is the
// "show every day at once" pill at the end of the strip.
const TBC = 'tbc';
const ALL = 'all';
const dayKeyOf = (iso: string | null): string => {
  if (!iso) return TBC;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return TBC;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
};

const todayKey = (): string => dayKeyOf(new Date().toISOString());

const dayLabel = (key: string, t: TFn, loc: string): string => {
  if (key === TBC) return t('mpp.tests.dateTbc');
  if (key === todayKey()) return t('mpp.tests.today');
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(loc, {
    weekday: 'short', day: 'numeric', month: 'short',
  });
};

type DayBucket = { key: string; matches: MppTestMatch[] };

// Group matches by day, keep only today onward (+ any TBC), and make sure today
// is present even with no matches so the strip always starts there.
function dayBuckets(matches: MppTestMatch[]): DayBucket[] {
  const byDay = new Map<string, MppTestMatch[]>();
  for (const m of matches) {
    const k = dayKeyOf(m.date);
    (byDay.get(k) ?? byDay.set(k, []).get(k)!).push(m);
  }
  const tk = todayKey();
  const keys = [...byDay.keys()].filter((k) => k === TBC || k >= tk);
  if (!keys.includes(tk)) keys.push(tk);
  keys.sort((a, b) => (a === TBC ? 1 : b === TBC ? -1 : a < b ? -1 : a > b ? 1 : 0));
  return keys.map((k) => ({ key: k, matches: byDay.get(k) ?? [] }));
}

export function MppTests() {
  const { t, language } = useLanguage();
  const loc = localeFor(language);
  const [data, setData] = useState<MppTests | null>(null);
  const [fetching, setFetching] = useState(false);
  const [pending, setPending] = useState<string | null>(null); // batch_at to delete
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null); // selected day, null = default

  const buckets = useMemo(() => dayBuckets(data?.matches ?? []), [data]);

  // Widest country name across every match (any day) drives the width of the
  // home/away columns, so all cell-tables line up to the same size.
  const nameWidth = useMemo(() => {
    let max = 1;
    for (const m of data?.matches ?? []) {
      if (m.home) max = Math.max(max, countryName(m.home, language).length);
      if (m.away) max = Math.max(max, countryName(m.away, language).length);
    }
    return max;
  }, [data, language]);
  const isValidDay = (k: string) => k === ALL || buckets.some((b) => b.key === k);
  const activeKey =
    (day && isValidDay(day) && day) ||
    buckets.find((b) => b.key === todayKey())?.key ||
    buckets[0]?.key ||
    null;
  const activeMatches =
    activeKey === ALL
      ? buckets.flatMap((b) => b.matches)
      : buckets.find((b) => b.key === activeKey)?.matches ?? [];

  const refetch = useCallback(() => {
    setFetching(true);
    setError(null);
    axios
      .post<MppTests>('/api/mpp/tests/fetch')
      .then((r) => setData(r.data))
      .catch((e) => setError(e?.response?.data?.error || 'fetch_failed'))
      .finally(() => setFetching(false));
  }, []);

  const removeColumn = useCallback((batchAt: string) => {
    axios
      .delete<MppTests>('/api/mpp/tests/batch', { params: { batchAt } })
      .then((r) => setData(r.data))
      .catch(() => setError('delete_failed'))
      .finally(() => setPending(null));
  }, []);

  // Load stored history; if nothing has ever been fetched, fetch once now.
  useEffect(() => {
    let active = true;
    axios
      .get<MppTests>('/api/mpp/tests')
      .then((r) => {
        if (!active) return;
        setData(r.data);
        if (r.data.columns.length === 0) refetch();
      })
      .catch(() => active && setError('load_failed'));
    return () => {
      active = false;
    };
  }, [refetch]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-5">
        <MppPageTitle
          action={
            <button
              onClick={refetch}
              disabled={fetching}
              className="flex items-center gap-2 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-sm font-medium text-emerald-300 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${fetching ? 'animate-spin' : ''}`} />
              {fetching ? t('mpp.tests.fetching') : t('mpp.tests.refetch')}
            </button>
          }
        />
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          {error === 'token_expired'
            ? t('mpp.tests.error.tokenExpired')
            : t('mpp.tests.error.generic')}
        </p>
      )}

      {data === null ? (
        <Spinner />
      ) : data.matches.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-500">
          {t('mpp.tests.empty')}
        </p>
      ) : (
        <>
          <DateStrip
            buckets={buckets}
            active={activeKey}
            onSelect={setDay}
            t={t}
            loc={loc}
          />
          {activeMatches.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-500">
              {t('mpp.tests.emptyDay')}
            </p>
          ) : (
            <Table
              data={data}
              matches={activeMatches}
              onAskRemove={setPending}
              t={t}
              loc={loc}
              language={language}
              nameWidth={nameWidth}
            />
          )}
        </>
      )}

      {pending && (
        <ConfirmModal
          label={fmtFetch(pending, loc)}
          onCancel={() => setPending(null)}
          onConfirm={() => removeColumn(pending)}
          t={t}
        />
      )}
    </div>
  );
}

function DateStrip({
  buckets,
  active,
  onSelect,
  t,
  loc,
}: {
  buckets: DayBucket[];
  active: string | null;
  onSelect: (key: string) => void;
  t: TFn;
  loc: string;
}) {
  const pillClass = (selected: boolean) =>
    `shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
      selected
        ? 'bg-emerald-500/15 text-emerald-300'
        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
    }`;
  return (
    <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
      {buckets.map((b) => (
        <button key={b.key} onClick={() => onSelect(b.key)} className={pillClass(b.key === active)}>
          {dayLabel(b.key, t, loc)}
        </button>
      ))}
      <button onClick={() => onSelect(ALL)} className={pillClass(active === ALL)}>
        {t('mpp.tests.all')}
      </button>
    </div>
  );
}

function Table({
  data,
  matches,
  onAskRemove,
  t,
  loc,
  language,
  nameWidth,
}: {
  data: MppTests;
  matches: MppTestMatch[];
  onAskRemove: (b: string) => void;
  t: TFn;
  loc: string;
  language: string;
  nameWidth: number;
}) {
  // Drop fetch columns with no data for any displayed match.
  const columns = data.columns.filter((c) => matches.some((m) => m.cells[c]));
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse border border-slate-700 text-center text-sm">
        <thead>
          <tr>
            <th className="border border-slate-700 bg-slate-800/60 px-3 py-2 text-center font-medium text-slate-300">
              {t('mpp.tests.match')}
            </th>
            {columns.map((c) => (
              <th
                key={c}
                className="relative border border-slate-700 bg-slate-800/60 px-8 py-2 font-medium text-slate-300"
              >
                {fmtFetch(c, loc)}
                <button
                  onClick={() => onAskRemove(c)}
                  title={t('mpp.tests.removeFetchTitle')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-red-500 transition-colors hover:bg-red-500/15 hover:text-red-400"
                >
                  <X className="h-4 w-4" />
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matches.map((m) => (
            <tr key={m.match_id}>
              <td className="border border-slate-700 px-3 py-2 align-middle">
                <div className="flex items-center justify-center gap-1.5 font-semibold text-slate-100">
                  <TeamCrest src={m.home_crest} className="h-5 w-5" />
                  {m.home ? countryName(m.home, language) : '?'}
                  <span className="text-slate-500">{t('mpp.tests.vs')}</span>
                  {m.away ? countryName(m.away, language) : '?'}
                  <TeamCrest src={m.away_crest} className="h-5 w-5" />
                </div>
                {fmtKickoff(m.date, loc) && (
                  <div className="text-xs text-slate-500">{fmtKickoff(m.date, loc)}</div>
                )}
              </td>
              {columns.map((c) => (
                <td key={c} className="border border-slate-700 px-2 py-2 align-middle">
                  <Cell match={m} cell={m.cells[c]} t={t} language={language} nameWidth={nameWidth} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({
  match,
  cell,
  t,
  language,
  nameWidth,
}: {
  match: MppTestMatch;
  cell: MppCoteCell | undefined;
  t: TFn;
  language: string;
  nameWidth: number;
}) {
  if (!cell) return <span className="text-slate-600">.</span>;
  const { cote, prono } = cell;
  // Espérance = cote × probability (the average points that outcome is worth).
  const espVal = (c: number | null, p: number | null) =>
    c == null || p == null ? null : Math.round(c * p);
  // Row total: sum the present values, or null ('.') when the whole row is empty.
  const sum = (vals: (number | null)[]) => {
    const present = vals.filter((v): v is number => v != null);
    return present.length ? present.reduce((a, v) => a + v, 0) : null;
  };

  const cotes = [cote.home, cote.draw, cote.away];
  const probs = [pct(prono.home), pct(prono.draw), pct(prono.away)];
  const esps = [
    espVal(cote.home, prono.home),
    espVal(cote.draw, prono.draw),
    espVal(cote.away, prono.away),
  ];
  return (
    <table className="mx-auto border-collapse text-center">
      <tbody>
        <tr className="text-sm font-bold text-white">
          <Td />
          <Td w={nameWidth}>{match.home ? countryName(match.home, language) : '1'}</Td>
          <Td>N</Td>
          <Td w={nameWidth}>{match.away ? countryName(match.away, language) : '2'}</Td>
          <Td>{t('mpp.tests.total')}</Td>
        </tr>
        <tr className="font-mono text-sm text-slate-100">
          <Label>{t('mpp.tests.odds')}</Label>
          <Td>{num(cotes[0])}</Td>
          <Td>{num(cotes[1])}</Td>
          <Td>{num(cotes[2])}</Td>
          <Td strong>{num(sum(cotes))}</Td>
        </tr>
        <tr className="font-mono text-sm text-slate-400">
          <Label>{t('mpp.tests.probability')}</Label>
          <Td>{num(probs[0], '%')}</Td>
          <Td>{num(probs[1], '%')}</Td>
          <Td>{num(probs[2], '%')}</Td>
          <Td strong>{num(sum(probs), '%')}</Td>
        </tr>
        <tr className="font-mono text-sm text-amber-300/90">
          <Label>{t('mpp.tests.expected')}</Label>
          <Td>{num(esps[0])}</Td>
          <Td>{num(esps[1])}</Td>
          <Td>{num(esps[2])}</Td>
          <Td strong>{num(sum(esps))}</Td>
        </tr>
      </tbody>
    </table>
  );
}

function Td({
  children,
  strong,
  w,
}: {
  children?: React.ReactNode;
  strong?: boolean;
  w?: number;
}) {
  return (
    <td
      style={w ? { width: `${w}ch`, whiteSpace: 'nowrap' } : undefined}
      className={`border border-slate-700/70 px-2 py-0.5 ${strong ? 'font-semibold text-slate-100' : ''}`}
    >
      {children}
    </td>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <td className="border border-slate-700/70 px-2 py-0.5 text-center font-sans text-sm font-bold text-white">
      {children}
    </td>
  );
}

function ConfirmModal({
  label, onCancel, onConfirm, t,
}: { label: string; onCancel: () => void; onConfirm: () => void; t: TFn }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-slate-100">{t('mpp.tests.confirm.title')}</h2>
        <p className="mt-1.5 text-sm text-slate-400">
          {t('mpp.tests.confirm.bodyBefore')} <span className="text-slate-200">{label}</span>{' '}
          {t('mpp.tests.confirm.bodyAfter')}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800"
          >
            {t('mpp.tests.cancel')}
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-red-500/90 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-500"
          >
            {t('mpp.tests.remove')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex h-40 items-center justify-center">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-700 border-t-emerald-500" />
    </div>
  );
}
