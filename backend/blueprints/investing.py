"""Investing sub-app.

Every endpoint is gated behind the main Google-auth session and scoped to the
logged-in user, so each person only ever sees their own portfolio and their own
correlation selection.

The correlation tool computes a Pearson correlation matrix of daily returns,
using adjusted close prices from Yahoo Finance. We correlate daily returns (pct
change), never raw prices: price levels trend together over time and would show
spurious correlation.

The set of known tickers (the "universe") is a shared, growable table seeded
from _SEED_UNIVERSE: whenever any user demands a ticker we don't know yet, we
fetch it on demand and add it to the universe permanently, so it becomes
available to everyone. The whole universe's returns are downloaded into a
disk-backed cache (warmed at startup, refreshed in the background past its TTL);
each request slices the columns it needs and fetches anything still missing.
"""

import logging
import os
import pickle
import tempfile
import threading
import time
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

from auth import login_required
from database import get_db

logger = logging.getLogger(__name__)

investing_bp = Blueprint('investing', __name__)

# Seed for the shared ticker universe (the ~100 largest S&P 500 companies by
# market cap). Loaded into the correlation_universe table on first use; the live
# universe grows from there as users demand new tickers, so this is only a seed.
_SEED_UNIVERSE = {
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

# Live, shared ticker universe (correlation_universe table), cached in memory.
# Seeded from _SEED_UNIVERSE on first use, then grows as users demand tickers.
_universe_cache = {'data': None}   # {ticker: name}
_universe_lock = threading.Lock()


def _seed_universe(conn):
    for ticker, name in _SEED_UNIVERSE.items():
        conn.execute(
            "INSERT INTO correlation_universe (ticker, name) VALUES (?, ?) "
            "ON CONFLICT (ticker) DO NOTHING",
            (ticker, name),
        )


def _universe():
    """The live {ticker: name} universe, seeded on first use and cached."""
    if _universe_cache['data'] is not None:
        return _universe_cache['data']
    with _universe_lock:
        if _universe_cache['data'] is not None:
            return _universe_cache['data']
        with get_db() as conn:
            rows = conn.execute("SELECT ticker, name FROM correlation_universe").fetchall()
            if not rows:
                _seed_universe(conn)
                rows = conn.execute("SELECT ticker, name FROM correlation_universe").fetchall()
        _universe_cache['data'] = {r['ticker']: r['name'] for r in rows}
    return _universe_cache['data']


def _add_to_universe(ticker, name):
    """Add a ticker to the shared universe permanently (idempotent) and drop the
    in-memory cache so the next read picks it up."""
    with get_db() as conn:
        conn.execute(
            "INSERT INTO correlation_universe (ticker, name) VALUES (?, ?) "
            "ON CONFLICT (ticker) DO NOTHING",
            (ticker, name),
        )
    _universe_cache['data'] = None


_START = '2023-01-01'
_CACHE_TTL = 12 * 3600  # 12h — daily closes only change once a day
_CACHE_FILE = os.path.join(tempfile.gettempdir(), 'lumna_investing_returns.pkl')

# In-memory cache of the whole universe's daily returns. The download is the
# only slow step; once this is warm every request is just a pandas slice.
_returns_cache = {'data': None, 'ts': 0.0}
_load_lock = threading.Lock()   # serialises the first (cold) blocking download
_refreshing = False             # de-dupes background refreshes


def _download_returns():
    """Pull adjusted closes for the whole universe and turn them into a
    daily-return DataFrame. The slow, network-bound step. yfinance is imported
    lazily so a slow or broken import never blocks app startup."""
    import yfinance as yf

    end = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    # auto_adjust=True returns split/dividend-adjusted prices in the 'Close'
    # field (the modern equivalent of the old 'Adj Close').
    raw = yf.download(list(_universe()), start=_START, end=end,
                      auto_adjust=True, progress=False)['Close']
    # fill_method=None: don't forward-fill missing prices before differencing
    # (pandas' deprecated default), so gaps stay NA instead of faking 0% returns.
    return raw.pct_change(fill_method=None).dropna(how='all')


def _download_returns_for(tickers):
    """Daily-return frame for an arbitrary list of tickers, fetched directly.
    Used for tickers not yet in the warm universe cache. Returns None on failure
    or an empty input."""
    import pandas as pd
    import yfinance as yf

    if not tickers:
        return None
    end = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    raw = yf.download(tickers, start=_START, end=end,
                      auto_adjust=True, progress=False)['Close']
    # yfinance returns a Series (not a frame) for a single ticker.
    if isinstance(raw, pd.Series):
        raw = raw.to_frame(tickers[0])
    return raw.pct_change(fill_method=None).dropna(how='all')


def _returns_for(tickers):
    """Daily-return DataFrame covering `tickers`: served from the warm universe
    cache where possible, fetching anything still missing on demand."""
    import pandas as pd

    base = _load_returns()
    base_cols = set(getattr(base, 'columns', []))
    frames = {}
    missing = []
    for t in tickers:
        if t in base_cols:
            frames[t] = base[t]
        else:
            missing.append(t)
    if missing:
        try:
            fetched = _download_returns_for(missing)
        except Exception as e:
            logger.warning('on-demand returns fetch failed for %s: %s', missing, e)
            fetched = None
        if fetched is not None:
            for t in missing:
                if t in fetched.columns:
                    frames[t] = fetched[t]
    if not frames:
        return pd.DataFrame()
    return pd.DataFrame(frames)


def _resolve_ticker(ticker):
    """Validate a ticker on Yahoo and resolve a display name. Returns
    (name, ok): ok is False if the symbol has no usable price history."""
    import yfinance as yf

    t = ticker.strip().upper()
    if not t:
        return (None, False)
    try:
        closes = yf.download(t, start=_START, auto_adjust=True, progress=False)['Close']
    except Exception as e:
        logger.warning('ticker validation download failed for %s: %s', t, e)
        return (None, False)
    if closes is None or len(closes.dropna()) < 2:
        return (None, False)
    name = t
    try:
        info = yf.Ticker(t).info
        name = info.get('shortName') or info.get('longName') or t
    except Exception:
        name = t
    return (name, True)


def _store(returns, ts):
    """Update the in-memory cache and persist it to disk atomically so a
    restart loads from disk instead of re-downloading."""
    _returns_cache['data'] = returns
    _returns_cache['ts'] = ts
    try:
        tmp = _CACHE_FILE + '.tmp'
        with open(tmp, 'wb') as f:
            pickle.dump({'data': returns, 'ts': ts}, f)
        os.replace(tmp, _CACHE_FILE)
    except Exception as e:
        logger.warning('investing cache persist failed: %s', e)


def _load_from_disk():
    """Populate the in-memory cache from the on-disk pickle, if present."""
    if _returns_cache['data'] is not None:
        return
    try:
        with open(_CACHE_FILE, 'rb') as f:
            blob = pickle.load(f)
        _returns_cache['data'] = blob['data']
        _returns_cache['ts'] = blob['ts']
    except FileNotFoundError:
        pass
    except Exception as e:
        logger.warning('investing cache load failed: %s', e)


def _refresh_blocking():
    """Download synchronously, but only once: concurrent callers wait on the
    lock and then find the cache already populated."""
    with _load_lock:
        if _returns_cache['data'] is not None:
            return
        _store(_download_returns(), time.time())


def _refresh_async():
    """Refresh in the background, de-duped so only one refresh runs at a time."""
    global _refreshing
    with _load_lock:
        if _refreshing:
            return
        _refreshing = True

    def worker():
        global _refreshing
        try:
            _store(_download_returns(), time.time())
        except Exception as e:
            logger.warning('investing cache refresh failed: %s', e)
        finally:
            _refreshing = False

    threading.Thread(target=worker, daemon=True).start()


def _load_returns():
    """Daily-return DataFrame for the whole universe.

    Stale-while-revalidate: a warm cache is returned immediately; if it's past
    the TTL a background refresh is kicked off but the stale data is still
    served. Only a truly cold start (no memory, no disk) blocks."""
    if _returns_cache['data'] is None:
        _load_from_disk()

    data = _returns_cache['data']
    if data is None:
        _refresh_blocking()
        return _returns_cache['data']

    if time.time() - _returns_cache['ts'] >= _CACHE_TTL:
        _refresh_async()
    return data


def _warm():
    """Load the cache from disk and refresh it before any request arrives.
    Runs in a background thread at import time, so app startup isn't blocked."""
    try:
        _load_from_disk()
        if _returns_cache['data'] is None:
            _refresh_blocking()
        elif time.time() - _returns_cache['ts'] >= _CACHE_TTL:
            _refresh_async()
    except Exception as e:
        logger.warning('investing cache warm-up failed: %s', e)


threading.Thread(target=_warm, daemon=True).start()


# --- Live quotes (for portfolio gain/loss) ---------------------------------
# Last close per symbol, cached briefly. Unlike the correlation universe these
# are arbitrary user-held tickers, so we fetch on demand and cache per symbol.
_QUOTES_TTL = 600  # seconds
_quotes: dict = {}  # symbol -> {'price': float, 'ts': float}


def _fetch_prices(symbols):
    """Return {symbol: last_close} for the given yfinance symbols, cached for
    _QUOTES_TTL. Stale/missing symbols are (re)fetched together in one call."""
    now = time.time()
    needed = [s for s in symbols if now - _quotes.get(s, {}).get('ts', 0) >= _QUOTES_TTL]
    if needed:
        try:
            import yfinance as yf
            data = yf.download(needed, period='5d', auto_adjust=True, progress=False)['Close']
            if hasattr(data, 'columns'):  # multiple symbols -> DataFrame
                for s in needed:
                    if s in data.columns:
                        series = data[s].dropna()
                        if len(series):
                            _quotes[s] = {'price': float(series.iloc[-1]), 'ts': now}
            else:  # single symbol -> Series
                series = data.dropna()
                if len(series):
                    _quotes[needed[0]] = {'price': float(series.iloc[-1]), 'ts': now}
        except Exception as e:
            logger.warning('quotes fetch failed: %s', e)
    return {s: _quotes[s]['price'] for s in symbols if s in _quotes}


@investing_bp.route('/api/investing/quotes', methods=['GET'])
@login_required
def quotes():
    """Latest price for the requested tickers (native currency, USD for US
    stocks) plus the EURUSD rate (USD per 1 EUR) for currency conversion."""
    raw = request.args.get('tickers', '')
    tickers = [t.strip().upper() for t in raw.split(',') if t.strip()]
    tickers = list(dict.fromkeys(tickers))[:50]  # de-dupe, cap
    prices = _fetch_prices(tickers + ['EURUSD=X'])
    eurusd = prices.pop('EURUSD=X', None)
    return jsonify({
        'prices': {t: prices[t] for t in tickers if t in prices},
        'eurusd': eurusd,
    })


# --- Daily price history (for portfolio value over time) -------------------
_HISTORY_TTL = 3600  # seconds
_history_cache: dict = {}  # (tickers, start) -> {'data': ..., 'ts': float}


def _fetch_history(tickers, start):
    """Daily closes per ticker from `start` to today, cached for an hour.
    Returns {dates: [...], prices: {ticker: [close|null, ...]}}."""
    key = (','.join(sorted(tickers)), start)
    now = time.time()
    cached = _history_cache.get(key)
    if cached and now - cached['ts'] < _HISTORY_TTL:
        return cached['data']

    data = {'dates': [], 'prices': {}}
    try:
        import yfinance as yf
        end = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        df = yf.download(tickers, start=start, end=end, auto_adjust=True, progress=False)['Close']
        if not hasattr(df, 'columns'):  # single ticker -> Series
            df = df.to_frame(name=tickers[0])
        df = df.dropna(how='all')
        dates = [d.strftime('%Y-%m-%d') for d in df.index]
        prices = {}
        for t in tickers:
            if t in df.columns:
                prices[t] = [None if v != v else round(float(v), 4) for v in df[t]]  # v!=v: NaN
        data = {'dates': dates, 'prices': prices}
        _history_cache[key] = {'data': data, 'ts': now}
    except Exception as e:
        logger.warning('history fetch failed: %s', e)
    return data


@investing_bp.route('/api/investing/history', methods=['GET'])
@login_required
def history():
    """Daily price history for the requested tickers since `start` (YYYY-MM-DD)."""
    raw = request.args.get('tickers', '')
    start = request.args.get('start', '').strip()
    tickers = [t.strip().upper() for t in raw.split(',') if t.strip()]
    tickers = list(dict.fromkeys(tickers))[:50]
    try:
        datetime.strptime(start, '%Y-%m-%d')
    except ValueError:
        return jsonify({'error': 'start must be YYYY-MM-DD'}), 400
    if not tickers:
        return jsonify({'dates': [], 'prices': {}})
    return jsonify(_fetch_history(tickers, start))


@investing_bp.route('/api/investing/correlation', methods=['GET'])
@login_required
def correlation():
    """Pearson correlation matrix of daily returns for the requested tickers
    (comma-separated `tickers`). Needs at least two. Any requested ticker we
    don't know yet is added to the shared universe so it's known from now on."""
    raw = request.args.get('tickers', '')
    requested = [t.strip().upper() for t in raw.split(',') if t.strip()]
    # De-duplicate, preserving the requested order.
    seen = set()
    tickers = [t for t in requested if not (t in seen or seen.add(t))]
    if len(tickers) < 2:
        return jsonify({'error': 'Select at least two companies.'}), 400

    # Grow the shared universe with any demanded ticker we don't know yet
    # (name = symbol for now; explicit adds via /extras resolve a real name).
    universe = _universe()
    new_tickers = [t for t in tickers if t not in universe]
    if new_tickers:
        for t in new_tickers:
            _add_to_universe(t, t)
        universe = _universe()
        _refresh_async()  # fold the new tickers into the shared returns cache

    try:
        returns = _returns_for(tickers)
    except Exception as e:
        logger.warning('returns load failed: %s', e)
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
        'names': {t: universe.get(t, t) for t in tickers},
        'matrix': matrix,
        'volatilities': volatilities,
        'avg_volatility': avg_volatility,
        'start': _START,
        'observations': int(len(sub)),
    })


@investing_bp.route('/api/investing/universe', methods=['GET'])
@login_required
def universe():
    """The shared, growable ticker universe as [{ticker, name}], for the picker."""
    u = _universe()
    items = [{'ticker': t, 'name': n} for t, n in sorted(u.items())]
    return jsonify({'tickers': items})


@investing_bp.route('/api/investing/correlation/extras', methods=['GET'])
@login_required
def get_correlation_extras():
    """The current user's extra tickers (beyond their portfolio holdings)."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT ticker FROM correlation_extra_tickers WHERE user_id = ? ORDER BY ticker",
            (request.user_id,),
        ).fetchall()
    return jsonify({'tickers': [r['ticker'] for r in rows]})


@investing_bp.route('/api/investing/correlation/extras', methods=['POST'])
@login_required
def add_correlation_extra():
    """Add a ticker to the user's correlation selection. Validates it on Yahoo,
    adds it to the shared universe permanently, and stores it for this user.
    Does NOT touch the portfolio."""
    data = request.get_json(silent=True) or {}
    ticker = (data.get('ticker') or '').strip().upper()
    if not ticker:
        return jsonify({'error': 'empty ticker'}), 400

    universe = _universe()
    name = universe.get(ticker)
    if name is None:
        name, ok = _resolve_ticker(ticker)
        if not ok:
            return jsonify({'error': f'Unknown or untradable ticker: {ticker}'}), 400
        _add_to_universe(ticker, name)
        _refresh_async()  # fold the new ticker into the shared returns cache

    with get_db() as conn:
        conn.execute(
            "INSERT INTO correlation_extra_tickers (user_id, ticker) VALUES (?, ?) "
            "ON CONFLICT (user_id, ticker) DO NOTHING",
            (request.user_id, ticker),
        )
    return jsonify({'ticker': ticker, 'name': name})


@investing_bp.route('/api/investing/correlation/extras/<ticker>', methods=['DELETE'])
@login_required
def remove_correlation_extra(ticker):
    """Remove a ticker from the user's extras. The shared universe keeps it."""
    with get_db() as conn:
        conn.execute(
            "DELETE FROM correlation_extra_tickers WHERE user_id = ? AND ticker = ?",
            (request.user_id, ticker.strip().upper()),
        )
    return jsonify({'ok': True})


@investing_bp.route('/api/investing/transactions', methods=['GET'])
@login_required
def get_transactions():
    """The logged-in user's portfolio transaction history, newest first.

    Scoped to request.user_id, so a user only ever sees their own rows. The
    accounts join is just for human-readable account/bank labels.
    """
    with get_db() as conn:
        cursor = conn.execute(
            '''SELECT pt.id, pt.stock_ticker, pt.transaction_type, pt.quantity,
                      pt.transaction_date, pt.transaction_time, pt.price_per_share,
                      pt.price_currency, pt.account_id, ia.name AS account_name,
                      ia.account_type, ia.bank
               FROM portfolio_transactions pt
               LEFT JOIN investment_accounts ia ON pt.account_id = ia.id
               WHERE pt.user_id = ?
               ORDER BY pt.transaction_date DESC, pt.transaction_time DESC NULLS LAST, pt.id DESC''',
            (request.user_id,)
        )
        rows = cursor.fetchall()

    return jsonify({'transactions': [_serialize_transaction(row) for row in rows]})


def _serialize_transaction(row):
    return {
        'id': row['id'],
        'stock_ticker': row['stock_ticker'],
        'transaction_type': row['transaction_type'],
        'quantity': row['quantity'],
        'transaction_date': row['transaction_date'],
        'transaction_time': row['transaction_time'],
        'price_per_share': row['price_per_share'],
        'price_currency': row['price_currency'] or 'EUR',
        'account_id': row['account_id'],
        'account_name': row['account_name'],
        'account_type': row['account_type'],
        'bank': row['bank'],
    }


def _fetch_transaction(conn, tx_id, user_id):
    """Re-read one of the user's transactions with its account labels joined."""
    cursor = conn.execute(
        '''SELECT pt.id, pt.stock_ticker, pt.transaction_type, pt.quantity,
                  pt.transaction_date, pt.transaction_time, pt.price_per_share,
                  pt.price_currency, pt.account_id, ia.name AS account_name,
                  ia.account_type, ia.bank
           FROM portfolio_transactions pt
           LEFT JOIN investment_accounts ia ON pt.account_id = ia.id
           WHERE pt.id = ? AND pt.user_id = ?''',
        (tx_id, user_id)
    )
    return cursor.fetchone()


@investing_bp.route('/api/investing/transactions', methods=['POST'])
@login_required
def add_transaction():
    """Add a transaction to the logged-in user's portfolio."""
    data = request.get_json(silent=True) or {}

    ticker = (data.get('stock_ticker') or '').strip().upper()
    tx_type = (data.get('transaction_type') or '').strip().upper()
    transaction_date = (data.get('transaction_date') or '').strip()
    transaction_time = (data.get('transaction_time') or '').strip()
    currency = (data.get('price_currency') or 'EUR').strip().upper()
    account_id = data.get('account_id')

    if not ticker:
        return jsonify({'error': 'Ticker is required.'}), 400
    if tx_type not in ('BUY', 'SELL'):
        return jsonify({'error': 'Type must be BUY or SELL.'}), 400
    try:
        quantity = float(data.get('quantity'))
        price_per_share = float(data.get('price_per_share'))
    except (TypeError, ValueError):
        return jsonify({'error': 'Quantity and price must be numbers.'}), 400
    if quantity <= 0 or price_per_share < 0:
        return jsonify({'error': 'Quantity must be positive and price non-negative.'}), 400
    try:
        datetime.strptime(transaction_date, '%Y-%m-%d')
    except ValueError:
        return jsonify({'error': 'Date must be YYYY-MM-DD.'}), 400
    # Optional time of day (Paris time), HH:MM.
    if transaction_time:
        try:
            datetime.strptime(transaction_time, '%H:%M')
        except ValueError:
            return jsonify({'error': 'Time must be HH:MM.'}), 400
    else:
        transaction_time = None

    with get_db() as conn:
        # If an account is given, it must belong to the caller.
        if account_id is not None:
            owns = conn.execute(
                'SELECT id FROM investment_accounts WHERE id = ? AND user_id = ?',
                (account_id, request.user_id)
            ).fetchone()
            if not owns:
                return jsonify({'error': 'Unknown account.'}), 400

        new_id = conn.execute(
            '''INSERT INTO portfolio_transactions
                 (user_id, account_id, stock_ticker, transaction_type, quantity,
                  transaction_date, transaction_time, price_per_share, price_currency)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
               RETURNING id''',
            (request.user_id, account_id, ticker, tx_type, quantity,
             transaction_date, transaction_time, price_per_share, currency)
        ).fetchone()['id']
        row = _fetch_transaction(conn, new_id, request.user_id)

    # Adding a holding makes the ticker "demanded": fold it into the shared
    # correlation universe so it shows in this user's matrix by default. Best
    # effort, name = symbol; correlation validates/fetches it on first use.
    try:
        if ticker not in _universe():
            _add_to_universe(ticker, ticker)
            _refresh_async()
    except Exception as e:
        logger.warning('universe add for %s failed: %s', ticker, e)

    return jsonify({'transaction': _serialize_transaction(row)}), 201


@investing_bp.route('/api/investing/transactions/<int:tx_id>', methods=['DELETE'])
@login_required
def delete_transaction(tx_id):
    """Delete one of the logged-in user's transactions."""
    with get_db() as conn:
        deleted = conn.execute(
            'DELETE FROM portfolio_transactions WHERE id = ? AND user_id = ? RETURNING id',
            (tx_id, request.user_id)
        ).fetchone()
    if not deleted:
        return jsonify({'error': 'Transaction not found.'}), 404
    return jsonify({'ok': True})


@investing_bp.route('/api/investing/accounts', methods=['GET'])
@login_required
def get_accounts():
    """List the logged-in user's investment accounts."""
    with get_db() as conn:
        rows = conn.execute(
            '''SELECT id, name, account_type, bank
               FROM investment_accounts WHERE user_id = ?
               ORDER BY display_order, id''',
            (request.user_id,)
        ).fetchall()
    return jsonify({'accounts': [
        {'id': r['id'], 'name': r['name'], 'account_type': r['account_type'], 'bank': r['bank']}
        for r in rows
    ]})


@investing_bp.route('/api/investing/accounts', methods=['POST'])
@login_required
def add_account():
    """Create a new investment account for the logged-in user."""
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    bank = (data.get('bank') or '').strip()
    account_type = (data.get('account_type') or '').strip()
    if not name:
        return jsonify({'error': 'Account name is required.'}), 400

    with get_db() as conn:
        new_id = conn.execute(
            '''INSERT INTO investment_accounts (user_id, name, account_type, bank, display_order)
               VALUES (?, ?, ?, ?, 0) RETURNING id''',
            (request.user_id, name, account_type, bank)
        ).fetchone()['id']
    return jsonify({
        'account': {'id': new_id, 'name': name, 'account_type': account_type, 'bank': bank}
    }), 201


@investing_bp.route('/api/investing/accounts/<int:account_id>', methods=['DELETE'])
@login_required
def delete_account(account_id):
    """Delete one of the user's accounts and all of its transactions."""
    with get_db() as conn:
        owns = conn.execute(
            'SELECT id FROM investment_accounts WHERE id = ? AND user_id = ?',
            (account_id, request.user_id)
        ).fetchone()
        if not owns:
            return jsonify({'error': 'Account not found.'}), 404
        conn.execute(
            'DELETE FROM portfolio_transactions WHERE account_id = ? AND user_id = ?',
            (account_id, request.user_id)
        )
        conn.execute(
            'DELETE FROM investment_accounts WHERE id = ? AND user_id = ?',
            (account_id, request.user_id)
        )
    return jsonify({'ok': True})
