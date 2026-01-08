# Investing utilities for portfolio calculations
import yfinance as yf
import numpy as np
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta

# Global database connection (set by app.py)
_db_getter = None

# Cache TTL for current prices (15 minutes)
CURRENT_PRICE_TTL_MINUTES = 15

# European stock ticker to yfinance ticker mapping (exchange suffixes)
# Swiss stocks need .SW, German .DE, French .PA, UK .L, Italian .MI, etc.
EUROPEAN_TICKER_MAP = {
    # Swiss stocks (.SW) - Full SPI Index
    # Large caps
    'UHR': 'UHR.SW', 'NESN': 'NESN.SW', 'NOVN': 'NOVN.SW', 'ROG': 'ROG.SW',
    'ABBN': 'ABBN.SW', 'ZURN': 'ZURN.SW', 'SREN': 'SREN.SW', 'UBSG': 'UBSG.SW',
    'CSGN': 'CSGN.SW', 'GIVN': 'GIVN.SW', 'LONN': 'LONN.SW', 'SIKA': 'SIKA.SW',
    'GEBN': 'GEBN.SW', 'SCMN': 'SCMN.SW', 'SLHN': 'SLHN.SW', 'BALN': 'BALN.SW',
    'CFR': 'CFR.SW', 'ALC': 'ALC.SW', 'SOON': 'SOON.SW', 'PGHN': 'PGHN.SW',
    'BARN': 'BARN.SW', 'SGSN': 'SGSN.SW', 'TEMN': 'TEMN.SW', 'HOLN': 'HOLN.SW',
    'LOGN': 'LOGN.SW', 'VACN': 'VACN.SW', 'STMN': 'STMN.SW', 'BEKN': 'BEKN.SW',
    'LAND': 'LAND.SW', 'LHN': 'LHN.SW', 'SPSN': 'SPSN.SW', 'SIGN': 'SIGN.SW',
    # Mid caps
    'SCHP': 'SCHP.SW', 'KNIN': 'KNIN.SW', 'LNDN': 'LNDN.SW', 'EMSH': 'EMSH.SW',
    'BAER': 'BAER.SW', 'CLN': 'CLN.SW', 'GALD': 'GALD.SW', 'SDOZ': 'SDOZ.SW',
    'ADEN': 'ADEN.SW',
    # Banks & Financials
    'SQN': 'SQN.SW', 'EFGN': 'EFGN.SW', 'VONN': 'VONN.SW', 'CMBN': 'CMBN.SW',
    'VALN': 'VALN.SW', 'VZH': 'VZH.SW', 'BCVN': 'BCVN.SW', 'SGKN': 'SGKN.SW',
    'BKBN': 'BKBN.SW', 'THKB': 'THKB.SW', 'ZUGK': 'ZUGK.SW', 'GKB': 'GKB.SW',
    'LLBN': 'LLBN.SW', 'LUKN': 'LUKN.SW', 'BCGE': 'BCGE.SW',
    # Real estate
    'SPRE': 'SPRE.SW', 'PSPN': 'PSPN.SW', 'MOBN': 'MOBN.SW', 'ALLH': 'ALLH.SW',
    'HIAG': 'HIAG.SW', 'WARN': 'WARN.SW', 'PEHN': 'PEHN.SW',
    # Healthcare & Pharma
    'MEDN': 'MEDN.SW', 'YPSN': 'YPSN.SW', 'GALN': 'GALN.SW', 'BACH': 'BACH.SW',
    'DOTT': 'DOTT.SW', 'SIE': 'SIE.SW', 'BION': 'BION.SW',
    # Industrials
    'BUCN': 'BUCN.SW', 'GF': 'GF.SW', 'SUN': 'SUN.SW', 'BEAN': 'BEAN.SW',
    'SFSG': 'SFSG.SW', 'HUBN': 'HUBN.SW', 'DMKN': 'DMKN.SW', 'DAWG': 'DAWG.SW',
    'IFCN': 'IFCN.SW', 'ACLN': 'ACLN.SW', 'SIGG': 'SIGG.SW', 'BOBNN': 'BOBNN.SW',
    'KOMAX': 'KOMAX.SW', 'ARYN': 'ARYN.SW', 'INRN': 'INRN.SW', 'GURN': 'GURN.SW',
    'LISP': 'LISP.SW', 'COTN': 'COTN.SW', 'KARN': 'KARN.SW', 'ZEHN': 'ZEHN.SW',
    'VETN': 'VETN.SW', 'FORN': 'FORN.SW', 'MBTN': 'MBTN.SW',
    # Consumer & Services
    'DKSH': 'DKSH.SW', 'AVOL': 'AVOL.SW', 'EMMI': 'EMMI.SW', 'BELL': 'BELL.SW',
    'ORNA': 'ORNA.SW', 'HBLN': 'HBLN.SW', 'VBSN': 'VBSN.SW',
    # Technology
    'ALSN': 'ALSN.SW', 'SOFTG': 'SOFTG.SW', 'UHRN': 'UHRN.SW', 'SENS': 'SENS.SW',
    # Energy & Transport
    'BKW': 'BKW.SW', 'ROMN': 'ROMN.SW', 'FHZN': 'FHZN.SW',
    # Other
    'HELN': 'HELN.SW', 'APGN': 'APGN.SW', 'VAHN': 'VAHN.SW',
    # German stocks (.DE) - Note: many German stocks use .DE on Yahoo
    'ALV': 'ALV.DE', 'BAS': 'BAS.DE', 'BAYN': 'BAYN.DE', 'BMW': 'BMW.DE',
    'CON': 'CON.DE', 'DAI': 'DAI.DE', 'DB1': 'DB1.DE', 'DBK': 'DBK.DE',
    'DPW': 'DPW.DE', 'DTE': 'DTE.DE', 'EOAN': 'EOAN.DE', 'FME': 'FME.DE',
    'FRE': 'FRE.DE', 'HEI': 'HEI.DE', 'HEN3': 'HEN3.DE', 'IFX': 'IFX.DE',
    'LIN': 'LIN.DE', 'MRK': 'MRK.DE', 'MTX': 'MTX.DE', 'MUV2': 'MUV2.DE',
    'RWE': 'RWE.DE', 'SAP': 'SAP.DE', 'SIE': 'SIE.DE', 'VOW3': 'VOW3.DE',
    'VNA': 'VNA.DE', 'ADS': 'ADS.DE', 'AIR': 'AIR.PA', 'SY1': 'SY1.DE',
    'PAH3': 'PAH3.DE', 'BEI': 'BEI.DE', 'SHL': 'SHL.DE', 'ENR': 'ENR.DE',
    'HNR1': 'HNR1.DE', 'PUM': 'PUM.DE', 'ZAL': 'ZAL.DE', 'LEG': 'LEG.DE',
    'HFG': 'HFG.DE', 'TKA': 'TKA.DE', 'BOSS': 'BOSS.DE', '1COV': '1COV.DE',
    'EVK': 'EVK.DE', 'KCO': 'KCO.DE', 'DHL': 'DHL.DE', 'G24': 'G24.DE',
    # French stocks (.PA)
    'OR': 'OR.PA', 'MC': 'MC.PA', 'SAN': 'SAN.PA', 'AI': 'AI.PA',
    'BNP': 'BNP.PA', 'SU': 'SU.PA', 'CS': 'CS.PA', 'DG': 'DG.PA',
    'CAP': 'CAP.PA', 'VIE': 'VIE.PA', 'RI': 'RI.PA', 'KER': 'KER.PA',
    'CA': 'CA.PA', 'GLE': 'GLE.PA', 'EN': 'EN.PA', 'ENGI': 'ENGI.PA',
    'ORA': 'ORA.PA', 'VIV': 'VIV.PA', 'HO': 'HO.PA', 'SGO': 'SGO.PA',
    'PUB': 'PUB.PA', 'SW': 'SW.PA', 'ML': 'ML.PA', 'ATO': 'ATO.PA',
    'DSY': 'DSY.PA', 'STM': 'STM.PA', 'LR': 'LR.PA', 'ERF': 'ERF.PA',
    'RMS': 'RMS.PA', 'EL': 'EL.PA', 'BN': 'BN.PA', 'TEP': 'TEP.PA',
    'TTE': 'TTE.PA', 'SAF': 'SAF.PA', 'AM': 'AM.PA', 'AC': 'AC.PA',
    'ENX': 'ENX.PA', 'RBO': 'RBO.PA',
    # UK stocks (.L)
    'SHEL': 'SHEL.L', 'HSBA': 'HSBA.L', 'BP': 'BP.L', 'AZN': 'AZN.L',
    'GSK': 'GSK.L', 'RIO': 'RIO.L', 'ULVR': 'ULVR.L', 'DGE': 'DGE.L',
    'BATS': 'BATS.L', 'LLOY': 'LLOY.L', 'BARC': 'BARC.L', 'VOD': 'VOD.L',
    'NWG': 'NWG.L', 'NG': 'NG.L', 'SSE': 'SSE.L', 'REL': 'REL.L',
    'LSEG': 'LSEG.L', 'CRH': 'CRH.L', 'RKT': 'RKT.L', 'PRU': 'PRU.L',
    'EXPN': 'EXPN.L', 'AAL': 'AAL.L', 'IMB': 'IMB.L', 'AHT': 'AHT.L',
    'III': 'III.L', 'ANTO': 'ANTO.L', 'ABF': 'ABF.L', 'BA': 'BA.L',
    'CPG': 'CPG.L', 'WPP': 'WPP.L', 'LAND': 'LAND.L', 'GLEN': 'GLEN.L',
    'WTB': 'WTB.L', 'SGRO': 'SGRO.L', 'PSN': 'PSN.L', 'INF': 'INF.L',
    'RTO': 'RTO.L', 'JET': 'JET.L', 'IHG': 'IHG.L', 'STJ': 'STJ.L',
    # Italian stocks (.MI)
    'ENEL': 'ENEL.MI', 'ENI': 'ENI.MI', 'ISP': 'ISP.MI', 'UCG': 'UCG.MI',
    'RACE': 'RACE.MI', 'G': 'G.MI', 'STLA': 'STLA.MI', 'TEN': 'TEN.MI',
    'PRY': 'PRY.MI', 'SRG': 'SRG.MI', 'SPM': 'SPM.MI', 'LDO': 'LDO.MI',
    'MONC': 'MONC.MI', 'AMP': 'AMP.MI', 'BAMI': 'BAMI.MI', 'MB': 'MB.MI',
    # Dutch stocks (.AS)
    'ASML': 'ASML.AS', 'PHIA': 'PHIA.AS', 'INGA': 'INGA.AS', 'AD': 'AD.AS',
    'HEIA': 'HEIA.AS', 'DSM': 'DSM.AS', 'RAND': 'RAND.AS', 'NN': 'NN.AS',
    'KPN': 'KPN.AS', 'ABN': 'ABN.AS', 'AKZA': 'AKZA.AS', 'UNA': 'UNA.AS',
    'WKL': 'WKL.AS', 'RDSA': 'RDSA.AS', 'AGN': 'AGN.AS', 'MT': 'MT.AS',
    # Spanish stocks (.MC)
    'SAN': 'SAN.MC', 'IBE': 'IBE.MC', 'ITX': 'ITX.MC', 'BBVA': 'BBVA.MC',
    'TEF': 'TEF.MC', 'REP': 'REP.MC', 'ENG': 'ENG.MC', 'GRF': 'GRF.MC',
    'ACS': 'ACS.MC', 'FER': 'FER.MC', 'AENA': 'AENA.MC', 'CABK': 'CABK.MC',
    # Belgian stocks (.BR)
    'ABI': 'ABI.BR', 'KBC': 'KBC.BR', 'UCB': 'UCB.BR', 'SOLB': 'SOLB.BR',
    'ACKB': 'ACKB.BR', 'GBLB': 'GBLB.BR', 'UMI': 'UMI.BR', 'PROX': 'PROX.BR',
    # Danish stocks (.CO)
    'NOVO-B': 'NOVO-B.CO', 'NOVOB': 'NOVO-B.CO', 'CARL-B': 'CARL-B.CO',
    'VWS': 'VWS.CO', 'DSV': 'DSV.CO', 'MAERSK-B': 'MAERSK-B.CO', 'ORSTED': 'ORSTED.CO',
    'PNDORA': 'PNDORA.CO',
    # Finnish stocks (.HE)
    'NOKIA': 'NOKIA.HE', 'NESTE': 'NESTE.HE', 'FORTUM': 'FORTUM.HE',
    'UPM': 'UPM.HE', 'STERV': 'STERV.HE', 'KNEBV': 'KNEBV.HE',
    # Norwegian stocks (.OL)
    'EQNR': 'EQNR.OL', 'DNB': 'DNB.OL', 'TEL': 'TEL.OL', 'MOWI': 'MOWI.OL',
    'YAR': 'YAR.OL', 'NHY': 'NHY.OL', 'ORK': 'ORK.OL',
    # Swedish stocks (.ST)
    'ERIC-B': 'ERIC-B.ST', 'ERICB': 'ERIC-B.ST', 'VOLV-B': 'VOLV-B.ST',
    'HM-B': 'HM-B.ST', 'ATCO-A': 'ATCO-A.ST', 'SEB-A': 'SEB-A.ST',
    'SAND': 'SAND.ST', 'ABB': 'ABB.ST', 'INVE-B': 'INVE-B.ST',
    'EVO': 'EVO.ST', 'ALFA': 'ALFA.ST', 'SKA-B': 'SKA-B.ST',
    # Portuguese stocks (.LS)
    'EDP': 'EDP.LS', 'GALP': 'GALP.LS', 'JMT': 'JMT.LS',
    # Irish stocks (.IR)
    'RYA': 'RYA.IR', 'CRG': 'CRG.IR',
    # Austrian stocks (.VI)
    'VOE': 'VOE.VI', 'EBS': 'EBS.VI', 'OMV': 'OMV.VI',
}

def get_yfinance_ticker(ticker):
    """Convert a plain ticker to yfinance-compatible ticker with exchange suffix if needed."""
    ticker_upper = ticker.upper().strip()
    # If already has a suffix (contains .), return as-is
    if '.' in ticker_upper:
        return ticker_upper
    # Check mapping
    return EUROPEAN_TICKER_MAP.get(ticker_upper, ticker_upper)

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
    try:
        with _db_getter() as conn:
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
    try:
        with _db_getter() as conn:
            conn.execute(
                'INSERT OR REPLACE INTO historical_fx_rates (pair, date, rate, created_at) VALUES (?, ?, ?, ?)',
                (pair, date_str, rate, datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
            )
    except Exception as e:
        print(f"Error caching FX rate: {e}")

# Stock color map for pie chart - brand colors where available
STOCK_COLORS = {
    # US Tech
    'NVDA': "#76B900",
    'GOOGL': "#DB4437",
    'GOOG': "#DB4437",
    'AMZN': "#FF9900",
    'META': "#4267B2",
    'MSFT': "#00A4EF",
    'AAPL': "#555555",
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
    'BLK': "#000000",
    # US Consumer
    'WMT': "#0071CE",
    'HD': "#F96302",
    'NKE': "#111111",
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
    # Other
    'Cash': "#FFD700",
}

# Benchmark tickers
BENCHMARKS = {
    'SP500': '^GSPC',
    'QQQ': 'QQQ'
}


def fetch_stock_price(stock_ticker, date_str):
    """Fetch stock closing price for a given date (with caching)."""
    # Check cache first (use original ticker for cache key)
    cached = _get_cached_price(stock_ticker, date_str)
    if cached is not None:
        return cached

    # Convert to yfinance ticker (add exchange suffix if needed)
    yf_ticker = get_yfinance_ticker(stock_ticker)
    ticker = yf.Ticker(yf_ticker)
    end_date = datetime.strptime(date_str, "%Y-%m-%d")
    start_date = (end_date - timedelta(days=7)).strftime('%Y-%m-%d')
    prices_history = ticker.history(start=start_date, end=date_str)
    if prices_history.empty:
        # Try fetching more days back
        start_date = (end_date - timedelta(days=14)).strftime('%Y-%m-%d')
        prices_history = ticker.history(start=start_date, end=date_str)
    if prices_history.empty:
        raise ValueError(f"No price data found for {stock_ticker} around {date_str}")

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
            threads=True
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


def compute_portfolio_composition(holdings):
    """
    Compute portfolio composition with current values, weights, cost basis and gains.

    Args:
        holdings: list of dicts with 'stock_ticker', 'quantity', 'cost_basis' (avg price),
                  'total_cost' (USD), 'total_cost_eur' (EUR at historical rates)

    Returns:
        dict with composition data including gains/losses
    """
    composition = []
    total_value = 0
    total_cost_basis_usd = 0
    total_cost_basis_eur = 0

    # Batch fetch all prices in a single API call
    all_tickers = [h['stock_ticker'] for h in holdings]
    prices = fetch_current_stock_prices_batch(all_tickers)

    for holding in holdings:
        ticker = holding['stock_ticker']
        quantity = holding['quantity']
        cost_basis_per_share = holding.get('cost_basis', 0)
        total_cost = holding.get('total_cost', cost_basis_per_share * quantity)
        total_cost_eur = holding.get('total_cost_eur', total_cost)  # Fallback to USD if not provided

        current_price = prices.get(ticker, 0) or 0
        current_value = current_price * quantity
        gain_usd = current_value - total_cost
        gain_pct = round(100 * gain_usd / total_cost, 1) if total_cost > 0 else 0

        composition.append({
            'ticker': ticker,
            'quantity': quantity,
            'current_price': current_price,
            'current_value': round(current_value, 2),
            'cost_basis': round(total_cost, 2),
            'cost_basis_eur': round(total_cost_eur, 2),
            'avg_cost': round(cost_basis_per_share, 2),
            'gain_usd': round(gain_usd, 2),
            'gain_pct': gain_pct,
            'color': STOCK_COLORS.get(ticker, '#95A5A6')
        })
        total_value += current_value
        total_cost_basis_usd += total_cost
        total_cost_basis_eur += total_cost_eur

    # Calculate weights
    for item in composition:
        if total_value > 0:
            item['weight'] = round(100 * item['current_value'] / total_value, 1)
        else:
            item['weight'] = 0

    # Sort by weight descending
    composition.sort(key=lambda x: -x['weight'])

    # Get EUR values
    eurusd_rate = get_current_eurusd_rate()
    total_value_eur = round(total_value / eurusd_rate, 2)
    total_gain_usd = total_value - total_cost_basis_usd
    total_gain_pct = round(100 * total_gain_usd / total_cost_basis_usd, 1) if total_cost_basis_usd > 0 else 0

    return {
        'holdings': composition,
        'total_value_usd': round(total_value, 2),
        'total_value_eur': total_value_eur,
        'total_cost_basis': round(total_cost_basis_usd, 2),
        'total_cost_basis_eur': round(total_cost_basis_eur, 2),
        'total_gain_usd': round(total_gain_usd, 2),
        'total_gain_pct': total_gain_pct,
        'eurusd_rate': eurusd_rate
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

    # Track benchmark shares bought (as if we invested the same EUR in benchmark at each transaction)
    # Pre-calculate: for each transaction, how many benchmark shares we'd get
    tx_benchmark_info = []
    transaction_events = []  # For chart markers

    for tx in sorted_txs:
        tx_date = tx['transaction_date']
        tx_cost_usd = tx['quantity'] * tx['price_per_share']

        if tx['transaction_type'] == 'BUY':
            try:
                # Convert to EUR at transaction date
                eurusd_at_tx = fetch_eurusd_rate(tx_date)
                tx_cost_eur = tx_cost_usd / eurusd_at_tx

                benchmark_price_at_tx = fetch_stock_price(benchmark_ticker, tx_date)
                # Buy benchmark with the same USD amount (to compare apples to apples)
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
                    'quantity': tx['quantity']
                })
            except Exception as e:
                print(f"Error processing transaction: {e}")
                tx_benchmark_info.append({
                    'date': tx_date,
                    'type': 'BUY',
                    'cost_usd': tx_cost_usd,
                    'cost_eur': tx_cost_usd,  # Fallback
                    'benchmark_shares': 0
                })
        else:  # SELL
            try:
                # Convert sale proceeds to EUR at transaction date
                eurusd_at_tx = fetch_eurusd_rate(tx_date)
                tx_proceeds_eur = tx_cost_usd / eurusd_at_tx

                # Also sell equivalent USD worth of benchmark shares
                benchmark_price_at_tx = fetch_stock_price(benchmark_ticker, tx_date)
                benchmark_shares_sold = tx_cost_usd / benchmark_price_at_tx
            except:
                tx_proceeds_eur = tx_cost_usd  # Fallback
                benchmark_shares_sold = 0

            tx_benchmark_info.append({
                'date': tx_date,
                'type': 'SELL',
                'cost_usd': -tx_cost_usd,
                'cost_eur': -tx_proceeds_eur,  # Negative because money is coming OUT
                'benchmark_shares': -benchmark_shares_sold  # Negative - selling benchmark shares too
            })
            transaction_events.append({
                'date': tx_date,
                'ticker': tx['stock_ticker'],
                'type': 'SELL',
                'quantity': tx['quantity']
            })

    # Calculate performance data
    performance_data = []

    for date_str in weekly_dates:
        date_dt = datetime.strptime(date_str, "%Y-%m-%d")

        # Calculate holdings at this date using FIFO
        # Track lots per ticker: list of { qty, cost_usd_per_share, cost_eur }
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
                tx_cost_usd = tx['quantity'] * tx['price_per_share']
                tx_cost_eur = tx_benchmark_info[i]['cost_eur']
                lots_per_ticker[ticker].append({
                    'qty': tx['quantity'],
                    'cost_usd_per_share': tx['price_per_share'],
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
                        lot['qty'] -= sell_from_lot

                    remaining_sell -= sell_from_lot

                # Benchmark shares also reduce
                benchmark_shares_at_date += tx_benchmark_info[i]['benchmark_shares']

        # Calculate cost basis from remaining lots
        cost_basis_at_date = 0
        cost_basis_eur_at_date = 0
        for ticker, lots in lots_per_ticker.items():
            for lot in lots:
                cost_basis_at_date += lot['qty'] * lot['cost_usd_per_share']
                cost_basis_eur_at_date += lot['cost_eur']

        # Skip if no holdings yet
        if not holdings_at_date or cost_basis_at_date <= 0:
            continue

        try:
            # Calculate portfolio value at this date
            # Use current prices for the last data point to match composition endpoint
            is_last_date = (date_str == weekly_dates[-1])
            portfolio_value = 0
            for ticker, qty in holdings_at_date.items():
                if qty > 0:
                    if is_last_date:
                        price = fetch_current_stock_price(ticker)
                    else:
                        price = fetch_stock_price(ticker, date_str)
                    portfolio_value += price * qty

            # Calculate benchmark value (what if we'd invested in benchmark instead)
            if is_last_date:
                benchmark_price = fetch_current_stock_price(benchmark_ticker)
            else:
                benchmark_price = fetch_stock_price(benchmark_ticker, date_str)
            benchmark_value = benchmark_shares_at_date * benchmark_price

            # EUR conversion - use current rate for last date
            if is_last_date:
                eurusd = get_current_eurusd_rate()
            else:
                eurusd = fetch_eurusd_rate(date_str)
            portfolio_value_eur = portfolio_value / eurusd
            benchmark_value_eur = benchmark_value / eurusd
            # Use the EUR amount invested at transaction dates (doesn't fluctuate with FX)
            cost_basis_eur = cost_basis_eur_at_date

            # Growth percentages
            portfolio_growth = 100 * portfolio_value / cost_basis_at_date if cost_basis_at_date > 0 else 100
            benchmark_growth = 100 * benchmark_value / cost_basis_at_date if cost_basis_at_date > 0 else 100

            performance_data.append({
                'date': date_str,
                'portfolio_value_usd': round(portfolio_value, 2),
                'portfolio_value_eur': round(portfolio_value_eur, 2),
                'benchmark_value_usd': round(benchmark_value, 2),
                'benchmark_value_eur': round(benchmark_value_eur, 2),
                'cost_basis_usd': round(cost_basis_at_date, 2),
                'cost_basis_eur': round(cost_basis_eur, 2),
                'portfolio_growth_usd': round(portfolio_growth, 1),
                'portfolio_growth_eur': round(portfolio_growth, 1),
                'benchmark_growth_usd': round(benchmark_growth, 1),
                'benchmark_growth_eur': round(benchmark_growth, 1),
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


def fetch_channel_videos(channel_id, api_key, max_results=50):
    """
    Fetch recent videos from a YouTube channel using playlistItems API (1 unit cost).
    Returns list of video metadata.
    """
    uploads_playlist_id = get_uploads_playlist_id(channel_id)

    url = "https://www.googleapis.com/youtube/v3/playlistItems"
    params = {
        'part': 'snippet',
        'playlistId': uploads_playlist_id,
        'maxResults': max_results,
        'key': api_key
    }

    response = requests.get(url, params=params)
    response.raise_for_status()
    data = response.json()

    videos = []
    for item in data.get('items', []):
        snippet = item['snippet']
        video_id = snippet['resourceId']['videoId']

        videos.append({
            'video_id': video_id,
            'channel_id': channel_id,
            'channel_name': snippet['channelTitle'],
            'title': snippet['title'],
            'thumbnail_url': snippet['thumbnails'].get('high', {}).get('url') or
                            snippet['thumbnails'].get('medium', {}).get('url') or
                            snippet['thumbnails'].get('default', {}).get('url'),
            'published_at': snippet['publishedAt'],
        })

    return videos


def fetch_all_channel_videos(api_key, max_per_channel=50):
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
            SELECT video_id, channel_id, channel_name, title, thumbnail_url,
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
                    (video_id, channel_id, channel_name, title, thumbnail_url, published_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(video_id) DO UPDATE SET
                    title = excluded.title,
                    thumbnail_url = excluded.thumbnail_url,
                    updated_at = CURRENT_TIMESTAMP
            ''', (
                video['video_id'],
                video['channel_id'],
                video['channel_name'],
                video['title'],
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

        if not row:
            return True

        last_fetched = datetime.fromisoformat(row['last_fetched_at'])
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


def get_news_feed_videos(db_getter, api_key, ticker=None, company_name=None, limit=50):
    """
    Get news feed videos, refreshing cache if needed.
    Optionally filters by ticker and company_name.

    Returns: { 'videos': [...], 'from_cache': bool }
    """
    # Check if any channel needs refresh
    channels_to_refresh = []
    for channel_id in YOUTUBE_CHANNELS.keys():
        if should_refresh_cache(db_getter, channel_id):
            channels_to_refresh.append(channel_id)

    # Refresh stale channels
    if channels_to_refresh and api_key:
        for channel_id in channels_to_refresh:
            try:
                videos = fetch_channel_videos(channel_id, api_key)
                save_videos_to_cache(db_getter, videos)
                mark_channel_fetched(db_getter, channel_id)
            except Exception as e:
                print(f"Error refreshing channel {channel_id}: {e}")

    # Get all cached videos
    all_videos = get_cached_videos(db_getter)

    # Filter by ticker/company if specified
    if ticker:
        filtered = [v for v in all_videos if matches_company(v['title'], ticker, company_name)]
    else:
        filtered = all_videos

    # Add YouTube URL and limit results
    for video in filtered[:limit]:
        video['url'] = f"https://www.youtube.com/watch?v={video['video_id']}"

    return {
        'videos': filtered[:limit],
        'total': len(filtered),
        'from_cache': len(channels_to_refresh) == 0
    }
