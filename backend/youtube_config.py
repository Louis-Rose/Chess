# YouTube News Feed Configuration
# Channel whitelist and company keyword mappings

# Channels to fetch videos from
# Format: { 'channel_id': { 'name': 'Channel Name' } }
# To find channel ID: go to YouTube channel > View Page Source > search "channelId"
YOUTUBE_CHANNELS = {
    'UCfCT7SSFEWyG4th9ZmaGYqQ': {
        'name': 'Joseph Carlson After Hours',
    },
    'UCbta0n8i6Rljh0obO7HzG9A': {
        'name': 'Joseph Carlson',
    },
    'UCrp_UI8XtuYfpiqluWLD7Lw': {
        'name': 'CNBC Television',
    },
    'UCEAZeUIeJs0IjQiqTCdVSIg': {
        'name': 'Yahoo Finance',
    },
}

# Additional keywords for specific companies (optional)
# If a ticker is not in this dict, matching uses the company_name passed from frontend
# Format: { 'TICKER': ['extra_keyword1', 'extra_keyword2', ...] }
EXTRA_KEYWORDS = {
    # Tech giants - add CEO names, product names, etc.
    'AAPL': ['iPhone', 'iPad', 'Mac', 'Tim Cook', 'AAPL'],
    'MSFT': ['Azure', 'Windows', 'Satya Nadella', 'MSFT', 'Xbox', 'Copilot'],
    'GOOGL': ['Google', 'Alphabet'],
    'AMZN': ['AWS', 'Jeff Bezos', 'Andy Jassy', 'AMZN', 'Prime'],
    'META': ['Facebook', 'Instagram', 'WhatsApp', 'Zuckerberg', 'META'],
    'NVDA': ['Jensen Huang', 'GPU', 'CUDA', 'NVDA'],
    'TSLA': ['Elon Musk', 'TSLA', 'Cybertruck', 'Model 3', 'Model Y'],
    # Add more as needed...
}


def get_uploads_playlist_id(channel_id):
    """Convert channel ID to uploads playlist ID (UC... -> UU...)"""
    if channel_id.startswith('UC'):
        return 'UU' + channel_id[2:]
    return channel_id


def matches_company(title, ticker, company_name=None):
    """
    Check if a video title matches a company.
    Uses company_name as primary keyword, plus any extra keywords defined for the ticker.
    """
    title_upper = title.upper()

    # Check ticker itself
    if ticker.upper() in title_upper:
        return True

    # Check company name (primary keyword)
    if company_name and company_name.upper() in title_upper:
        return True

    # Check extra keywords if defined
    extra = EXTRA_KEYWORDS.get(ticker.upper(), [])
    for kw in extra:
        if kw.upper() in title_upper:
            return True

    return False
