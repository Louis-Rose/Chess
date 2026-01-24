# Investing utilities for portfolio calculations
import json
import yfinance as yf
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
from pathlib import Path
from database import USE_POSTGRES

# Global database connection (set by app.py)
_db_getter = None

# Cache TTL for current prices (15 minutes)
CURRENT_PRICE_TTL_MINUTES = 15

# Load unified stocks database from frontend
_STOCKS_JSON_PATH = Path(__file__).parent.parent / 'frontend/src/data/stocks.json'
with open(_STOCKS_JSON_PATH, 'r', encoding='utf-8') as f:
    STOCKS_DB = json.load(f)

# Build ticker to yfinance mapping from unified database
# This replaces the old EUROPEAN_TICKER_MAP
EUROPEAN_TICKER_MAP = {
    ticker: data['yfinance']
    for ticker, data in STOCKS_DB.items()
    if data['yfinance'] != ticker  # Only include if different from ticker
}

def get_yfinance_ticker(ticker):
    """Convert a plain ticker to yfinance-compatible ticker with exchange suffix if needed."""
    ticker_upper = ticker.upper().strip()
    # If already has a suffix (contains .), return as-is
    if '.' in ticker_upper:
        return ticker_upper
    # Check mapping
    return EUROPEAN_TICKER_MAP.get(ticker_upper, ticker_upper)

# Exchange suffix to currency mapping
EXCHANGE_CURRENCY_MAP = {
    # European exchanges
    '.SW': 'CHF',   # Swiss Exchange (Zurich)
    '.DE': 'EUR',   # Xetra (Frankfurt)
    '.PA': 'EUR',   # Euronext Paris
    '.AS': 'EUR',   # Euronext Amsterdam
    '.BR': 'EUR',   # Euronext Brussels
    '.LS': 'EUR',   # Euronext Lisbon
    '.MI': 'EUR',   # Borsa Italiana (Milan)
    '.MC': 'EUR',   # Bolsa de Madrid
    '.VI': 'EUR',   # Vienna Stock Exchange
    '.HE': 'EUR',   # Nasdaq Helsinki
    '.IR': 'EUR',   # Euronext Dublin (Irish)
    '.L': 'GBP',    # London Stock Exchange
    '.CO': 'DKK',   # Nasdaq Copenhagen
    '.ST': 'SEK',   # Nasdaq Stockholm
    '.OL': 'NOK',   # Oslo Børs
    # North American exchanges
    '.TO': 'CAD',   # Toronto Stock Exchange
    '.V': 'CAD',    # TSX Venture
    # Asia-Pacific exchanges
    '.AX': 'AUD',   # Australian Securities Exchange
    '.HK': 'HKD',   # Hong Kong Stock Exchange
    '.T': 'JPY',    # Tokyo Stock Exchange
    '.SI': 'SGD',   # Singapore Exchange
}

# Currency symbols for display
CURRENCY_SYMBOLS = {
    'USD': '$',
    'EUR': '€',
    'GBP': '£',
    'CHF': 'CHF ',
    'DKK': 'kr ',
    'SEK': 'kr ',
    'NOK': 'kr ',
    'CAD': 'C$',
    'AUD': 'A$',
    'HKD': 'HK$',
    'JPY': '¥',
    'SGD': 'S$',
}

# Yahoo Finance FX pair tickers (quote currency is USD)
FX_TICKERS = {
    'EURUSD': 'EURUSD=X',
    'GBPUSD': 'GBPUSD=X',
    'CHFUSD': 'CHFUSD=X',
    'DKKUSD': 'DKKUSD=X',
    'SEKUSD': 'SEKUSD=X',
    'NOKUSD': 'NOKUSD=X',
    'CADUSD': 'CADUSD=X',
    'AUDUSD': 'AUDUSD=X',
    'HKDUSD': 'HKDUSD=X',
    'JPYUSD': 'JPYUSD=X',
    'SGDUSD': 'SGDUSD=X',
}

def get_stock_currency(ticker):
    """
    Get the trading currency of a stock based on its exchange suffix.
    Returns 'USD' for US stocks (no suffix) or the appropriate currency for European exchanges.
    """
    yf_ticker = get_yfinance_ticker(ticker)

    # Check for exchange suffix
    for suffix, currency in EXCHANGE_CURRENCY_MAP.items():
        if yf_ticker.endswith(suffix):
            return currency

    # Default to USD for US stocks
    return 'USD'

def get_stock_currency_from_yfinance(ticker):
    """
    Get the trading currency directly from Yahoo Finance API.
    More accurate but slower than suffix-based detection.
    """
    try:
        yf_ticker = get_yfinance_ticker(ticker)
        stock = yf.Ticker(yf_ticker)
        info = stock.info
        return info.get('currency', 'USD')
    except:
        return get_stock_currency(ticker)  # Fallback to suffix-based

def get_fx_rate_to_usd(currency):
    """
    Get current exchange rate from a currency to USD.
    Returns how many USD you get for 1 unit of the currency.
    """
    if currency == 'USD':
        return 1.0

    pair = f"{currency}USD"
    fx_ticker = FX_TICKERS.get(pair)

    if not fx_ticker:
        print(f"Unknown currency pair: {pair}")
        return 1.0

    # Check cache first
    cached = _get_cached_current_fx_rate(pair)
    if cached is not None:
        return cached

    try:
        fx = yf.Ticker(fx_ticker)
        data = fx.history(period='1d')
        if data.empty:
            print(f"No FX data for {pair}")
            return 1.0
        rate = float(np.round((data["Open"].iloc[-1] + data["Close"].iloc[-1]) / 2, 6))

        # Cache the rate
        today = datetime.now().strftime("%Y-%m-%d")
        _save_cached_fx_rate(pair, today, rate)

        return rate
    except Exception as e:
        print(f"Error fetching FX rate {pair}: {e}")
        return 1.0

def get_fx_rate_to_eur(currency):
    """
    Get current exchange rate from a currency to EUR.
    Returns how many EUR you get for 1 unit of the currency.
    """
    if currency == 'EUR':
        return 1.0

    # Convert via USD
    rate_to_usd = get_fx_rate_to_usd(currency)
    eurusd_rate = get_current_eurusd_rate()  # EUR per USD

    # rate_to_usd = USD per 1 unit of currency
    # eurusd_rate = USD per 1 EUR, so 1/eurusd_rate = EUR per 1 USD
    return rate_to_usd / eurusd_rate

def convert_price_to_currency(price, from_currency, to_currency):
    """
    Convert a price from one currency to another.
    """
    if from_currency == to_currency:
        return price

    if to_currency == 'USD':
        return price * get_fx_rate_to_usd(from_currency)
    elif to_currency == 'EUR':
        return price * get_fx_rate_to_eur(from_currency)
    else:
        # Convert via USD
        price_usd = price * get_fx_rate_to_usd(from_currency)
        target_rate = get_fx_rate_to_usd(to_currency)
        return price_usd / target_rate if target_rate else price_usd

def set_db_getter(getter):
    """Set the database getter function from app.py"""
    global _db_getter
    _db_getter = getter

def _get_cached_price(ticker, date_str):
    """Get cached price from database"""
    if not _db_getter:
        return None
    try:
        with _db_getter() as conn:
            cursor = conn.execute(
                'SELECT close_price FROM historical_prices WHERE ticker = ? AND date = ?',
                (ticker, date_str)
            )
            row = cursor.fetchone()
            return row['close_price'] if row else None
    except:
        return None

def _get_cached_current_price(ticker):
    """Get cached current price if fresh (within TTL)"""
    if not _db_getter:
        return None
    try:
        today = datetime.now().strftime("%Y-%m-%d")
        with _db_getter() as conn:
            cursor = conn.execute(
                '''SELECT close_price, created_at FROM historical_prices
                   WHERE ticker = ? AND date = ?''',
                (ticker, today)
            )
            row = cursor.fetchone()
            if row:
                # Check if cache is fresh (within TTL)
                created_at = datetime.strptime(row['created_at'], "%Y-%m-%d %H:%M:%S")
                age_minutes = (datetime.now() - created_at).total_seconds() / 60
                if age_minutes < CURRENT_PRICE_TTL_MINUTES:
                    return row['close_price']
            return None
    except Exception as e:
        print(f"Error getting cached current price: {e}")
        return None

def _save_cached_price(ticker, date_str, price):
    """Save price to cache"""
    if not _db_getter:
        return
    # Convert numpy types to native Python types for PostgreSQL compatibility
    if price is not None:
        price = float(price)
    try:
        with _db_getter() as conn:
            if USE_POSTGRES:
                conn.execute(
                    '''INSERT INTO historical_prices (ticker, date, close_price, created_at)
                       VALUES (%s, %s, %s, %s)
                       ON CONFLICT (ticker, date) DO UPDATE SET
                       close_price = EXCLUDED.close_price, created_at = EXCLUDED.created_at''',
                    (ticker, date_str, price, datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
                )
            else:
                conn.execute(
                    'INSERT OR REPLACE INTO historical_prices (ticker, date, close_price, created_at) VALUES (?, ?, ?, ?)',
                    (ticker, date_str, price, datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
                )
    except Exception as e:
        print(f"Error caching price: {e}")

def _get_cached_fx_rate(pair, date_str):
    """Get cached FX rate from database"""
    if not _db_getter:
        return None
    try:
        with _db_getter() as conn:
            cursor = conn.execute(
                'SELECT rate FROM historical_fx_rates WHERE pair = ? AND date = ?',
                (pair, date_str)
            )
            row = cursor.fetchone()
            return row['rate'] if row else None
    except:
        return None

def _get_cached_current_fx_rate(pair):
    """Get cached current FX rate if fresh (within TTL)"""
    if not _db_getter:
        return None
    try:
        today = datetime.now().strftime("%Y-%m-%d")
        with _db_getter() as conn:
            cursor = conn.execute(
                '''SELECT rate, created_at FROM historical_fx_rates
                   WHERE pair = ? AND date = ?''',
                (pair, today)
            )
            row = cursor.fetchone()
            if row:
                # Check if cache is fresh (within TTL)
                created_at = datetime.strptime(row['created_at'], "%Y-%m-%d %H:%M:%S")
                age_minutes = (datetime.now() - created_at).total_seconds() / 60
                if age_minutes < CURRENT_PRICE_TTL_MINUTES:
                    return row['rate']
            return None
    except Exception as e:
        print(f"Error getting cached current FX rate: {e}")
        return None

def _save_cached_fx_rate(pair, date_str, rate):
    """Save FX rate to cache"""
    if not _db_getter:
        return
    # Convert numpy types to native Python types for PostgreSQL compatibility
    if rate is not None:
        rate = float(rate)
    try:
        with _db_getter() as conn:
            if USE_POSTGRES:
                conn.execute(
                    '''INSERT INTO historical_fx_rates (pair, date, rate, created_at)
                       VALUES (%s, %s, %s, %s)
                       ON CONFLICT (pair, date) DO UPDATE SET
                       rate = EXCLUDED.rate, created_at = EXCLUDED.created_at''',
                    (pair, date_str, rate, datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
                )
            else:
                conn.execute(
                    'INSERT OR REPLACE INTO historical_fx_rates (pair, date, rate, created_at) VALUES (?, ?, ?, ?)',
                    (pair, date_str, rate, datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
                )
    except Exception as e:
        print(f"Error caching FX rate: {e}")

# Stock color map for pie chart - brand colors where available
# Vibrant color palette for stocks without a defined color
VIBRANT_COLORS = [
    "#E53935",  # Red
    "#D81B60",  # Pink
    "#8E24AA",  # Purple
    "#5E35B1",  # Deep Purple
    "#3949AB",  # Indigo
    "#1E88E5",  # Blue
    "#039BE5",  # Light Blue
    "#00ACC1",  # Cyan
    "#00897B",  # Teal
    "#43A047",  # Green
    "#7CB342",  # Light Green
    "#C0CA33",  # Lime
    "#FDD835",  # Yellow
    "#FFB300",  # Amber
    "#FB8C00",  # Orange
    "#F4511E",  # Deep Orange
    "#6D4C41",  # Brown
    "#546E7A",  # Blue Grey
    "#EC407A",  # Pink 400
    "#AB47BC",  # Purple 400
    "#7E57C2",  # Deep Purple 400
    "#5C6BC0",  # Indigo 400
    "#42A5F5",  # Blue 400
    "#29B6F6",  # Light Blue 400
    "#26C6DA",  # Cyan 400
    "#26A69A",  # Teal 400
    "#66BB6A",  # Green 400
    "#9CCC65",  # Light Green 400
    "#D4E157",  # Lime 400
    "#FFEE58",  # Yellow 400
    "#FFCA28",  # Amber 400
    "#FFA726",  # Orange 400
    "#FF7043",  # Deep Orange 400
]


def get_stock_color(ticker: str) -> str:
    """Get a consistent vibrant color for any stock ticker."""
    # Check if we have a predefined color
    if ticker in STOCK_COLORS:
        return STOCK_COLORS[ticker]
    # Generate a consistent color based on ticker hash
    hash_val = sum(ord(c) * (i + 1) for i, c in enumerate(ticker.upper()))
    return VIBRANT_COLORS[hash_val % len(VIBRANT_COLORS)]


STOCK_COLORS = {
    # US Tech
    'NVDA': "#76B900",
    'GOOGL': "#DB4437",
    'GOOG': "#DB4437",
    'AMZN': "#FF9900",
    'META': "#4267B2",
    'MSFT': "#00A4EF",
    'AAPL': "#A855F7",  # Purple (distinctive, no gray)
    'TSLA': "#CC0000",
    'V': "#1A1F71",
    'NFLX': "#E50914",
    'PYPL': "#003087",
    'INTC': "#0071C5",
    'AMD': "#ED1C24",
    'CRM': "#00A1E0",
    'ADBE': "#FF0000",
    'ORCL': "#F80000",
    'IBM': "#0530AD",
    'CSCO': "#049FD9",
    # US Finance
    'JPM': "#0A5CA8",
    'BAC': "#012169",
    'GS': "#7399C6",
    'MS': "#002E5D",
    'WFC': "#D71E28",
    'C': "#003DA5",
    'AXP': "#006FCF",
    'MA': "#EB001B",
    'BLK': "#5A5A5A",  # Dark gray instead of pure black
    # US Consumer
    'WMT': "#0071CE",
    'HD': "#F96302",
    'NKE': "#F97316",  # Orange (swoosh energy)
    'SBUX': "#00704A",
    'MCD': "#FFC72C",
    'KO': "#F40009",
    'PEP': "#004B93",
    'DIS': "#113CCF",
    # US Healthcare
    'JNJ': "#D51900",
    'PFE': "#0093D0",
    'UNH': "#002677",
    'MRK': "#00857C",
    'ABBV': "#071D49",
    'LLY': "#D52B1E",
    # European
    'ASML': "#003E7E",
    'SAP': "#008FD3",
    'LVMH': "#8B6914",
    'MC': "#8B6914",  # LVMH ticker
    # French stocks (.PA) - bright colors for dark mode readability
    'MC.PA': "#F59E0B",   # LVMH - Amber (bright gold)
    'OR.PA': "#F472B6",   # L'Oreal - Pink
    'SAN.PA': "#A78BFA",  # Sanofi - Purple/Violet
    'TTE.PA': "#34D399",  # TotalEnergies - Emerald green
    'AIR.PA': "#60A5FA",  # Airbus - Sky blue
    'PNDORA': "#D4A5C9",  # Pandora pink
    # Swiss - using vibrant distinct colors
    'NESN': "#7B9A6D",  # Nestle
    'NOVN': "#E55300",  # Novartis
    'ROG': "#0066CC",  # Roche
    'UHR': "#FF9900",  # Swatch - orange like AMZN
    'UBSG': "#E60000",  # UBS
    'SQN': "#76B900",  # Swissquote - green like NVDA
    'ZURN': "#003399",  # Zurich Insurance
    'ABBN': "#FF000F",  # ABB
    'CFR': "#7B3F00",  # Richemont
    'LONN': "#0033A0",  # Lonza
    'SIKA': "#FFCC00",  # Sika
    'GEBN': "#009FE3",  # Geberit
    'GIVN': "#DB4437",  # Givaudan
    'HOLN': "#003366",  # Holcim
    'BAER': "#002B5C",  # Julius Baer
    'LOGN': "#00B8FC",  # Logitech
    'ENX': "#4267B2",  # Euronext - blue like META
    'VAHN': "#1E88E5",  # Vaudoise - blue
    'RBO': "#8E24AA",  # Roche Bobois - purple
    # Other
    'Cash': "#FFD700",
}

# Benchmark tickers
BENCHMARKS = {
    'SP500': '^GSPC',
    'QQQ': 'QQQ'
}


def fetch_stock_price(stock_ticker, date_str, use_cache=True):
    """Fetch stock closing price for a given date (with optional caching)."""
    # Check cache first (use original ticker for cache key)
    if use_cache:
        cached = _get_cached_price(stock_ticker, date_str)
        if cached is not None:
            return cached

    # Check if date is in the future
    end_date = datetime.strptime(date_str, "%Y-%m-%d")
    today = datetime.now()
    if end_date.date() > today.date():
        raise ValueError(f"Cannot fetch price for future date {date_str}")

    # Convert to yfinance ticker (add exchange suffix if needed)
    yf_ticker = get_yfinance_ticker(stock_ticker)
    ticker = yf.Ticker(yf_ticker)
    start_date = (end_date - timedelta(days=7)).strftime('%Y-%m-%d')
    # yfinance end date is EXCLUSIVE, so add 1 day to include the target date
    end_date_query = (end_date + timedelta(days=1)).strftime('%Y-%m-%d')
    try:
        prices_history = ticker.history(start=start_date, end=end_date_query)
    except Exception as e:
        raise ValueError(f"Failed to fetch price for {stock_ticker}: {str(e)}")
    if prices_history.empty:
        # Try fetching more days back
        start_date = (end_date - timedelta(days=14)).strftime('%Y-%m-%d')
        try:
            prices_history = ticker.history(start=start_date, end=end_date_query)
        except Exception as e:
            raise ValueError(f"Failed to fetch price for {stock_ticker}: {str(e)}")
    if prices_history.empty:
        raise ValueError(f"No price data found for {stock_ticker} around {date_str}")

    # Try to get the exact date's average price (OHLC/4), otherwise use the last available
    try:
        # Convert date_str to match yfinance index format
        target_date = end_date.strftime('%Y-%m-%d')
        matching_dates = [d for d in prices_history.index if d.strftime('%Y-%m-%d') == target_date]
        if matching_dates:
            row = prices_history.loc[matching_dates[0]]
            # Use average of Open, High, Low, Close for better approximation
            avg_price = (row["Open"] + row["High"] + row["Low"] + row["Close"]) / 4
            price = round(avg_price, 2)
        else:
            # Fallback to last available day's average price
            row = prices_history.iloc[-1]
            avg_price = (row["Open"] + row["High"] + row["Low"] + row["Close"]) / 4
            price = round(avg_price, 2)
    except:
        price = round(prices_history["Close"].values[-1], 2)

    # Save to cache (only for past dates, not today)
    today = datetime.now().strftime("%Y-%m-%d")
    if date_str < today:
        _save_cached_price(stock_ticker, date_str, price)

    return price


def fetch_current_stock_price(stock_ticker):
    """Fetch current stock price (with 15-min TTL caching)."""
    # Check cache first (use original ticker for cache key)
    cached = _get_cached_current_price(stock_ticker)
    if cached is not None:
        return cached

    # Convert to yfinance ticker (add exchange suffix if needed)
    yf_ticker = get_yfinance_ticker(stock_ticker)
    ticker = yf.Ticker(yf_ticker)
    info = ticker.info
    # Try multiple price fields
    price = info.get('regularMarketPrice') or info.get('currentPrice') or info.get('previousClose')
    if price is None:
        # Fallback to history
        hist = ticker.history(period='1d')
        if not hist.empty:
            price = hist['Close'].iloc[-1]

    if price:
        price = round(float(price), 2)
        # Save to cache with today's date
        today = datetime.now().strftime("%Y-%m-%d")
        _save_cached_price(stock_ticker, today, price)

    return price


def fetch_current_stock_prices_batch(tickers):
    """
    Fetch current prices for multiple tickers in a single API call.
    Returns: dict mapping ticker -> price (using original ticker names as keys)
    """
    if not tickers:
        return {}

    prices = {}
    tickers_to_fetch = []
    ticker_mapping = {}  # yf_ticker -> original_ticker

    # First check cache for each ticker
    for ticker in tickers:
        cached = _get_cached_current_price(ticker)
        if cached is not None:
            prices[ticker] = cached
        else:
            yf_ticker = get_yfinance_ticker(ticker)
            tickers_to_fetch.append(yf_ticker)
            ticker_mapping[yf_ticker] = ticker

    if not tickers_to_fetch:
        return prices

    try:
        # Batch download - single API call for all tickers
        data = yf.download(
            tickers_to_fetch,
            period='1d',
            progress=False,
            threads=True,
            auto_adjust=True
        )

        today = datetime.now().strftime("%Y-%m-%d")

        if len(tickers_to_fetch) == 1:
            # Single ticker returns different structure
            yf_ticker = tickers_to_fetch[0]
            original_ticker = ticker_mapping[yf_ticker]
            if not data.empty and 'Close' in data.columns:
                price = round(float(data['Close'].iloc[-1]), 2)
                prices[original_ticker] = price
                _save_cached_price(original_ticker, today, price)
        else:
            # Multiple tickers - columns are MultiIndex
            for yf_ticker in tickers_to_fetch:
                original_ticker = ticker_mapping[yf_ticker]
                try:
                    if yf_ticker in data['Close'].columns:
                        close_val = data['Close'][yf_ticker].iloc[-1]
                        if not pd.isna(close_val):
                            price = round(float(close_val), 2)
                            prices[original_ticker] = price
                            _save_cached_price(original_ticker, today, price)
                except (KeyError, IndexError):
                    pass
    except Exception as e:
        print(f"Error in batch price fetch: {e}")

    # Fallback: fetch remaining tickers individually
    for ticker in tickers:
        if ticker not in prices:
            try:
                price = fetch_current_stock_price(ticker)
                if price:
                    prices[ticker] = price
            except Exception:
                prices[ticker] = 0

    return prices


def fetch_eurusd_rate(date_str):
    """Fetch EUR/USD exchange rate for a given date (with caching)."""
    # Check cache first
    cached = _get_cached_fx_rate('EURUSD', date_str)
    if cached is not None:
        return cached

    # Fetch from API
    eurusd = yf.Ticker("EURUSD=X")
    date = datetime.strptime(date_str, "%Y-%m-%d")
    end_date = (date + timedelta(days=7)).strftime('%Y-%m-%d')
    fx_rate_data = eurusd.history(start=date_str, end=end_date)
    if fx_rate_data.empty:
        # Try current rate
        fx_rate_data = eurusd.history(period='1d')
    if fx_rate_data.empty:
        return 1.0  # Fallback

    rate = float(np.round((fx_rate_data["Open"].values[0] + fx_rate_data["Close"].values[0]) / 2, 4))

    # Save to cache (only for past dates, not today)
    today = datetime.now().strftime("%Y-%m-%d")
    if date_str < today:
        _save_cached_fx_rate('EURUSD', date_str, rate)

    return rate


def get_current_eurusd_rate():
    """Fetch current EUR/USD exchange rate (with 15-min TTL caching)."""
    # Check cache first
    cached = _get_cached_current_fx_rate('EURUSD')
    if cached is not None:
        return cached

    # Fetch from API
    eurusd = yf.Ticker("EURUSD=X")
    info = eurusd.info
    rate = info.get('regularMarketPrice') or info.get('previousClose')
    if rate is None:
        hist = eurusd.history(period='1d')
        if not hist.empty:
            rate = hist['Close'].iloc[-1]

    if rate:
        rate = float(round(rate, 4))
        # Save to cache with today's date
        today = datetime.now().strftime("%Y-%m-%d")
        _save_cached_fx_rate('EURUSD', today, rate)
        return rate

    return 1.0


def get_previous_weekday(date=None):
    """Get the previous weekday from a given date (or today if None)."""
    if date is None:
        date = datetime.now()
    elif isinstance(date, str):
        date = datetime.strptime(date, "%Y-%m-%d")

    current_day = date
    # Keep going back until we hit a weekday (Mon-Fri)
    while current_day.weekday() >= 5:  # 5=Saturday, 6=Sunday
        current_day -= timedelta(days=1)
    return current_day.strftime("%Y-%m-%d")


def compute_portfolio_composition(holdings, target_currency='EUR'):
    """
    Compute portfolio composition with current values, weights, cost basis and gains.
    All values are converted to the target currency (EUR or USD).

    Args:
        holdings: list of dicts with 'stock_ticker', 'quantity', 'cost_basis' (avg price),
                  'total_cost' (USD), 'total_cost_eur' (EUR at historical rates)
        target_currency: 'EUR' or 'USD' - currency to display values in

    Returns:
        dict with composition data including gains/losses
    """
    composition = []
    total_value = 0  # In target currency
    total_cost_basis_eur = 0

    # Batch fetch all prices in a single API call
    all_tickers = [h['stock_ticker'] for h in holdings]
    prices = fetch_current_stock_prices_batch(all_tickers)

    # Pre-fetch FX rates for currencies we'll need
    fx_rates_to_eur = {}  # Cache FX rates

    for holding in holdings:
        ticker = holding['stock_ticker']
        quantity = holding['quantity']
        cost_basis_per_share = holding.get('cost_basis', 0)
        total_cost_eur = holding.get('total_cost_eur', holding.get('total_cost', cost_basis_per_share * quantity))

        # Get current price in native currency
        current_price_native = prices.get(ticker, 0) or 0

        # Get the stock's native currency
        native_currency = get_stock_currency(ticker)

        # Convert price to target currency
        if native_currency not in fx_rates_to_eur:
            fx_rates_to_eur[native_currency] = get_fx_rate_to_eur(native_currency)

        fx_rate = fx_rates_to_eur[native_currency]
        current_price_eur = current_price_native * fx_rate
        current_value_eur = current_price_eur * quantity

        # Calculate gain based on EUR cost basis
        gain_eur = current_value_eur - total_cost_eur
        gain_pct = round(100 * gain_eur / total_cost_eur, 1) if total_cost_eur > 0 else 0

        composition.append({
            'ticker': ticker,
            'quantity': quantity,
            'native_currency': native_currency,
            'current_price_native': round(current_price_native, 2),
            'current_price': round(current_price_eur, 2),  # In EUR
            'current_value': round(current_value_eur, 2),  # In EUR
            'cost_basis': round(total_cost_eur, 2),  # In EUR
            'cost_basis_eur': round(total_cost_eur, 2),
            'avg_cost': round(cost_basis_per_share, 2),
            'gain': round(gain_eur, 2),  # In EUR
            'gain_eur': round(gain_eur, 2),
            'gain_pct': gain_pct,
            'color': get_stock_color(ticker)
        })
        total_value += current_value_eur
        total_cost_basis_eur += total_cost_eur

    # Calculate weights
    for item in composition:
        if total_value > 0:
            item['weight'] = round(100 * item['current_value'] / total_value, 1)
        else:
            item['weight'] = 0

    # Sort by weight descending
    composition.sort(key=lambda x: -x['weight'])

    # Get EUR/USD rate for reference
    eurusd_rate = get_current_eurusd_rate()
    total_value_usd = round(total_value * eurusd_rate, 2)
    total_gain_eur = total_value - total_cost_basis_eur
    total_gain_pct = round(100 * total_gain_eur / total_cost_basis_eur, 1) if total_cost_basis_eur > 0 else 0

    return {
        'holdings': composition,
        'total_value_eur': round(total_value, 2),
        'total_value_usd': total_value_usd,
        'total_cost_basis': round(total_cost_basis_eur * eurusd_rate, 2),  # In USD
        'total_cost_basis_eur': round(total_cost_basis_eur, 2),
        'total_gain_eur': round(total_gain_eur, 2),
        'total_gain_usd': round(total_gain_eur * eurusd_rate, 2),
        'total_gain_pct': total_gain_pct,
        'eurusd_rate': eurusd_rate,
        'fx_rates': fx_rates_to_eur,  # Return FX rates used for transparency
    }


def compute_portfolio_performance_from_transactions(transactions, benchmark_ticker='QQQ'):
    """
    Compute portfolio performance vs benchmark over time, tracking actual holdings.

    Args:
        transactions: list of dicts with 'stock_ticker', 'transaction_type', 'quantity',
                      'transaction_date', 'price_per_share'
        benchmark_ticker: ticker symbol for benchmark (e.g., 'QQQ', 'EQQQ.DE', 'SPY', 'CSPX.L')

    Returns:
        dict with performance data
    """
    if not transactions:
        return {'error': 'No transactions provided', 'data': []}

    # Sort transactions by date
    sorted_txs = sorted(transactions, key=lambda x: x['transaction_date'])

    # Get date range
    start_date_str = sorted_txs[0]['transaction_date']
    end_date = datetime.now()
    end_date_str = get_previous_weekday(end_date)

    # Generate weekly dates
    weekly_dates = []
    current_date = datetime.strptime(start_date_str, "%Y-%m-%d")
    end_dt = datetime.strptime(end_date_str, "%Y-%m-%d")

    while current_date <= end_dt:
        weekly_dates.append(current_date.strftime("%Y-%m-%d"))
        current_date += timedelta(weeks=1)

    # Always include the end date
    if weekly_dates[-1] != end_date_str:
        weekly_dates.append(end_date_str)

    # Track benchmark shares bought (as if we invested the same amount in benchmark at each transaction)
    # Pre-calculate: for each transaction, how many benchmark shares we'd get
    tx_benchmark_info = []
    transaction_events = []  # For chart markers

    # Get benchmark currency once (used to properly convert investment amounts)
    benchmark_currency = get_stock_currency(benchmark_ticker)

    for tx in sorted_txs:
        tx_date = tx['transaction_date']
        tx_price = tx['price_per_share']
        tx_qty = tx['quantity']
        price_currency = tx.get('price_currency', 'USD') or 'USD'

        if tx['transaction_type'] == 'BUY':
            try:
                # Convert to EUR and USD based on transaction currency
                eurusd_at_tx = fetch_eurusd_rate(tx_date)

                if price_currency == 'EUR':
                    tx_cost_eur = tx_qty * tx_price
                    tx_cost_usd = tx_cost_eur * eurusd_at_tx
                else:
                    # Assume USD if not EUR
                    tx_cost_usd = tx_qty * tx_price
                    tx_cost_eur = tx_cost_usd / eurusd_at_tx

                benchmark_price_at_tx = fetch_stock_price(benchmark_ticker, tx_date)
                # Buy benchmark with the same amount in the benchmark's currency
                # If benchmark is EUR-denominated, use EUR cost
                if benchmark_currency == 'EUR':
                    benchmark_shares_bought = tx_cost_eur / benchmark_price_at_tx
                else:
                    benchmark_shares_bought = tx_cost_usd / benchmark_price_at_tx

                tx_benchmark_info.append({
                    'date': tx_date,
                    'type': 'BUY',
                    'cost_usd': tx_cost_usd,
                    'cost_eur': tx_cost_eur,
                    'benchmark_shares': benchmark_shares_bought
                })

                # Track transaction event for chart marker
                transaction_events.append({
                    'date': tx_date,
                    'ticker': tx['stock_ticker'],
                    'type': 'BUY',
                    'quantity': tx_qty
                })
            except Exception as e:
                print(f"Error processing transaction: {e}")
                tx_benchmark_info.append({
                    'date': tx_date,
                    'type': 'BUY',
                    'cost_usd': tx_qty * tx_price,
                    'cost_eur': tx_qty * tx_price,  # Fallback
                    'benchmark_shares': 0
                })
        else:  # SELL
            try:
                # Convert sale proceeds to EUR and USD based on transaction currency
                eurusd_at_tx = fetch_eurusd_rate(tx_date)

                if price_currency == 'EUR':
                    tx_proceeds_eur = tx_qty * tx_price
                    tx_proceeds_usd = tx_proceeds_eur * eurusd_at_tx
                else:
                    tx_proceeds_usd = tx_qty * tx_price
                    tx_proceeds_eur = tx_proceeds_usd / eurusd_at_tx

                # Also sell equivalent worth of benchmark shares (in benchmark's currency)
                benchmark_price_at_tx = fetch_stock_price(benchmark_ticker, tx_date)
                if benchmark_currency == 'EUR':
                    benchmark_shares_sold = tx_proceeds_eur / benchmark_price_at_tx
                else:
                    benchmark_shares_sold = tx_proceeds_usd / benchmark_price_at_tx
            except:
                tx_proceeds_eur = tx_qty * tx_price  # Fallback
                tx_proceeds_usd = tx_qty * tx_price
                benchmark_shares_sold = 0

            tx_benchmark_info.append({
                'date': tx_date,
                'type': 'SELL',
                'cost_usd': -tx_proceeds_usd,
                'cost_eur': -tx_proceeds_eur,  # Negative because money is coming OUT
                'benchmark_shares': -benchmark_shares_sold  # Negative - selling benchmark shares too
            })
            transaction_events.append({
                'date': tx_date,
                'ticker': tx['stock_ticker'],
                'type': 'SELL',
                'quantity': tx_qty
            })

    # Calculate performance data
    performance_data = []

    for date_str in weekly_dates:
        date_dt = datetime.strptime(date_str, "%Y-%m-%d")

        # Calculate holdings at this date using FIFO
        # Track lots per ticker: list of { qty, cost_usd, cost_eur }
        lots_per_ticker = {}  # ticker -> list of lots
        holdings_at_date = {}  # ticker -> total quantity
        benchmark_shares_at_date = 0

        for i, tx in enumerate(sorted_txs):
            tx_date_dt = datetime.strptime(tx['transaction_date'], "%Y-%m-%d")
            if tx_date_dt > date_dt:
                break

            ticker = tx['stock_ticker']
            if ticker not in lots_per_ticker:
                lots_per_ticker[ticker] = []
                holdings_at_date[ticker] = 0

            if tx['transaction_type'] == 'BUY':
                holdings_at_date[ticker] += tx['quantity']
                # Use pre-calculated values from tx_benchmark_info (handles price_currency correctly)
                tx_cost_usd = tx_benchmark_info[i]['cost_usd']
                tx_cost_eur = tx_benchmark_info[i]['cost_eur']
                lots_per_ticker[ticker].append({
                    'qty': tx['quantity'],
                    'cost_usd': tx_cost_usd,
                    'cost_eur': tx_cost_eur
                })
                benchmark_shares_at_date += tx_benchmark_info[i]['benchmark_shares']
            else:  # SELL - use FIFO
                sell_qty = tx['quantity']
                holdings_at_date[ticker] -= sell_qty
                remaining_sell = sell_qty

                # FIFO: consume oldest lots first
                while remaining_sell > 0 and lots_per_ticker[ticker]:
                    lot = lots_per_ticker[ticker][0]
                    sell_from_lot = min(remaining_sell, lot['qty'])

                    # Reduce lot proportionally
                    if sell_from_lot == lot['qty']:
                        lots_per_ticker[ticker].pop(0)
                    else:
                        portion = sell_from_lot / lot['qty']
                        lot['cost_eur'] *= (1 - portion)
                        lot['cost_usd'] *= (1 - portion)
                        lot['qty'] -= sell_from_lot

                    remaining_sell -= sell_from_lot

                # Benchmark shares also reduce
                benchmark_shares_at_date += tx_benchmark_info[i]['benchmark_shares']

        # Calculate cost basis from remaining lots
        cost_basis_at_date = 0
        cost_basis_eur_at_date = 0
        for ticker, lots in lots_per_ticker.items():
            for lot in lots:
                cost_basis_at_date += lot['cost_usd']
                cost_basis_eur_at_date += lot['cost_eur']

        # Skip if no holdings yet
        if not holdings_at_date or cost_basis_at_date <= 0:
            continue

        try:
            # Calculate portfolio value at this date
            # Use current prices for the last data point to match composition endpoint
            is_last_date = (date_str == weekly_dates[-1])

            # Get EUR/USD rate for this date (used for USD stocks and benchmark)
            if is_last_date:
                eurusd = get_current_eurusd_rate()
            else:
                eurusd = fetch_eurusd_rate(date_str)

            # Calculate portfolio value in EUR, handling multi-currency stocks
            portfolio_value_eur = 0
            portfolio_value_usd = 0  # Keep USD value for reference
            stocks_breakdown = {}  # Per-stock breakdown

            for ticker, qty in holdings_at_date.items():
                if qty > 0:
                    if is_last_date:
                        price_native = fetch_current_stock_price(ticker)
                    else:
                        price_native = fetch_stock_price(ticker, date_str)

                    # Get stock's native currency and convert to EUR
                    native_currency = get_stock_currency(ticker)
                    if native_currency == 'EUR':
                        price_eur = price_native
                    elif native_currency == 'USD':
                        price_eur = price_native / eurusd
                    else:
                        # Other currencies (GBP, CHF, etc.) - convert via current rate
                        fx_rate_to_eur = get_fx_rate_to_eur(native_currency)
                        price_eur = price_native * fx_rate_to_eur

                    stock_value_eur = price_eur * qty
                    portfolio_value_eur += stock_value_eur
                    portfolio_value_usd += (price_eur * eurusd) * qty  # Convert back to USD for reference

                    # Calculate cost basis for this stock from lots
                    stock_cost_eur = sum(lot['cost_eur'] for lot in lots_per_ticker.get(ticker, []))

                    stocks_breakdown[ticker] = {
                        'value_eur': round(stock_value_eur, 2),
                        'cost_basis_eur': round(stock_cost_eur, 2),
                        'quantity': qty
                    }

            # Calculate benchmark value (what if we'd invested in benchmark instead)
            # Benchmark is always in USD (QQQ, SPY, etc.) or EUR-denominated ETF
            if is_last_date:
                benchmark_price = fetch_current_stock_price(benchmark_ticker)
            else:
                benchmark_price = fetch_stock_price(benchmark_ticker, date_str)

            benchmark_currency = get_stock_currency(benchmark_ticker)
            if benchmark_currency == 'EUR':
                benchmark_value_eur = benchmark_shares_at_date * benchmark_price
            else:
                benchmark_value_eur = benchmark_shares_at_date * benchmark_price / eurusd
            benchmark_value_usd = benchmark_value_eur * eurusd
            # Use the EUR amount invested at transaction dates (doesn't fluctuate with FX)
            cost_basis_eur = cost_basis_eur_at_date

            # Growth percentages (using EUR values)
            portfolio_growth = 100 * portfolio_value_eur / cost_basis_eur if cost_basis_eur > 0 else 100
            benchmark_growth = 100 * benchmark_value_eur / cost_basis_eur if cost_basis_eur > 0 else 100

            performance_data.append({
                'date': date_str,
                'portfolio_value_usd': round(portfolio_value_usd, 2),
                'portfolio_value_eur': round(portfolio_value_eur, 2),
                'benchmark_value_usd': round(benchmark_value_usd, 2),
                'benchmark_value_eur': round(benchmark_value_eur, 2),
                'cost_basis_usd': round(cost_basis_at_date, 2),
                'cost_basis_eur': round(cost_basis_eur, 2),
                'portfolio_growth_usd': round(portfolio_growth, 1),
                'portfolio_growth_eur': round(portfolio_growth, 1),
                'benchmark_growth_usd': round(benchmark_growth, 1),
                'benchmark_growth_eur': round(benchmark_growth, 1),
                'stocks': stocks_breakdown,
            })
        except Exception as e:
            print(f"Error computing performance for {date_str}: {e}")
            continue

    if not performance_data:
        return {'error': 'Failed to compute performance data', 'data': []}

    # Calculate summary stats
    first = performance_data[0]
    last = performance_data[-1]

    total_return_eur = round(100 * (last['portfolio_value_eur'] - last['cost_basis_eur']) / last['cost_basis_eur'], 1)
    benchmark_return_eur = round(100 * (last['benchmark_value_eur'] - last['cost_basis_eur']) / last['cost_basis_eur'], 1)

    # Calculate CAGR (Compound Annual Growth Rate)
    start_dt = datetime.strptime(first['date'], "%Y-%m-%d")
    end_dt = datetime.strptime(last['date'], "%Y-%m-%d")
    years = (end_dt - start_dt).days / 365.25

    if years > 0 and last['portfolio_value_eur'] > 0 and first['cost_basis_eur'] > 0:
        # CAGR = (ending/beginning)^(1/years) - 1
        cagr_eur = (pow(last['portfolio_value_eur'] / last['cost_basis_eur'], 1 / years) - 1) * 100
        cagr_benchmark_eur = (pow(last['benchmark_value_eur'] / last['cost_basis_eur'], 1 / years) - 1) * 100
    else:
        cagr_eur = total_return_eur
        cagr_benchmark_eur = benchmark_return_eur

    return {
        'data': performance_data,
        'transactions': transaction_events,
        'summary': {
            'start_date': first['date'],
            'end_date': last['date'],
            'total_cost_basis_eur': round(last['cost_basis_eur'], 2),
            'portfolio_return_eur': total_return_eur,
            'benchmark_return_eur': benchmark_return_eur,
            'outperformance_eur': round(total_return_eur - benchmark_return_eur, 1),
            'cagr_eur': round(cagr_eur, 1),
            'cagr_benchmark_eur': round(cagr_benchmark_eur, 1),
            'years': round(years, 2),
            'benchmark': benchmark_ticker
        }
    }


# =============================================================================
# YouTube News Feed Functions
# =============================================================================

import requests
from youtube_config import YOUTUBE_CHANNELS, get_uploads_playlist_id, matches_company

# Cache TTL for YouTube videos (6 hours)
YOUTUBE_CACHE_TTL_HOURS = 6


def fetch_channel_videos(channel_id, api_key, max_results=150):
    """
    Fetch recent videos from a YouTube channel using playlistItems API.
    Supports pagination to get more than 50 results.
    Returns list of video metadata.
    """
    uploads_playlist_id = get_uploads_playlist_id(channel_id)
    url = "https://www.googleapis.com/youtube/v3/playlistItems"

    videos = []
    next_page_token = None

    while len(videos) < max_results:
        params = {
            'part': 'snippet',
            'playlistId': uploads_playlist_id,
            'maxResults': min(50, max_results - len(videos)),  # API max is 50
            'key': api_key
        }
        if next_page_token:
            params['pageToken'] = next_page_token

        response = requests.get(url, params=params)
        response.raise_for_status()
        data = response.json()

        for item in data.get('items', []):
            snippet = item['snippet']
            video_id = snippet['resourceId']['videoId']

            videos.append({
                'video_id': video_id,
                'channel_id': channel_id,
                'channel_name': snippet['channelTitle'],
                'title': snippet['title'],
                'description': snippet.get('description', ''),
                'thumbnail_url': snippet['thumbnails'].get('high', {}).get('url') or
                                snippet['thumbnails'].get('medium', {}).get('url') or
                                snippet['thumbnails'].get('default', {}).get('url'),
                'published_at': snippet['publishedAt'],
            })

        next_page_token = data.get('nextPageToken')
        if not next_page_token:
            break  # No more pages

    return videos


def fetch_all_channel_videos(api_key, max_per_channel=150):
    """
    Fetch videos from all configured channels.
    Returns combined list of videos sorted by publish date.
    """
    all_videos = []

    for channel_id, channel_info in YOUTUBE_CHANNELS.items():
        try:
            videos = fetch_channel_videos(channel_id, api_key, max_per_channel)
            all_videos.extend(videos)
        except Exception as e:
            print(f"Error fetching videos from {channel_info.get('name', channel_id)}: {e}")
            continue

    # Sort by publish date (most recent first)
    all_videos.sort(key=lambda x: x['published_at'], reverse=True)

    return all_videos


def get_cached_videos(db_getter):
    """Get cached videos from database, filtered to allowed channels only."""
    allowed_channel_ids = list(YOUTUBE_CHANNELS.keys())
    if not allowed_channel_ids:
        return []

    placeholders = ','.join('?' * len(allowed_channel_ids))
    with db_getter() as conn:
        cursor = conn.execute(f'''
            SELECT video_id, channel_id, channel_name, title, description, thumbnail_url,
                   published_at, view_count, updated_at
            FROM youtube_videos_cache
            WHERE channel_id IN ({placeholders})
            ORDER BY published_at DESC
        ''', allowed_channel_ids)
        rows = cursor.fetchall()

    return [dict(row) for row in rows]


def save_videos_to_cache(db_getter, videos):
    """Save videos to cache (upsert)."""
    with db_getter() as conn:
        for video in videos:
            conn.execute('''
                INSERT INTO youtube_videos_cache
                    (video_id, channel_id, channel_name, title, description, thumbnail_url, published_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(video_id) DO UPDATE SET
                    title = excluded.title,
                    description = excluded.description,
                    thumbnail_url = excluded.thumbnail_url,
                    updated_at = CURRENT_TIMESTAMP
            ''', (
                video['video_id'],
                video['channel_id'],
                video['channel_name'],
                video['title'],
                video.get('description', ''),
                video['thumbnail_url'],
                video['published_at']
            ))


def should_refresh_cache(db_getter, channel_id):
    """Check if channel's cache is stale and needs refresh."""
    with db_getter() as conn:
        cursor = conn.execute('''
            SELECT last_fetched_at FROM youtube_channel_fetch_log
            WHERE channel_id = ?
        ''', (channel_id,))
        row = cursor.fetchone()

        if not row or not row['last_fetched_at']:
            return True

        # Handle both string (SQLite) and datetime (PostgreSQL) formats
        last_fetched_val = row['last_fetched_at']
        if isinstance(last_fetched_val, str):
            last_fetched = datetime.fromisoformat(last_fetched_val.replace('Z', '+00:00'))
        else:
            last_fetched = last_fetched_val

        # Make both datetimes naive for comparison
        if last_fetched.tzinfo is not None:
            last_fetched = last_fetched.replace(tzinfo=None)

        age_hours = (datetime.now() - last_fetched).total_seconds() / 3600

        return age_hours >= YOUTUBE_CACHE_TTL_HOURS


def mark_channel_fetched(db_getter, channel_id):
    """Update the fetch timestamp for a channel."""
    with db_getter() as conn:
        conn.execute('''
            INSERT INTO youtube_channel_fetch_log (channel_id, last_fetched_at)
            VALUES (?, CURRENT_TIMESTAMP)
            ON CONFLICT(channel_id) DO UPDATE SET
                last_fetched_at = CURRENT_TIMESTAMP
        ''', (channel_id,))


def get_news_feed_videos(db_getter, api_key, ticker=None, company_name=None, limit=50, force_refresh=False):
    """
    Get news feed videos, refreshing cache if needed.
    Optionally filters by ticker and company_name.

    Returns: { 'videos': [...], 'from_cache': bool }
    """
    # Check if any channel needs refresh
    channels_to_refresh = []
    for channel_id in YOUTUBE_CHANNELS.keys():
        if force_refresh or should_refresh_cache(db_getter, channel_id):
            channels_to_refresh.append(channel_id)

    # Refresh stale channels
    refreshed_count = 0
    if channels_to_refresh and api_key:
        print(f"[YouTube] Refreshing {len(channels_to_refresh)} channels...")
        for channel_id in channels_to_refresh:
            try:
                videos = fetch_channel_videos(channel_id, api_key)
                save_videos_to_cache(db_getter, videos)
                mark_channel_fetched(db_getter, channel_id)
                refreshed_count += 1
                print(f"[YouTube] Fetched {len(videos)} videos from channel {channel_id}")
            except Exception as e:
                print(f"[YouTube] Error refreshing channel {channel_id}: {e}")
    elif channels_to_refresh and not api_key:
        print(f"[YouTube] WARNING: {len(channels_to_refresh)} channels need refresh but YOUTUBE_API_KEY is not set!")

    # Get all cached videos
    all_videos = get_cached_videos(db_getter)
    print(f"[YouTube] Total cached videos: {len(all_videos)}")

    # Filter by ticker/company if specified
    if ticker:
        filtered = [v for v in all_videos if matches_company(v['title'], ticker, company_name)]
        print(f"[YouTube] Filtered for {ticker}/{company_name}: {len(filtered)} videos")
    else:
        filtered = all_videos

    # Add YouTube URL and limit results
    for video in filtered[:limit]:
        video['url'] = f"https://www.youtube.com/watch?v={video['video_id']}"

    return {
        'videos': filtered[:limit],
        'total': len(filtered),
        'from_cache': len(channels_to_refresh) == 0,
        'refreshed_channels': refreshed_count
    }
