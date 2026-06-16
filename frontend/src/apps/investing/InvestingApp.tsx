import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { ChevronDown, TrendingUp } from 'lucide-react';
import { LumnaLogo } from '../chesscoaches/components/LumnaBrand';
import { type CorrelationResponse, averageCorrelation, cellColor } from './shared';
import { PortfolioStats } from './PortfolioStats';

// The ~100 largest S&P 500 companies by market cap. Keep in sync with the
// backend allowlist (UNIVERSE in blueprints/investing.py).
const UNIVERSE: { ticker: string; name: string }[] = [
  { ticker: 'NVDA', name: 'Nvidia' },
  { ticker: 'AAPL', name: 'Apple' },
  { ticker: 'MSFT', name: 'Microsoft' },
  { ticker: 'GOOGL', name: 'Alphabet' },
  { ticker: 'AMZN', name: 'Amazon' },
  { ticker: 'META', name: 'Meta Platforms' },
  { ticker: 'AVGO', name: 'Broadcom' },
  { ticker: 'TSLA', name: 'Tesla' },
  { ticker: 'BRK-B', name: 'Berkshire Hathaway' },
  { ticker: 'LLY', name: 'Eli Lilly' },
  { ticker: 'JPM', name: 'JPMorgan Chase' },
  { ticker: 'WMT', name: 'Walmart' },
  { ticker: 'V', name: 'Visa' },
  { ticker: 'ORCL', name: 'Oracle' },
  { ticker: 'MA', name: 'Mastercard' },
  { ticker: 'XOM', name: 'Exxon Mobil' },
  { ticker: 'NFLX', name: 'Netflix' },
  { ticker: 'COST', name: 'Costco' },
  { ticker: 'JNJ', name: 'Johnson & Johnson' },
  { ticker: 'HD', name: 'Home Depot' },
  { ticker: 'PG', name: 'Procter & Gamble' },
  { ticker: 'PLTR', name: 'Palantir' },
  { ticker: 'BAC', name: 'Bank of America' },
  { ticker: 'ABBV', name: 'AbbVie' },
  { ticker: 'CVX', name: 'Chevron' },
  { ticker: 'KO', name: 'Coca-Cola' },
  { ticker: 'AMD', name: 'AMD' },
  { ticker: 'GE', name: 'GE Aerospace' },
  { ticker: 'TMUS', name: 'T-Mobile US' },
  { ticker: 'CSCO', name: 'Cisco' },
  { ticker: 'WFC', name: 'Wells Fargo' },
  { ticker: 'CRM', name: 'Salesforce' },
  { ticker: 'PM', name: 'Philip Morris Intl' },
  { ticker: 'IBM', name: 'IBM' },
  { ticker: 'UNH', name: 'UnitedHealth' },
  { ticker: 'MS', name: 'Morgan Stanley' },
  { ticker: 'ABT', name: 'Abbott' },
  { ticker: 'GS', name: 'Goldman Sachs' },
  { ticker: 'LIN', name: 'Linde' },
  { ticker: 'MCD', name: "McDonald's" },
  { ticker: 'DIS', name: 'Disney' },
  { ticker: 'INTU', name: 'Intuit' },
  { ticker: 'AXP', name: 'American Express' },
  { ticker: 'NOW', name: 'ServiceNow' },
  { ticker: 'MRK', name: 'Merck' },
  { ticker: 'T', name: 'AT&T' },
  { ticker: 'RTX', name: 'RTX' },
  { ticker: 'CAT', name: 'Caterpillar' },
  { ticker: 'PEP', name: 'PepsiCo' },
  { ticker: 'UBER', name: 'Uber' },
  { ticker: 'BX', name: 'Blackstone' },
  { ticker: 'VZ', name: 'Verizon' },
  { ticker: 'BKNG', name: 'Booking Holdings' },
  { ticker: 'SCHW', name: 'Charles Schwab' },
  { ticker: 'TMO', name: 'Thermo Fisher' },
  { ticker: 'C', name: 'Citigroup' },
  { ticker: 'BA', name: 'Boeing' },
  { ticker: 'ISRG', name: 'Intuitive Surgical' },
  { ticker: 'QCOM', name: 'Qualcomm' },
  { ticker: 'BLK', name: 'BlackRock' },
  { ticker: 'TXN', name: 'Texas Instruments' },
  { ticker: 'AMGN', name: 'Amgen' },
  { ticker: 'ADBE', name: 'Adobe' },
  { ticker: 'SPGI', name: 'S&P Global' },
  { ticker: 'ANET', name: 'Arista Networks' },
  { ticker: 'NEE', name: 'NextEra Energy' },
  { ticker: 'GILD', name: 'Gilead Sciences' },
  { ticker: 'HON', name: 'Honeywell' },
  { ticker: 'SYK', name: 'Stryker' },
  { ticker: 'DHR', name: 'Danaher' },
  { ticker: 'PGR', name: 'Progressive' },
  { ticker: 'PFE', name: 'Pfizer' },
  { ticker: 'KKR', name: 'KKR' },
  { ticker: 'TJX', name: 'TJX Companies' },
  { ticker: 'LOW', name: "Lowe's" },
  { ticker: 'UNP', name: 'Union Pacific' },
  { ticker: 'CMCSA', name: 'Comcast' },
  { ticker: 'ETN', name: 'Eaton' },
  { ticker: 'COF', name: 'Capital One' },
  { ticker: 'ADP', name: 'ADP' },
  { ticker: 'BSX', name: 'Boston Scientific' },
  { ticker: 'VRTX', name: 'Vertex Pharma' },
  { ticker: 'MU', name: 'Micron' },
  { ticker: 'PANW', name: 'Palo Alto Networks' },
  { ticker: 'CB', name: 'Chubb' },
  { ticker: 'ADI', name: 'Analog Devices' },
  { ticker: 'FI', name: 'Fiserv' },
  { ticker: 'MMC', name: 'Marsh & McLennan' },
  { ticker: 'AMAT', name: 'Applied Materials' },
  { ticker: 'KLAC', name: 'KLA' },
  { ticker: 'LRCX', name: 'Lam Research' },
  { ticker: 'MDT', name: 'Medtronic' },
  { ticker: 'CRWD', name: 'CrowdStrike' },
  { ticker: 'DE', name: 'Deere' },
  { ticker: 'PLD', name: 'Prologis' },
  { ticker: 'SBUX', name: 'Starbucks' },
  { ticker: 'INTC', name: 'Intel' },
  { ticker: 'CME', name: 'CME Group' },
  { ticker: 'MO', name: 'Altria' },
  { ticker: 'GEV', name: 'GE Vernova' },
];

const DEFAULT_SELECTED = ['NVDA', 'GOOGL', 'META', 'AMZN', 'MSFT'];

function CompanyDropdown({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (ticker: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
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

  const q = query.trim().toLowerCase();
  const filtered = q
    ? UNIVERSE.filter(
        ({ ticker, name }) =>
          ticker.toLowerCase().includes(q) || name.toLowerCase().includes(q),
      )
    : UNIVERSE;

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
        <div className="absolute z-10 mt-2 flex max-h-96 w-full flex-col rounded-xl border border-slate-700 bg-slate-800 shadow-xl">
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une entreprise..."
            className="m-2 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
          />
          <div className="overflow-auto pb-1">
            {filtered.length === 0 && (
              <p className="px-4 py-3 text-sm text-slate-500">Aucun résultat.</p>
            )}
            {filtered.map(({ ticker, name }) => {
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
          <div className="flex w-full flex-col items-center gap-6">
            <CorrelationMatrix data={data} />
            {avg !== null && <PortfolioStats data={data} rho={avg} />}
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
