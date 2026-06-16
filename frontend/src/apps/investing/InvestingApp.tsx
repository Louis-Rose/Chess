import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { ChevronDown, TrendingUp } from 'lucide-react';
import { LumnaLogo } from '../chesscoaches/components/LumnaBrand';

// The 10 largest US-listed companies by market cap. Keep in sync with the
// backend allowlist (UNIVERSE in blueprints/investing.py).
const UNIVERSE: { ticker: string; name: string }[] = [
  { ticker: 'AAPL', name: 'Apple' },
  { ticker: 'MSFT', name: 'Microsoft' },
  { ticker: 'NVDA', name: 'Nvidia' },
  { ticker: 'GOOGL', name: 'Alphabet' },
  { ticker: 'AMZN', name: 'Amazon' },
  { ticker: 'META', name: 'Meta' },
  { ticker: 'AVGO', name: 'Broadcom' },
  { ticker: 'BRK-B', name: 'Berkshire Hathaway' },
  { ticker: 'TSLA', name: 'Tesla' },
  { ticker: 'LLY', name: 'Eli Lilly' },
];

const DEFAULT_SELECTED = ['AAPL', 'MSFT', 'NVDA', 'AMZN'];

interface CorrelationResponse {
  tickers: string[];
  names: Record<string, string>;
  matrix: number[][];
  start: string;
  observations: number;
}

// Emerald for positive correlation, rose for negative. The diagonal is always 1.
const POS_RGB = '16, 185, 129'; // emerald-500
const NEG_RGB = '244, 63, 94'; // rose-500

// Translucent fill for a matrix cell, opacity scaled by correlation strength.
function cellColor(v: number): string {
  const t = Math.max(-1, Math.min(1, v));
  const a = (0.12 + 0.55 * Math.abs(t)).toFixed(2);
  return `rgba(${t >= 0 ? POS_RGB : NEG_RGB}, ${a})`;
}

// Solid version of the same hue, for text.
function solidColor(v: number): string {
  return `rgb(${v >= 0 ? POS_RGB : NEG_RGB})`;
}

// Average correlation (rho-bar): the arithmetic mean of every unique pairwise
// coefficient, i.e. the upper triangle of the matrix, diagonal excluded.
function averageCorrelation(matrix: number[][]): number | null {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < matrix.length; i++) {
    for (let j = i + 1; j < matrix.length; j++) {
      sum += matrix[i][j];
      count += 1;
    }
  }
  return count ? sum / count : null;
}

// Effective Number of Constituents: how many fully uncorrelated stocks the
// portfolio behaves like. N / (1 + rho-bar * (N - 1)).
function effectiveNumber(rho: number, n: number): number | null {
  const denom = 1 + rho * (n - 1);
  return denom > 0 ? n / denom : null;
}

function AverageCorrelation({ value, n }: { value: number; n: number }) {
  const effective = effectiveNumber(value, n);
  return (
    <div className="flex w-full max-w-xs flex-col gap-6 rounded-2xl border border-slate-700 bg-slate-800/50 p-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-slate-300">Corrélation moyenne</span>
          <span className="text-slate-400">(ρ̄)</span>
        </div>
        <span className="text-5xl font-bold" style={{ color: solidColor(value) }}>
          {value.toFixed(3)}
        </span>
        <p className="text-sm leading-relaxed text-slate-400">
          Moyenne des corrélations entre toutes les paires d'actions sélectionnées. Elle fixe le
          plancher de risque du portefeuille : la volatilité ne peut pas descendre sous la volatilité
          moyenne des actions multipliée par √ρ̄.
        </p>
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-700 pt-6">
        <span className="text-sm font-semibold text-slate-300">Nombre effectif d'actions</span>
        <span className="text-5xl font-bold text-emerald-400">
          {effective !== null ? effective.toFixed(2) : '—'}
        </span>
        <p className="text-sm leading-relaxed text-slate-400">
          N / (1 + ρ̄(N−1)) : le nombre d'actions totalement décorrélées auquel équivaut réellement ce
          panier de {n}. Plus il est bas, moins la diversification est efficace.
        </p>
      </div>
    </div>
  );
}

function CompanyDropdown({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (ticker: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const label =
    selected.length === 0
      ? 'Select companies'
      : `${selected.length} compan${selected.length === 1 ? 'y' : 'ies'} selected`;

  return (
    <div ref={ref} className="relative w-full max-w-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3 text-left transition-colors hover:border-emerald-500"
      >
        <span className="text-slate-100">{label}</span>
        <ChevronDown
          className={`h-5 w-5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute z-10 mt-2 max-h-80 w-full overflow-auto rounded-xl border border-slate-700 bg-slate-800 py-1 shadow-xl">
          {UNIVERSE.map(({ ticker, name }) => {
            const checked = selected.includes(ticker);
            return (
              <button
                key={ticker}
                type="button"
                onClick={() => onToggle(ticker)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-slate-700/60"
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                    checked ? 'border-emerald-500 bg-emerald-500' : 'border-slate-600'
                  }`}
                >
                  {checked && (
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-slate-900" fill="none">
                      <path
                        d="M3.5 8.5l3 3 6-6"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                <span className="font-medium text-slate-100">{name}</span>
                <span className="ml-auto text-sm text-slate-500">{ticker}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CorrelationMatrix({ data }: { data: CorrelationResponse }) {
  const { tickers, matrix } = data;
  return (
    <div className="overflow-auto">
      <table className="border-separate border-spacing-1">
        <thead>
          <tr>
            <th className="p-2" />
            {tickers.map((t) => (
              <th key={t} className="p-2 text-sm font-semibold text-slate-300">
                {t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tickers.map((rowT, i) => (
            <tr key={rowT}>
              <th className="whitespace-nowrap p-2 text-right text-sm font-semibold text-slate-300">
                {rowT}
              </th>
              {tickers.map((colT, j) => {
                const v = matrix[i][j];
                return (
                  <td
                    key={colT}
                    className="h-14 w-16 rounded-md text-center text-sm font-medium text-slate-100"
                    style={{ backgroundColor: cellColor(v) }}
                    title={`${rowT} vs ${colT}: ${v.toFixed(3)}`}
                  >
                    {v.toFixed(2)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Investing app — Pearson correlation matrix of daily returns for a chosen
// subset of the largest US companies.
export function InvestingApp() {
  const [selected, setSelected] = useState<string[]>(DEFAULT_SELECTED);
  const [data, setData] = useState<CorrelationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Investing — LUMNA';
  }, []);

  const toggle = (ticker: string) =>
    setSelected((prev) =>
      prev.includes(ticker) ? prev.filter((t) => t !== ticker) : [...prev, ticker],
    );

  const tickerKey = useMemo(() => [...selected].sort().join(','), [selected]);

  useEffect(() => {
    if (selected.length < 2) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    axios
      .get<CorrelationResponse>('/api/investing/correlation', {
        params: { tickers: selected.join(',') },
      })
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch((err) => {
        if (cancelled) return;
        setData(null);
        setError(err?.response?.data?.error ?? 'Could not load correlations.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // tickerKey captures the selected set regardless of order
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickerKey]);

  const avg = useMemo(() => (data ? averageCorrelation(data.matrix) : null), [data]);

  return (
    <div className="min-h-dvh bg-slate-900 px-6 py-12 text-slate-100">
      <div className="mx-auto flex max-w-5xl flex-col items-center">
        <div className="mb-2 flex items-center gap-3">
          <LumnaLogo className="h-8 w-8" />
          <span className="text-2xl font-bold tracking-wide">Investing</span>
        </div>
        <p className="mb-8 flex items-center gap-2 text-slate-400">
          <TrendingUp className="h-4 w-4 text-emerald-400" />
          Daily-return correlation of the largest US companies
        </p>

        <div className="mb-8 flex w-full flex-col items-center">
          <CompanyDropdown selected={selected} onToggle={toggle} />
        </div>

        {selected.length < 2 && (
          <p className="text-slate-500">Select at least two companies to compare.</p>
        )}

        {loading && (
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-emerald-500" />
        )}

        {error && !loading && <p className="text-rose-400">{error}</p>}

        {data && !loading && (
          <div className="flex flex-col items-center gap-4">
            <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-center">
              <CorrelationMatrix data={data} />
              {avg !== null && <AverageCorrelation value={avg} n={data.tickers.length} />}
            </div>
            <p className="text-sm text-slate-500">
              Pearson correlation of daily returns since {data.start} · {data.observations} trading
              days
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
