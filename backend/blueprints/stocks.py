"""Stocks sub-app — private big-tech earnings table.

Gated to the site owner via GYM_OWNER_EMAIL (reused as the single owner email).

Each cell shows quarterly growth vs. the same quarter 1y and 3y ago, pulled
live from each company's investor-relations press releases. Press-release URLs
follow predictable per-company patterns keyed by (quarter, fiscal_year), so
adding future quarters is just bumping CURRENT_QUARTER / CURRENT_FY.
"""

import logging
import os
import re
from datetime import date, datetime, timedelta
from functools import lru_cache, wraps
from zoneinfo import ZoneInfo

import requests as http_requests
import yfinance
from flask import Blueprint, jsonify

from auth import get_current_user
from database import get_db

logger = logging.getLogger(__name__)

stocks_bp = Blueprint('stocks', __name__)


# ── Owner gate ───────────────────────────────────────────────────────────────

def owner_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        owner_email = os.environ.get('GYM_OWNER_EMAIL', '').strip().lower()
        if not owner_email:
            return jsonify({'error': 'Owner not configured'}), 500
        user_id = get_current_user()
        if user_id is None:
            return jsonify({'error': 'Authentication required'}), 401
        with get_db() as conn:
            row = conn.execute('SELECT email FROM users WHERE id = ?', (user_id,)).fetchone()
        if not row or (row['email'] or '').strip().lower() != owner_email:
            return jsonify({'error': 'Forbidden'}), 403
        return f(*args, **kwargs)
    return wrapper


@stocks_bp.route('/api/stocks/access', methods=['GET'])
def stocks_access():
    owner_email = os.environ.get('GYM_OWNER_EMAIL', '').strip().lower()
    user_id = get_current_user()
    if not owner_email or user_id is None:
        return jsonify({'allowed': False})
    with get_db() as conn:
        row = conn.execute('SELECT email FROM users WHERE id = ?', (user_id,)).fetchone()
    return jsonify({'allowed': bool(row and (row['email'] or '').strip().lower() == owner_email)})


# ── Press-release sources ────────────────────────────────────────────────────

NVIDIA_QUARTER_SLUGS = {
    1: 'first-quarter-fiscal',
    2: 'second-quarter-fiscal',
    3: 'third-quarter-fiscal',
    4: 'fourth-quarter-and-fiscal',  # Q4 release also covers the full year
}


def nvidia_press_url(quarter: int, fiscal_year: int) -> str:
    slug = NVIDIA_QUARTER_SLUGS[quarter]
    return (
        'https://nvidianews.nvidia.com/news/'
        f'nvidia-announces-financial-results-for-{slug}-{fiscal_year}'
    )


# Sentence-level matchers for Nvidia revenue lines in Q4 press releases.
#   TTM:       "For fiscal 2026, revenue was $215.9 billion, up 65% from a year ago."
#   Quarterly: "revenue for the fourth quarter ended January 25, 2026, of $68.1 billion, up ..."
_NVIDIA_FY_SENTENCE_RE = re.compile(
    r'For\s+fiscal\s+\d{4},\s+revenue\s+was\s+\$[\d.]+\s*billion[^.]*\.',
    re.IGNORECASE,
)
_NVIDIA_Q_SENTENCE_RE = re.compile(
    r'revenue\s+for\s+the\s+\w+\s+quarter\s+ended[^.]*\$[\d.]+\s*billion[^.]*\.',
    re.IGNORECASE,
)
_NVIDIA_AMOUNT_RE = re.compile(r'\$([\d.]+)\s*billion', re.IGNORECASE)


@lru_cache(maxsize=64)
def _fetch_nvidia_page(quarter: int, fiscal_year: int) -> tuple[str, str]:
    """Fetch and cache the press-release HTML. Returns (text, url)."""
    url = nvidia_press_url(quarter, fiscal_year)
    r = http_requests.get(url, timeout=15)
    r.raise_for_status()
    return r.text, url


def _fetch_nvidia_evidence(quarter: int, fiscal_year: int, mode: str) -> dict:
    """Returns {value, quote, url, label}. mode = 'ttm' | 'quarterly'."""
    if mode == 'ttm' and quarter != 4:
        raise NotImplementedError('TTM only implemented for Q4 releases so far')
    text, url = _fetch_nvidia_page(quarter, fiscal_year)
    if mode == 'ttm':
        regex = _NVIDIA_FY_SENTENCE_RE
        label = f'TTM FY{fiscal_year}'
    elif mode == 'quarterly':
        regex = _NVIDIA_Q_SENTENCE_RE
        label = f'Q{quarter} FY{fiscal_year}'
    else:
        raise ValueError(f'Unknown mode: {mode}')
    m = regex.search(text)
    if not m:
        raise ValueError(f'No {mode} revenue sentence found at {url}')
    quote = re.sub(r'\s+', ' ', m.group(0)).strip()
    if quote and quote[0].islower():
        quote = quote[0].upper() + quote[1:]
    num = _NVIDIA_AMOUNT_RE.search(quote)
    if not num:
        raise ValueError(f'Could not extract amount from quote at {url}')
    return {
        'value': float(num.group(1)),
        'quote': quote,
        'url': url,
        'label': label,
    }


def _safe_nvidia(quarter: int, fiscal_year: int, mode: str) -> dict | None:
    try:
        return _fetch_nvidia_evidence(quarter, fiscal_year, mode)
    except Exception as e:
        logger.warning('Nvidia %s revenue fetch failed (Q%d FY%d): %s', mode, quarter, fiscal_year, e)
        return None


# ── Data endpoint ────────────────────────────────────────────────────────────
#
# Bump these when a newer quarter is released. (Future: auto-detect.)
CURRENT_QUARTER = 4
CURRENT_FY = 2026

# "as of" date — today in Paris time, formatted like "May 11th, 2026".
_PARIS = ZoneInfo('Europe/Paris')


def _ordinal(n: int) -> str:
    if 10 <= n % 100 <= 20:
        suffix = 'th'
    else:
        suffix = {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')
    return f'{n}{suffix}'


def _as_of_label() -> str:
    now = datetime.now(_PARIS)
    return f'{now.strftime("%B")} {_ordinal(now.day)}, {now.year}'


# ── TTL cache decorator ──────────────────────────────────────────────────────

def _ttl_cache(seconds: int):
    """Per-key in-memory cache with a fixed TTL.

    Decorates functions whose first positional argument is the cache key
    (typically a ticker symbol). Stores (timestamp, result) pairs in a
    module-level dict that is created once per decorated function.
    """
    def decorator(fn):
        store: dict[str, tuple[datetime, object]] = {}
        ttl = timedelta(seconds=seconds)

        @wraps(fn)
        def wrapper(key, *args, **kwargs):
            cached = store.get(key)
            if cached and (datetime.now() - cached[0]) < ttl:
                return cached[1]
            result = fn(key, *args, **kwargs)
            store[key] = (datetime.now(), result)
            return result

        return wrapper
    return decorator


# ── Next-earnings dates (Yahoo Finance via yfinance) ─────────────────────────
#
# Cached for 6h so the page stays snappy. Day-count is recomputed per-request
# from Paris-local "today", so the countdown ticks down at midnight Paris time
# without needing a cache flush.

TICKERS: dict[str, str] = {
    'Nvidia': 'NVDA',
    'Alphabet': 'GOOGL',
    'Amazon': 'AMZN',
    'Meta': 'META',
    'Microsoft': 'MSFT',
}


@_ttl_cache(seconds=6 * 3600)
def _fetch_next_earnings_iso(ticker: str) -> str | None:
    """ISO date (YYYY-MM-DD) of next scheduled earnings call, or None."""
    iso: str | None = None
    try:
        cal = yfinance.Ticker(ticker).calendar or {}
        dates = cal.get('Earnings Date') or []
        if dates:
            iso = dates[0].isoformat()
    except Exception as e:
        logger.warning('Earnings fetch failed for %s: %s', ticker, e)
    return iso


# ── Stock prices (Yahoo Finance via yfinance) ────────────────────────────────
#
# Adjusted closes — yfinance auto_adjust=True normalizes for splits/dividends,
# so Nvidia's 2024 10-for-1 split doesn't break the 3-year comparison.

@_ttl_cache(seconds=6 * 3600)
def _fetch_stock_prices(ticker: str) -> dict | None:
    """Return {'current', 'currentDate', 'oneY', 'oneYDate', 'threeY', 'threeYDate'}."""
    result: dict | None = None
    try:
        import pandas as pd
        hist = yfinance.Ticker(ticker).history(
            period='4y', interval='1d', auto_adjust=True,
        )
        if not hist.empty:
            latest_ts = hist.index[-1]
            target_1y = latest_ts - pd.DateOffset(years=1)
            target_3y = latest_ts - pd.DateOffset(years=3)
            idx_1y = hist.index.get_indexer([target_1y], method='nearest')[0]
            idx_3y = hist.index.get_indexer([target_3y], method='nearest')[0]
            result = {
                'current': round(float(hist['Close'].iloc[-1]), 2),
                'currentDate': latest_ts.date().isoformat(),
                'oneY': round(float(hist['Close'].iloc[idx_1y]), 2),
                'oneYDate': hist.index[idx_1y].date().isoformat(),
                'threeY': round(float(hist['Close'].iloc[idx_3y]), 2),
                'threeYDate': hist.index[idx_3y].date().isoformat(),
            }
    except Exception as e:
        logger.warning('Stock history fetch failed for %s: %s', ticker, e)
    return result


def _stock_price_cell(ticker: str) -> dict | None:
    p = _fetch_stock_prices(ticker)
    if not p:
        return None
    chart_url = f'https://finance.yahoo.com/quote/{ticker}/history'
    cell = {
        'oneY': (p['current'] - p['oneY']) / p['oneY'],
        'threeY': (p['current'] - p['threeY']) / p['threeY'],
        'current': p['current'],
        'oneYValue': p['oneY'],
        'threeYValue': p['threeY'],
        'unit': '$',
        'evidence': [
            {'label': f'Close on {p["currentDate"]}',
             'value': p['current'],
             'quote': f'Closing price on {p["currentDate"]} (split-adjusted): ${p["current"]:.2f}',
             'url': chart_url},
            {'label': f'Close on {p["oneYDate"]}',
             'value': p['oneY'],
             'quote': f'Closing price on {p["oneYDate"]} (split-adjusted): ${p["oneY"]:.2f}',
             'url': chart_url},
            {'label': f'Close on {p["threeYDate"]}',
             'value': p['threeY'],
             'quote': f'Closing price on {p["threeYDate"]} (split-adjusted): ${p["threeY"]:.2f}',
             'url': chart_url},
        ],
    }
    return cell


def _build_growth_cell(cur: dict | None, one: dict | None, three: dict | None, unit: str = '$B') -> dict | None:
    cell: dict = {}
    if cur and one:
        cell['oneY'] = (cur['value'] - one['value']) / one['value']
    if cur and three:
        cell['threeY'] = (cur['value'] - three['value']) / three['value']
    if cur:
        cell['current'] = cur['value']
    if one:
        cell['oneYValue'] = one['value']
    if three:
        cell['threeYValue'] = three['value']
    cell['unit'] = unit
    evidence = [e for e in (cur, one, three) if e]
    if ('oneY' in cell or 'threeY' in cell) and evidence:
        cell['evidence'] = evidence
        return cell
    return None


@stocks_bp.route('/api/stocks/data', methods=['GET'])
@owner_required
def stocks_data():
    """Growth metrics for each (company, metric) cell, in both TTM and quarterly modes.

    Returns: { asOf, data: { Company: { Metric: { ttm?, quarterly? } } } }
    Each mode's payload is { oneY?, threeY?, evidence: [...] }.
    Only Nvidia/Revenue is wired up so far.
    """
    data: dict[str, dict[str, dict]] = {}

    for mode in ('ttm', 'quarterly'):
        cur = _safe_nvidia(CURRENT_QUARTER, CURRENT_FY, mode)
        one = _safe_nvidia(CURRENT_QUARTER, CURRENT_FY - 1, mode)
        three = _safe_nvidia(CURRENT_QUARTER, CURRENT_FY - 3, mode)
        cell = _build_growth_cell(cur, one, three, unit='$B')
        if cell:
            data.setdefault('Nvidia', {}).setdefault('Revenue', {})[mode] = cell

    # Stock prices — same payload in both modes (not an accounting concept).
    for company, ticker in TICKERS.items():
        price_cell = _stock_price_cell(ticker)
        if price_cell:
            data.setdefault(company, {})['Stock price'] = {
                'ttm': price_cell,
                'quarterly': price_cell,
            }

    today = datetime.now(_PARIS).date()
    earnings: dict[str, dict] = {}
    for company, ticker in TICKERS.items():
        iso = _fetch_next_earnings_iso(ticker)
        if not iso:
            continue
        try:
            d = date.fromisoformat(iso)
        except ValueError:
            continue
        earnings[company] = {'date': iso, 'daysUntil': (d - today).days}

    return jsonify({
        'asOf': _as_of_label(),
        'data': data,
        'earnings': earnings,
    })
