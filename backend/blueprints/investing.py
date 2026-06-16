"""Investing sub-app — public.

Computes a Pearson correlation matrix of daily returns for a chosen subset of
the largest US-listed companies, using adjusted close prices from Yahoo Finance.

We correlate daily returns (pct change), never raw prices: price levels trend
together over time and would show spurious correlation. Tickers are restricted
to a fixed allowlist (UNIVERSE) so the public endpoint can't be used to hammer
Yahoo with arbitrary symbols. The whole universe's returns are downloaded once
and cached for an hour; each request just slices the columns it needs.
"""

import logging
import time
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

logger = logging.getLogger(__name__)

investing_bp = Blueprint('investing', __name__)

# The ~100 largest S&P 500 companies by market cap. Keep in sync with the
# frontend dropdown (UNIVERSE in InvestingApp.tsx).
UNIVERSE = {
    'NVDA': 'Nvidia',
    'AAPL': 'Apple',
    'MSFT': 'Microsoft',
    'GOOGL': 'Alphabet',
    'AMZN': 'Amazon',
    'META': 'Meta Platforms',
    'AVGO': 'Broadcom',
    'TSLA': 'Tesla',
    'BRK-B': 'Berkshire Hathaway',
    'LLY': 'Eli Lilly',
    'JPM': 'JPMorgan Chase',
    'WMT': 'Walmart',
    'V': 'Visa',
    'ORCL': 'Oracle',
    'MA': 'Mastercard',
    'XOM': 'Exxon Mobil',
    'NFLX': 'Netflix',
    'COST': 'Costco',
    'JNJ': 'Johnson & Johnson',
    'HD': 'Home Depot',
    'PG': 'Procter & Gamble',
    'PLTR': 'Palantir',
    'BAC': 'Bank of America',
    'ABBV': 'AbbVie',
    'CVX': 'Chevron',
    'KO': 'Coca-Cola',
    'AMD': 'AMD',
    'GE': 'GE Aerospace',
    'TMUS': 'T-Mobile US',
    'CSCO': 'Cisco',
    'WFC': 'Wells Fargo',
    'CRM': 'Salesforce',
    'PM': 'Philip Morris Intl',
    'IBM': 'IBM',
    'UNH': 'UnitedHealth',
    'MS': 'Morgan Stanley',
    'ABT': 'Abbott',
    'GS': 'Goldman Sachs',
    'LIN': 'Linde',
    'MCD': "McDonald's",
    'DIS': 'Disney',
    'INTU': 'Intuit',
    'AXP': 'American Express',
    'NOW': 'ServiceNow',
    'MRK': 'Merck',
    'T': 'AT&T',
    'RTX': 'RTX',
    'CAT': 'Caterpillar',
    'PEP': 'PepsiCo',
    'UBER': 'Uber',
    'BX': 'Blackstone',
    'VZ': 'Verizon',
    'BKNG': 'Booking Holdings',
    'SCHW': 'Charles Schwab',
    'TMO': 'Thermo Fisher',
    'C': 'Citigroup',
    'BA': 'Boeing',
    'ISRG': 'Intuitive Surgical',
    'QCOM': 'Qualcomm',
    'BLK': 'BlackRock',
    'TXN': 'Texas Instruments',
    'AMGN': 'Amgen',
    'ADBE': 'Adobe',
    'SPGI': 'S&P Global',
    'ANET': 'Arista Networks',
    'NEE': 'NextEra Energy',
    'GILD': 'Gilead Sciences',
    'HON': 'Honeywell',
    'SYK': 'Stryker',
    'DHR': 'Danaher',
    'PGR': 'Progressive',
    'PFE': 'Pfizer',
    'KKR': 'KKR',
    'TJX': 'TJX Companies',
    'LOW': "Lowe's",
    'UNP': 'Union Pacific',
    'CMCSA': 'Comcast',
    'ETN': 'Eaton',
    'COF': 'Capital One',
    'ADP': 'ADP',
    'BSX': 'Boston Scientific',
    'VRTX': 'Vertex Pharma',
    'MU': 'Micron',
    'PANW': 'Palo Alto Networks',
    'CB': 'Chubb',
    'ADI': 'Analog Devices',
    'AMAT': 'Applied Materials',
    'KLAC': 'KLA',
    'LRCX': 'Lam Research',
    'MDT': 'Medtronic',
    'CRWD': 'CrowdStrike',
    'DE': 'Deere',
    'PLD': 'Prologis',
    'SBUX': 'Starbucks',
    'INTC': 'Intel',
    'CME': 'CME Group',
    'MO': 'Altria',
    'GEV': 'GE Vernova',
}

_START = '2023-01-01'
_CACHE_TTL = 3600  # 1h — daily prices only change once a day anyway
_returns_cache = {'data': None, 'ts': 0.0}


def _load_returns():
    """Daily-return DataFrame for the whole universe, cached for an hour.

    Columns are tickers, rows are dates. yfinance is imported lazily so a slow
    or broken import never blocks app startup."""
    now = time.time()
    cached = _returns_cache['data']
    if cached is not None and now - _returns_cache['ts'] < _CACHE_TTL:
        return cached

    import yfinance as yf  # lazy: heavy import, only needed here

    end = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    # auto_adjust=True returns split/dividend-adjusted prices in the 'Close'
    # field (the modern equivalent of the old 'Adj Close').
    raw = yf.download(list(UNIVERSE), start=_START, end=end,
                      auto_adjust=True, progress=False)['Close']
    # fill_method=None: don't forward-fill missing prices before differencing
    # (pandas' deprecated default), so gaps stay NA instead of faking 0% returns.
    returns = raw.pct_change(fill_method=None).dropna(how='all')
    _returns_cache['data'] = returns
    _returns_cache['ts'] = now
    return returns


@investing_bp.route('/api/investing/correlation', methods=['GET'])
def correlation():
    """Pearson correlation matrix of daily returns for the requested tickers
    (comma-separated `tickers`, restricted to UNIVERSE). Needs at least two."""
    raw = request.args.get('tickers', '')
    requested = [t.strip().upper() for t in raw.split(',') if t.strip()]
    # Keep only known tickers, de-duplicated, preserving the requested order.
    seen = set()
    tickers = [t for t in requested
               if t in UNIVERSE and not (t in seen or seen.add(t))]
    if len(tickers) < 2:
        return jsonify({'error': 'Select at least two companies.'}), 400

    try:
        returns = _load_returns()
    except Exception as e:
        logger.warning('yfinance download failed: %s', e)
        return jsonify({'error': 'Could not fetch market data.'}), 502

    # Drop any ticker Yahoo returned no data for (column absent from the frame).
    tickers = [t for t in tickers if t in returns.columns]
    if len(tickers) < 2:
        return jsonify({'error': 'Not enough price data for the selection.'}), 502

    sub = returns[tickers].dropna()
    if len(sub) < 2:
        return jsonify({'error': 'Not enough overlapping price history.'}), 502

    corr = sub.corr()
    matrix = [[round(float(corr.loc[r, c]), 3) for c in tickers] for r in tickers]

    # Annualised volatility per stock: daily-return std scaled by sqrt(252)
    # trading days. The portfolio figure is the average across the selection.
    annual_vol = sub.std() * (252 ** 0.5)
    volatilities = {t: round(float(annual_vol[t]), 4) for t in tickers}
    avg_volatility = round(float(annual_vol.mean()), 4)

    return jsonify({
        'tickers': tickers,
        'names': {t: UNIVERSE[t] for t in tickers},
        'matrix': matrix,
        'volatilities': volatilities,
        'avg_volatility': avg_volatility,
        'start': _START,
        'observations': int(len(sub)),
    })
