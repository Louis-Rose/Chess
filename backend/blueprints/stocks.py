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
import threading
from datetime import date, datetime, timedelta
from functools import lru_cache, wraps
from zoneinfo import ZoneInfo

import requests as http_requests
import yfinance
from flask import Blueprint, jsonify, request

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


# ── Price history endpoint (drives the Stock price chart) ───────────────────

_HISTORY_RANGES = {
    '1M': '1mo', '6M': '6mo', 'YTD': 'ytd',
    '1Y': '1y', '3Y': '3y', '5Y': '5y', '10Y': '10y',
}


@stocks_bp.route('/api/stocks/history/<ticker>', methods=['GET'])
@owner_required
def stocks_history(ticker: str):
    """Daily closing prices for `ticker` over ?range= (5Y/3Y/1Y/YTD/6M/1M)."""
    if ticker not in TICKERS.values():
        return jsonify({'error': 'Unknown ticker'}), 400
    r = request.args.get('range', '1Y').upper()
    period = _HISTORY_RANGES.get(r)
    if not period:
        return jsonify({'error': 'Invalid range'}), 400
    try:
        hist = yfinance.Ticker(ticker).history(period=period, interval='1d', auto_adjust=True)
        points = [
            {'date': idx.date().isoformat(), 'close': round(float(row['Close']), 2)}
            for idx, row in hist.iterrows()
        ] if not hist.empty else []
        return jsonify({'ticker': ticker, 'range': r, 'points': points})
    except Exception as e:
        logger.exception('History fetch failed for %s', ticker)
        return jsonify({'error': str(e)}), 502


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
    module-level dict that is created once per decorated function. The
    wrapper exposes `cache_clear()` to drop all entries on demand.
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

        wrapper.cache_clear = store.clear  # type: ignore[attr-defined]
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
    Each mode's payload is { oneY?, threeY?, current?, oneYValue?, threeYValue?, unit, evidence }.
    Wired up: Nvidia/Revenue (TTM + quarterly) and Stock price for all 5 companies.

    Pass ?nocache=1 to force-clear in-process caches before fetching, so
    upstream press releases / Yahoo Finance get hit fresh on this call.
    """
    if request.args.get('nocache'):
        _fetch_nvidia_page.cache_clear()
        _fetch_next_earnings_iso.cache_clear()
        _fetch_stock_prices.cache_clear()

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


# ── Earnings calendar (top companies by market cap) ──────────────────────────
#
# A curated universe of large-cap tickers is re-ranked daily by live market cap.
# Each row carries market cap (USD), the next earnings date, and reporting
# cadence. Building a snapshot hits Yahoo Finance once per ticker, so it runs in
# a background thread — requests return the last snapshot immediately (or a
# "building" status before the first one exists).

# Curated universe: Yahoo ticker -> display name. Extend this list to grow the
# calendar; the ranking adapts on its own as market caps move.
_CALENDAR_UNIVERSE: dict[str, str] = {
    'NVDA': 'Nvidia',
    'GOOGL': 'Alphabet',
    'AAPL': 'Apple',
    'MSFT': 'Microsoft',
    'AMZN': 'Amazon',
}

# Companies whose Yahoo earnings-date history is empty or too noisy to infer
# cadence from — treated as semi-annual reporters explicitly.
_SEMI_ANNUAL_TICKERS: set[str] = {
    'NESN.SW', 'MC.PA', 'RMS.PA', 'OR.PA', 'ROG.SW', 'PRX.AS', 'BHP', 'CBA.AX',
}

_CALENDAR_TTL = timedelta(hours=24)
_calendar_lock = threading.Lock()
_calendar_state: dict = {'snapshot': None, 'built_at': None, 'refreshing': False}


@_ttl_cache(seconds=24 * 3600)
def _fx_to_usd(currency: str) -> float:
    """Conversion rate from `currency` to USD (1.0 for USD or on failure)."""
    if not currency or currency == 'USD':
        return 1.0
    try:
        rate = yfinance.Ticker(f'{currency}USD=X').fast_info['last_price']
        return float(rate) if rate else 1.0
    except Exception as e:
        logger.warning('FX rate fetch failed for %s: %s', currency, e)
        return 1.0


def _detect_frequency(ticker: str, past_dates: list) -> str:
    """'quarterly' or 'semi-annual', inferred from gaps between past earnings."""
    if ticker in _SEMI_ANNUAL_TICKERS:
        return 'semi-annual'
    import statistics
    gaps = [(past_dates[i + 1] - past_dates[i]).days for i in range(len(past_dates) - 1)]
    if not gaps:
        return 'quarterly'
    return 'quarterly' if statistics.median(gaps) < 135 else 'semi-annual'


def _fetch_calendar_row(ticker: str, name: str) -> dict:
    """Market cap (USD), next earnings date and cadence for one ticker."""
    row: dict = {
        'ticker': ticker, 'name': name,
        'marketCap': None, 'nextEarnings': None, 'frequency': 'quarterly',
    }
    try:
        fi = yfinance.Ticker(ticker).fast_info
        mc = fi['market_cap']
        if mc:
            row['marketCap'] = float(mc) * _fx_to_usd(fi['currency'])
    except Exception as e:
        logger.warning('Market cap fetch failed for %s: %s', ticker, e)
    try:
        ed = yfinance.Ticker(ticker).get_earnings_dates(limit=16)
        if ed is not None and not ed.empty:
            now = datetime.now().astimezone()
            future = ed[ed.index > now]
            if not future.empty:
                row['nextEarnings'] = future.index.min().date().isoformat()
            past = sorted(ed[ed.index <= now].index)
            row['frequency'] = _detect_frequency(ticker, past)
    except Exception as e:
        logger.warning('Earnings dates fetch failed for %s: %s', ticker, e)
        row['frequency'] = _detect_frequency(ticker, [])
    return row


def _build_calendar_snapshot() -> list[dict]:
    """Fetch every universe ticker, drop those without a market cap, rank desc."""
    rows = [_fetch_calendar_row(t, n) for t, n in _CALENDAR_UNIVERSE.items()]
    rows = [r for r in rows if r['marketCap'] is not None]
    rows.sort(key=lambda r: r['marketCap'], reverse=True)
    return rows


def _refresh_calendar() -> None:
    try:
        snapshot = _build_calendar_snapshot()
        with _calendar_lock:
            _calendar_state['snapshot'] = snapshot
            _calendar_state['built_at'] = datetime.now()
    except Exception:
        logger.exception('Earnings calendar refresh failed')
    finally:
        with _calendar_lock:
            _calendar_state['refreshing'] = False


def _ensure_calendar_fresh(force: bool = False) -> None:
    """Kick off a background refresh if the snapshot is missing or stale."""
    with _calendar_lock:
        built_at = _calendar_state['built_at']
        stale = force or built_at is None or (datetime.now() - built_at) > _CALENDAR_TTL
        if not stale or _calendar_state['refreshing']:
            return
        _calendar_state['refreshing'] = True
    threading.Thread(target=_refresh_calendar, daemon=True).start()


@stocks_bp.route('/api/stocks/earnings-calendar', methods=['GET'])
@owner_required
def stocks_earnings_calendar():
    """Top companies by market cap with their next earnings date and cadence.

    Returns the last cached snapshot immediately and refreshes in the background
    once it is older than 24h. Before the first snapshot exists, returns
    { status: 'building', companies: [] } so the client can poll.

    Pass ?nocache=1 to force a background rebuild.
    """
    force = bool(request.args.get('nocache'))
    if force:
        _fx_to_usd.cache_clear()
    _ensure_calendar_fresh(force=force)
    with _calendar_lock:
        snapshot = _calendar_state['snapshot']
        built_at = _calendar_state['built_at']
    if snapshot is None:
        return jsonify({'status': 'building', 'companies': []})
    return jsonify({
        'status': 'ready',
        'asOf': _as_of_label(),
        'builtAt': built_at.isoformat() if built_at else None,
        'companies': snapshot,
    })
