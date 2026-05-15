"""Stocks sub-app — private, owner-only.

Gated to the site owner via GYM_OWNER_EMAIL (reused as the single owner email).

Two views:
  - Earnings calendar: top US-listed companies (scraped from
    companiesmarketcap.com) with their next earnings date.
  - Per-company data: stock price + income-statement / cash-flow metrics for
    one company, pulled from Yahoo Finance via yfinance.
"""

import json
import logging
import os
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from functools import wraps
from urllib.parse import urlparse
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


# ── Price history endpoint (drives the Stock price chart) ───────────────────

_HISTORY_RANGES = {
    '1M': '1mo', '6M': '6mo', 'YTD': 'ytd',
    '1Y': '1y', '3Y': '3y', '5Y': '5y', '10Y': '10y',
}


@stocks_bp.route('/api/stocks/history/<ticker>', methods=['GET'])
@owner_required
def stocks_history(ticker: str):
    """Daily closing prices for `ticker` over ?range= (5Y/3Y/1Y/YTD/6M/1M)."""
    if not re.fullmatch(r'[A-Za-z.\-]{1,10}', ticker):
        return jsonify({'error': 'Invalid ticker'}), 400
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


# ── "as of" date ─────────────────────────────────────────────────────────────
#
# Today in Paris time, formatted like "May 11th, 2026".
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


# ── Per-company data (Yahoo Finance via yfinance) ────────────────────────────
#
# Adjusted closes — yfinance auto_adjust=True normalizes for splits/dividends,
# so a stock split doesn't break the 3-year comparison.

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


def _build_growth_cell(cur: float | None, one: float | None,
                       three: float | None, unit: str = '$B') -> dict | None:
    """Assemble a metric cell from three period values (now, 1y ago, 3y ago).

    Any of the three may be None. Growth is computed against abs(base) so the
    sign stays meaningful even when the base period was a loss. Returns None if
    there's no current value to anchor on.
    """
    if cur is None:
        return None
    cell: dict = {'current': cur, 'unit': unit}
    if one is not None:
        cell['oneYValue'] = one
        if one != 0:
            cell['oneY'] = (cur - one) / abs(one)
    if three is not None:
        cell['threeYValue'] = three
        if three != 0:
            cell['threeY'] = (cur - three) / abs(three)
    return cell


# ── Financial statements (yfinance) ──────────────────────────────────────────

def _safe_stmt(tk, attr: str):
    """Fetch one yfinance statement DataFrame, or None on failure."""
    try:
        return getattr(tk, attr)
    except Exception as e:
        logger.warning('%s fetch failed: %s', attr, e)
        return None


def _stmt_cell(df, line: str, kind: str) -> dict | None:
    """Build a now / 1y-ago / 3y-ago growth cell from one line of a yfinance
    statement. `kind` is 'annual' (columns are fiscal years) or 'quarterly'
    (columns are quarters); yfinance returns both newest-first.

    Values are converted to $B. Quarterly 3y-ago is usually unavailable (only
    ~5 quarters of history) and just comes back absent.
    """
    if df is None or getattr(df, 'empty', True) or line not in df.index:
        return None
    series = df.loc[line]
    n = len(series)

    def billions(i: int) -> float | None:
        if i >= n:
            return None
        v = series.iloc[i]
        return None if v != v else round(float(v) / 1e9, 2)   # v != v catches NaN

    if kind == 'annual':
        cur, one, three = billions(0), billions(1), billions(3)
    else:  # quarterly — compare to the same quarter 1y / 3y back
        cur, one, three = billions(0), billions(4), billions(12)
    return _build_growth_cell(cur, one, three, unit='$B')


@_ttl_cache(seconds=6 * 3600)
def _fetch_financials(ticker: str) -> dict:
    """Per-company financial-metric cells from yfinance statements.

    Returns { metric: { 'ttm': cell|None, 'quarterly': cell|None } } — 'ttm'
    from the annual statements, 'quarterly' from the quarterly ones. Metrics
    with no data in either mode (e.g. Operating Income for banks) are omitted.
    """
    tk = yfinance.Ticker(ticker)
    annual_inc = _safe_stmt(tk, 'income_stmt')
    quarterly_inc = _safe_stmt(tk, 'quarterly_income_stmt')
    annual_cf = _safe_stmt(tk, 'cashflow')
    quarterly_cf = _safe_stmt(tk, 'quarterly_cashflow')

    # metric label -> (annual df, quarterly df, yfinance line item)
    metrics = [
        ('Revenue', annual_inc, quarterly_inc, 'Total Revenue'),
        ('Operating Income', annual_inc, quarterly_inc, 'Operating Income'),
        ('Net Income', annual_inc, quarterly_inc, 'Net Income'),
        ('Operating Cash-Flow', annual_cf, quarterly_cf, 'Operating Cash Flow'),
        ('Free Cash-Flow', annual_cf, quarterly_cf, 'Free Cash Flow'),
    ]
    out: dict[str, dict] = {}
    for metric, annual, quarterly, line in metrics:
        cell = {
            'ttm': _stmt_cell(annual, line, 'annual'),
            'quarterly': _stmt_cell(quarterly, line, 'quarterly'),
        }
        if cell['ttm'] or cell['quarterly']:
            out[metric] = cell
    return out


@stocks_bp.route('/api/stocks/data', methods=['GET'])
@owner_required
def stocks_data():
    """Stock price + financial-metric growth for a single company.

    Query: ?ticker=AAPL (required). ?nocache=1 force-clears the 6h caches.

    Returns { ticker, asOf, nextEarnings, data } where `data` maps each metric
    ('Stock price', 'Revenue', 'Operating Income', 'Net Income',
    'Operating Cash-Flow', 'Free Cash-Flow') to { ttm, quarterly } cells. A
    cell is { current, oneYValue?, threeYValue?, oneY?, threeY?, unit }.
    """
    ticker = request.args.get('ticker', '').strip().upper()
    if not re.fullmatch(r'[A-Z.\-]{1,10}', ticker):
        return jsonify({'error': 'Invalid ticker'}), 400

    if request.args.get('nocache'):
        _fetch_stock_prices.cache_clear()
        _fetch_financials.cache_clear()

    data: dict[str, dict] = {}
    price_cell = _stock_price_cell(ticker)
    if price_cell:
        # Stock price isn't an accounting concept — same payload in both modes.
        data['Stock price'] = {'ttm': price_cell, 'quarterly': price_cell}
    data.update(_fetch_financials(ticker))

    # Next earnings — read straight from the calendar's per-ticker cache, so
    # this endpoint makes no extra Yahoo call for it.
    next_earnings = (_load_earnings_cache().get(ticker) or {}).get('nextEarnings')

    return jsonify({
        'ticker': ticker,
        'asOf': _as_of_label(),
        'nextEarnings': next_earnings,
        'profile': _fetch_company_profile(ticker),
        'data': data,
    })


# ── Company profile (website + IR site) ─────────────────────────────────────
#
# Just one Yahoo `.info` call per ticker, persisted forever — website and IR
# URLs rarely change, and the cache file is small even for 300 companies.
# Fetched lazily on the first time a company is opened.

_PROFILE_CACHE_FILE = os.path.join(
    os.path.dirname(__file__), os.pardir, 'stocks_profile_cache.json')
_profile_lock = threading.Lock()


def _load_profile_cache() -> dict:
    try:
        with open(_PROFILE_CACHE_FILE) as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except FileNotFoundError:
        return {}
    except Exception as e:
        logger.warning('Profile cache read failed: %s', e)
        return {}


def _save_profile_cache(cache: dict) -> None:
    try:
        tmp = _PROFILE_CACHE_FILE + '.tmp'
        with open(tmp, 'w') as f:
            json.dump(cache, f)
        os.replace(tmp, _PROFILE_CACHE_FILE)
    except Exception as e:
        logger.warning('Profile cache write failed: %s', e)


def _domain_from_url(url: str | None) -> str | None:
    if not url:
        return None
    try:
        u = url.strip()
        if '://' not in u:
            u = 'http://' + u
        host = (urlparse(u).hostname or '').lower()
        return host[4:] if host.startswith('www.') else (host or None)
    except Exception:
        return None


def _build_profile(ticker: str) -> dict:
    """Yahoo `.info` fetch only — no cache I/O. Missing fields come back as None."""
    profile = {'website': None, 'domain': None, 'irWebsite': None,
               'sector': None, 'industry': None}
    try:
        info = yfinance.Ticker(ticker).info or {}
        website = info.get('website')
        profile = {
            'website': website,
            'domain': _domain_from_url(website),
            'irWebsite': info.get('irWebsite'),
            'sector': info.get('sector'),
            'industry': info.get('industry'),
        }
    except Exception as e:
        logger.warning('Profile fetch failed for %s: %s', ticker, e)
    return profile


def _profile_entry_fresh(entry) -> bool:
    """A cache entry is usable iff it's a dict carrying every field this version
    of the code reads — older entries (no 'sector') are treated as stale."""
    return isinstance(entry, dict) and 'sector' in entry


def _fetch_company_profile(ticker: str) -> dict:
    """Return {'website', 'domain', 'irWebsite', 'sector', 'industry'} for
    `ticker`. Cached on disk after the first fetch; missing fields are None."""
    with _profile_lock:
        cache = _load_profile_cache()
        entry = cache.get(ticker)
        if _profile_entry_fresh(entry):
            return entry
    profile = _build_profile(ticker)
    with _profile_lock:
        cache = _load_profile_cache()
        cache[ticker] = profile
        _save_profile_cache(cache)
    return profile


def _ensure_profiles_cached(tickers: list[str]) -> None:
    """Batch-fetch profiles for any tickers not yet in the cache, in parallel.
    Used by the calendar build so the snapshot can carry sector for every row."""
    with _profile_lock:
        cache = _load_profile_cache()
    missing = [t for t in tickers if not _profile_entry_fresh(cache.get(t))]
    if not missing:
        return
    logger.info('Prefetching profiles for %d ticker(s)…', len(missing))
    with ThreadPoolExecutor(max_workers=_CALENDAR_WORKERS) as pool:
        results = dict(zip(missing, pool.map(_build_profile, missing)))
    with _profile_lock:
        cache = _load_profile_cache()
        cache.update(results)
        _save_profile_cache(cache)


# ── Earnings calendar (top companies by market cap) ──────────────────────────
#
# The universe is scraped live from companiesmarketcap.com (see _fetch_universe)
# and re-derived on every 24h rebuild — the top US-listed companies by market
# cap. Each row carries market cap (USD), the next earnings date and reporting
# cadence. Building a snapshot hits Yahoo Finance once per ticker, so it runs in
# a background thread — requests return the last snapshot immediately (or a
# "building" / "error" status before the first one exists).
#
# There is deliberately no static fallback: if the scrape breaks, the calendar
# page shows an error rather than silently serving stale or stand-in data.

_CALENDAR_TTL = timedelta(hours=24)
# Fetching a row is ~2 blocking HTTP calls to Yahoo. Build time flatlines past
# a handful of workers — Yahoo rate-limits total throughput per IP (6 and 12
# both ran ~107s), so extra concurrency just queues on their side and risks
# tripping abuse detection. Kept at 4: same speed, minimal footprint.
_CALENDAR_WORKERS = 4
_calendar_lock = threading.Lock()
_calendar_state: dict = {
    'snapshot': None, 'built_at': None, 'build_seconds': None,
    'refreshing': False, 'error': None,
}


def _fetch_earnings_window(ticker: str) -> dict:
    """{'nextEarnings', 'lastEarnings'} (ISO dates or None) for `ticker`.

    Both come out of a single yfinance get_earnings_dates() call — `nextEarnings`
    is the soonest future date, `lastEarnings` is the most recent past one (no
    age filter applied here; the snapshot trims it to the recent window).

    This is the only per-ticker Yahoo call left — market cap now comes from the
    companiesmarketcap.com scrape (see _fetch_universe), and the result is
    cached on disk so most builds re-fetch only a handful of tickers.
    """
    out = {'nextEarnings': None, 'lastEarnings': None}
    try:
        ed = yfinance.Ticker(ticker).get_earnings_dates(limit=16)
        if ed is not None and not ed.empty:
            now = datetime.now().astimezone()
            future = ed[ed.index > now]
            past = ed[ed.index <= now]
            if not future.empty:
                out['nextEarnings'] = future.index.min().date().isoformat()
            if not past.empty:
                out['lastEarnings'] = past.index.max().date().isoformat()
    except Exception as e:
        logger.warning('Earnings dates fetch failed for %s: %s', ticker, e)
    return out


# ── Live universe (scraped from companiesmarketcap.com) ──────────────────────

_CMC_URL = 'https://companiesmarketcap.com/'
_CMC_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
                  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
}
# How many US-listed companies the calendar tracks.
_UNIVERSE_SIZE = 300
# Safety cap on pages to scrape. Past the top ~100, only ~half of listings
# are US-listed, so 300 US-listed names need ~6-7 pages of 100; 8 is headroom.
# The scrape loop stops early once it has enough, so this is just a ceiling.
_CMC_MAX_PAGES = 8


def _parse_cmc_universe(html: str) -> list[tuple[str, str, float]]:
    """Parse companiesmarketcap.com HTML into [(ticker, name, market_cap_usd)],
    ranked.

    Keeps only US-listed names: companiesmarketcap shows a plain US ticker for
    companies listed in the US directly or via a prominent ADR (NVDA, TSM,
    TCEHY, ...), and a suffixed foreign-exchange ticker otherwise (2222.SR,
    005930.KS, ...). A ticker with no '.' suffix is therefore US-listed.

    Market cap comes straight from the page's `data-sort` value (USD), so it
    doubles as the displayed figure — no per-ticker Yahoo call for it.
    """
    rows: list[tuple[int, str, str, float]] = []
    for seg in html.split('<tr>'):
        rank_m = re.search(r'class="rank-td td-right" data-sort="(\d+)"', seg)
        name_m = re.search(r'<div class="company-name">(.*?)</div>', seg)
        code_m = re.search(
            r'<div class="company-code">(?:<span[^>]*></span>)?\s*([^<]*?)\s*</div>', seg)
        mcap_m = re.search(
            r'<td class="td-right" data-sort="(\d+)"><span class="currency-symbol-left">', seg)
        if not (rank_m and name_m and code_m and mcap_m):
            continue
        ticker = code_m.group(1).strip()
        if not ticker or '.' in ticker:        # foreign-exchange-only listing
            continue
        name = re.sub(r'\s*\(.*?\)\s*', '', name_m.group(1)).strip()
        rows.append((int(rank_m.group(1)), ticker, name, float(mcap_m.group(1))))
    rows.sort(key=lambda r: r[0])
    return [(t, n, mc) for _, t, n, mc in rows]


def _fetch_universe() -> dict[str, dict]:
    """Top US-listed companies, scraped live from companiesmarketcap.com —
    paginated until enough US-listed names are found. Returns
    {ticker: {'name': str, 'marketCap': float}}, ranked by market cap.

    Raises on any failure (network, HTTP error, or too few rows parsed — which
    means their markup changed). There is no fallback by design: a broken
    scrape must surface on the calendar page, not be papered over.
    """
    ranked: list[tuple[str, str, float]] = []
    for page in range(1, _CMC_MAX_PAGES + 1):
        url = _CMC_URL if page == 1 else f'{_CMC_URL}page/{page}/'
        r = http_requests.get(url, headers=_CMC_HEADERS, timeout=15)
        r.raise_for_status()
        ranked.extend(_parse_cmc_universe(r.text))
        if len(ranked) >= _UNIVERSE_SIZE:
            break
    if len(ranked) < _UNIVERSE_SIZE:
        raise ValueError(
            f'companiesmarketcap parse yielded only {len(ranked)} US-listed rows '
            f'(expected at least {_UNIVERSE_SIZE}) — the page markup may have changed')
    return {t: {'name': n, 'marketCap': mc} for t, n, mc in ranked[:_UNIVERSE_SIZE]}


# Per-ticker earnings dates are cached on disk: a company's next date is stable
# until it passes, so each daily build only re-fetches tickers whose cached
# date has passed, that are new to the universe, or whose entry is older than
# this many days (a safety net for reschedules / confirmations).
_EARNINGS_CACHE_FILE = os.path.join(
    os.path.dirname(__file__), os.pardir, 'stocks_earnings_cache.json')
_EARNINGS_RECHECK_DAYS = 7
# How far back the calendar surfaces past earnings — events older than this
# disappear from the snapshot (the cache still holds the original date).
_EARNINGS_PAST_WINDOW_DAYS = 14


def _load_earnings_cache() -> dict:
    """{ticker: {'nextEarnings': iso|None, 'lastEarnings': iso|None,
    'fetchedAt': iso}} from disk, or {}."""
    try:
        with open(_EARNINGS_CACHE_FILE) as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except FileNotFoundError:
        return {}
    except Exception as e:
        logger.warning('Earnings cache read failed: %s', e)
        return {}


def _save_earnings_cache(cache: dict) -> None:
    try:
        tmp = _EARNINGS_CACHE_FILE + '.tmp'
        with open(tmp, 'w') as f:
            json.dump(cache, f)
        os.replace(tmp, _EARNINGS_CACHE_FILE)
    except Exception as e:
        logger.warning('Earnings cache write failed: %s', e)


def _earnings_entry_stale(entry: dict, today: date, recheck_before: datetime) -> bool:
    """Whether a cached earnings entry should be re-fetched from Yahoo."""
    try:
        nxt, fetched_at = entry.get('nextEarnings'), entry.get('fetchedAt')
        return (
            nxt is None
            or 'lastEarnings' not in entry           # pre-window-feature entry
            or fetched_at is None
            or datetime.fromisoformat(fetched_at) < recheck_before
            or date.fromisoformat(nxt) < today
        )
    except (ValueError, TypeError):
        return True   # unparseable entry — re-fetch it


def _build_calendar_snapshot() -> list[dict]:
    """Build the ranked calendar.

    Name + market cap come from the companiesmarketcap.com scrape (no
    per-ticker call). The next earnings date comes from Yahoo, but only for
    tickers whose cached date is missing, stale or already passed — so most
    builds hit Yahoo for just a handful of tickers.
    """
    universe = _fetch_universe()
    cache = _load_earnings_cache()
    today = date.today()
    recheck_before = datetime.now() - timedelta(days=_EARNINGS_RECHECK_DAYS)

    # Split the universe into "cache still good" vs "needs a fresh fetch".
    cached: dict[str, dict] = {}                     # {ticker: {nextEarnings, lastEarnings}}
    to_fetch: list[str] = []
    for ticker in universe:
        entry = cache.get(ticker)
        if entry and not _earnings_entry_stale(entry, today, recheck_before):
            cached[ticker] = {
                'nextEarnings': entry['nextEarnings'],
                'lastEarnings': entry.get('lastEarnings'),
            }
        else:
            to_fetch.append(ticker)

    # Fetch only the stale/new ones, in parallel.
    fetched: dict[str, dict] = {}
    if to_fetch:
        with ThreadPoolExecutor(max_workers=_CALENDAR_WORKERS) as pool:
            fetched = dict(zip(to_fetch, pool.map(_fetch_earnings_window, to_fetch)))

    # Persist the merged cache (only tickers still in the universe).
    now_iso = datetime.now().isoformat()
    _save_earnings_cache({
        t: ({'nextEarnings': fetched[t]['nextEarnings'],
             'lastEarnings': fetched[t]['lastEarnings'],
             'fetchedAt': now_iso}
            if t in fetched else cache[t])
        for t in universe
    })

    # Trim past dates to the recent window — cache keeps the raw date, the
    # snapshot only surfaces it if it's still within the past N days.
    cutoff = today - timedelta(days=_EARNINGS_PAST_WINDOW_DAYS)

    def windowed(iso: str | None) -> str | None:
        if not iso:
            return None
        try:
            return iso if date.fromisoformat(iso) >= cutoff else None
        except ValueError:
            return None

    def pick(t: str) -> dict:
        return fetched[t] if t in fetched else cached[t]

    # Sector — one Yahoo `.info` call per ticker, cached forever. The first
    # build after deploy fills in all 300; subsequent builds are no-ops here.
    _ensure_profiles_cached(list(universe.keys()))
    profile_cache = _load_profile_cache()

    # Assemble + rank rows.
    rows = [
        {
            'ticker': t,
            'name': info['name'],
            'marketCap': info['marketCap'],
            'sector': (profile_cache.get(t) or {}).get('sector'),
            'nextEarnings': pick(t)['nextEarnings'],
            'lastEarnings': windowed(pick(t)['lastEarnings']),
        }
        for t, info in universe.items()
    ]
    rows.sort(key=lambda r: r['marketCap'], reverse=True)

    no_date = [r['ticker'] for r in rows if not r['nextEarnings']]
    if no_date:
        logger.warning('Calendar build: %d ticker(s) missing a next-earnings date: %s',
                       len(no_date), ', '.join(no_date))
    logger.info('Calendar build: %d rows (%d fetched from Yahoo, %d from cache)',
                len(rows), len(to_fetch), len(cached))
    return rows


# Snapshot is persisted to a JSON file so a process restart / deploy reuses the
# last build instead of cold-rebuilding (~2 min) on the next request.
_CALENDAR_CACHE_FILE = os.path.join(
    os.path.dirname(__file__), os.pardir, 'stocks_calendar_cache.json')


def _persist_calendar(snapshot: list, built_at: datetime, build_seconds: float) -> None:
    """Write the snapshot to disk (atomically) so it survives restarts."""
    try:
        tmp = _CALENDAR_CACHE_FILE + '.tmp'
        with open(tmp, 'w') as f:
            json.dump({
                'snapshot': snapshot,
                'built_at': built_at.isoformat(),
                'build_seconds': build_seconds,
            }, f)
        os.replace(tmp, _CALENDAR_CACHE_FILE)
    except Exception as e:
        logger.warning('Calendar cache write failed: %s', e)


def _hydrate_calendar_from_disk() -> None:
    """Load the last persisted snapshot into memory — called once on cold start."""
    try:
        with open(_CALENDAR_CACHE_FILE) as f:
            payload = json.load(f)
        built_at = datetime.fromisoformat(payload['built_at'])
    except FileNotFoundError:
        return
    except Exception as e:
        logger.warning('Calendar cache read failed: %s', e)
        return
    with _calendar_lock:
        if _calendar_state['built_at'] is not None:
            return  # another thread already hydrated or built
        _calendar_state['snapshot'] = payload.get('snapshot')
        _calendar_state['built_at'] = built_at
        _calendar_state['build_seconds'] = payload.get('build_seconds')


def _refresh_calendar() -> None:
    started = datetime.now()
    try:
        snapshot = _build_calendar_snapshot()
        built_at = datetime.now()
        build_seconds = (built_at - started).total_seconds()
        with _calendar_lock:
            _calendar_state['snapshot'] = snapshot
            _calendar_state['built_at'] = built_at
            _calendar_state['build_seconds'] = build_seconds
            _calendar_state['error'] = None
        _persist_calendar(snapshot, built_at, build_seconds)
        logger.info('Earnings calendar refresh complete: %d companies in %.0fs',
                    len(snapshot), build_seconds)
    except Exception as e:
        logger.exception('Earnings calendar refresh failed')
        with _calendar_lock:
            _calendar_state['error'] = str(e)
    finally:
        with _calendar_lock:
            _calendar_state['refreshing'] = False


def _ensure_calendar_fresh(force: bool = False) -> None:
    """Kick off a background refresh if the snapshot is missing or stale.

    On a cold start (in-memory snapshot empty) the last snapshot is first
    rehydrated from disk, so a process restart / deploy reuses it instantly
    instead of triggering a ~2-minute rebuild.
    """
    with _calendar_lock:
        cold = _calendar_state['built_at'] is None
    if cold:
        _hydrate_calendar_from_disk()

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
    """Top US-listed companies by market cap with their next earnings date.

    Returns the last cached snapshot immediately and refreshes in the background
    once it is older than 24h. A refresh re-scrapes the universe (name + market
    cap) from companiesmarketcap.com, then fetches next earnings dates from
    Yahoo Finance for any tickers whose cached date is missing/stale/passed.

    Status values:
      'building' — no snapshot yet, a build is in flight
      'error'    — no snapshot and the last build failed ('error' holds why)
      'ready'    — 'companies' populated ('error' is non-null if the most
                   recent refresh failed but an older snapshot is still served)

    Pass ?nocache=1 to force a background rebuild.
    """
    force = bool(request.args.get('nocache'))
    _ensure_calendar_fresh(force=force)
    with _calendar_lock:
        snapshot = _calendar_state['snapshot']
        built_at = _calendar_state['built_at']
        build_seconds = _calendar_state['build_seconds']
        refreshing = _calendar_state['refreshing']
        error = _calendar_state['error']
    if snapshot is None:
        if error:
            return jsonify({'status': 'error', 'error': error, 'companies': []})
        return jsonify({'status': 'building', 'companies': []})
    return jsonify({
        'status': 'ready',
        'asOf': _as_of_label(),
        'builtAt': built_at.isoformat() if built_at else None,
        'buildSeconds': build_seconds,
        'refreshing': refreshing,
        'error': error,
        'companies': snapshot,
    })
