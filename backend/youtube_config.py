# YouTube News Feed Configuration
# Channel whitelist and company keyword mappings

# Channels to fetch videos from
# Format: { 'channel_id': { 'name': 'Channel Name', 'uploads_playlist_id': 'UU...' } }
# Note: uploads_playlist_id is the channel_id with 'UC' replaced by 'UU'
YOUTUBE_CHANNELS = {
    # Example finance/investing channels (replace with actual channel IDs)
    'UCnMn36GT_H0X-w5_ckLtlgQ': {
        'name': 'The Motley Fool',
    },
    'UCV6KDgJskWaEckne5aPA0aQ': {
        'name': 'Graham Stephan',
    },
    'UCGy7SkBjcIAgTiwkXEtPnYg': {
        'name': 'Andrei Jikh',
    },
    'UCfMiRVQJuTj3NpZZP1tKShQ': {
        'name': 'Meet Kevin',
    },
    'UCbta5YGaQFTkEA5Ac6_Ut_Q': {
        'name': 'CNBC',
    },
    'UCIALMKvObZNtJ6AmdCLP7Lg': {
        'name': 'Bloomberg Television',
    },
}

# Company keywords mapping
# Format: { 'TICKER': ['keyword1', 'keyword2', ...] }
# Video title must contain at least one keyword (case-insensitive) to be shown for that company
COMPANY_KEYWORDS = {
    # Big Tech
    'AAPL': ['Apple', 'iPhone', 'iPad', 'Mac', 'Tim Cook', 'AAPL'],
    'MSFT': ['Microsoft', 'Windows', 'Azure', 'Satya Nadella', 'MSFT', 'Xbox'],
    'GOOGL': ['Google', 'Alphabet', 'YouTube', 'Android', 'GOOGL', 'Sundar Pichai'],
    'AMZN': ['Amazon', 'AWS', 'Jeff Bezos', 'Andy Jassy', 'AMZN', 'Prime'],
    'META': ['Meta', 'Facebook', 'Instagram', 'WhatsApp', 'Zuckerberg', 'META'],
    'NVDA': ['Nvidia', 'NVDA', 'Jensen Huang', 'GPU', 'CUDA'],
    'TSLA': ['Tesla', 'Elon Musk', 'TSLA', 'Cybertruck', 'Model 3', 'Model Y'],

    # Semiconductors
    'AMD': ['AMD', 'Lisa Su', 'Ryzen', 'Radeon', 'EPYC'],
    'INTC': ['Intel', 'INTC', 'Pat Gelsinger'],
    'AVGO': ['Broadcom', 'AVGO'],
    'QCOM': ['Qualcomm', 'QCOM', 'Snapdragon'],
    'TSM': ['TSMC', 'Taiwan Semiconductor', 'TSM'],
    'ASML': ['ASML', 'EUV', 'lithography'],

    # Finance
    'JPM': ['JPMorgan', 'JP Morgan', 'Jamie Dimon', 'JPM'],
    'BAC': ['Bank of America', 'BofA', 'BAC'],
    'GS': ['Goldman Sachs', 'Goldman', 'GS'],
    'MS': ['Morgan Stanley', 'MS'],
    'V': ['Visa', 'V'],
    'MA': ['Mastercard', 'MA'],

    # Healthcare
    'JNJ': ['Johnson & Johnson', 'J&J', 'JNJ'],
    'UNH': ['UnitedHealth', 'UNH'],
    'PFE': ['Pfizer', 'PFE'],
    'MRK': ['Merck', 'MRK'],
    'ABBV': ['AbbVie', 'ABBV'],
    'LLY': ['Eli Lilly', 'Lilly', 'LLY'],

    # Consumer
    'KO': ['Coca-Cola', 'Coke', 'KO'],
    'PEP': ['Pepsi', 'PepsiCo', 'PEP'],
    'WMT': ['Walmart', 'WMT'],
    'COST': ['Costco', 'COST'],
    'NKE': ['Nike', 'NKE'],
    'MCD': ['McDonald', 'MCD'],
    'SBUX': ['Starbucks', 'SBUX'],

    # Industrial
    'CAT': ['Caterpillar', 'CAT'],
    'BA': ['Boeing', 'BA'],
    'GE': ['General Electric', 'GE'],
    'HON': ['Honeywell', 'HON'],
    'UPS': ['UPS', 'United Parcel'],

    # Energy
    'XOM': ['Exxon', 'ExxonMobil', 'XOM'],
    'CVX': ['Chevron', 'CVX'],

    # Streaming & Entertainment
    'NFLX': ['Netflix', 'NFLX'],
    'DIS': ['Disney', 'DIS'],
    'WBD': ['Warner Bros', 'WBD', 'HBO'],

    # Retail & E-commerce
    'TGT': ['Target', 'TGT'],
    'HD': ['Home Depot', 'HD'],
    'LOW': ['Lowe\'s', 'Lowes', 'LOW'],

    # Airlines
    'DAL': ['Delta', 'DAL'],
    'UAL': ['United Airlines', 'UAL'],
    'AAL': ['American Airlines', 'AAL'],

    # Crypto-adjacent
    'COIN': ['Coinbase', 'COIN'],
    'MSTR': ['MicroStrategy', 'MSTR', 'Saylor'],
}


def get_uploads_playlist_id(channel_id):
    """Convert channel ID to uploads playlist ID (UC... -> UU...)"""
    if channel_id.startswith('UC'):
        return 'UU' + channel_id[2:]
    return channel_id


def matches_company(title, ticker):
    """Check if a video title matches a company's keywords."""
    keywords = COMPANY_KEYWORDS.get(ticker, [])
    if not keywords:
        # If no keywords defined, match on ticker itself
        return ticker.upper() in title.upper()

    title_upper = title.upper()
    return any(kw.upper() in title_upper for kw in keywords)
