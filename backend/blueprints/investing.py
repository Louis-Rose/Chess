"""Investing sub-app.

The correlation endpoint is public. The transactions endpoint is gated behind
the main Google-auth session and scoped to the logged-in user, so each person
only ever sees their own portfolio history.

Computes a Pearson correlation matrix of daily returns for a chosen subset of
the largest US-listed companies, using adjusted close prices from Yahoo Finance.

We correlate daily returns (pct change), never raw prices: price levels trend
together over time and would show spurious correlation. Tickers are restricted
to a fixed allowlist (UNIVERSE) so the public endpoint can't be used to hammer
Yahoo with arbitrary symbols. The whole universe's returns are downloaded once
into a disk-backed cache (warmed at startup, refreshed in the background past
its TTL); each request just slices the columns it needs.
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
    raw = yf.download(list(UNIVERSE), start=_START, end=end,
                      auto_adjust=True, progress=False)['Close']
    # fill_method=None: don't forward-fill missing prices before differencing
    # (pandas' deprecated default), so gaps stay NA instead of faking 0% returns.
    return raw.pct_change(fill_method=None).dropna(how='all')


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
