#!/usr/bin/env python3
"""
Migration script to merge all stock data sources into a unified stocks.json
"""
import json
import re
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).parent.parent
FRONTEND_UTILS = BASE_DIR / 'frontend/src/apps/investing/utils'
BACKEND_DIR = BASE_DIR / 'backend'
OUTPUT_PATH = BASE_DIR / 'frontend/src/data/stocks.json'

def parse_ts_stock_array(content: str) -> list[dict]:
    """Parse TypeScript array of { ticker: string, name: string }"""
    stocks = []
    # Match patterns like { ticker: 'AAPL', name: 'Apple' }
    pattern = r"\{\s*ticker:\s*['\"]([^'\"]+)['\"],\s*name:\s*['\"]([^'\"]+)['\"]\s*\}"
    for match in re.finditer(pattern, content):
        stocks.append({
            'ticker': match.group(1),
            'name': match.group(2)
        })
    return stocks

def parse_ts_record(content: str) -> dict[str, str]:
    """Parse TypeScript Record<string, string> object"""
    result = {}
    # Match patterns like AAPL: 'https://...' or 'AAPL': 'https://...'
    pattern = r"['\"]?([A-Z0-9._-]+)['\"]?\s*:\s*['\"]([^'\"]+)['\"]"
    for match in re.finditer(pattern, content):
        key = match.group(1)
        value = match.group(2)
        # Skip non-ticker entries (like comments or other objects)
        if not key.startswith('//') and len(key) <= 10:
            result[key] = value
    return result

def parse_european_ticker_map(content: str) -> dict[str, str]:
    """Parse EUROPEAN_TICKER_MAP from investing_utils.py"""
    result = {}
    # Find the EUROPEAN_TICKER_MAP dictionary
    map_match = re.search(r'EUROPEAN_TICKER_MAP\s*=\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}', content, re.DOTALL)
    if map_match:
        map_content = map_match.group(1)
        # Match 'TICKER': 'TICKER.XX' patterns
        pattern = r"['\"]([A-Z0-9._-]+)['\"]:\s*['\"]([A-Z0-9._-]+)['\"]"
        for match in re.finditer(pattern, map_content):
            result[match.group(1)] = match.group(2)
    return result

def determine_region(ticker: str, yfinance: str) -> str:
    """Determine region based on yfinance ticker suffix"""
    if '.' not in yfinance:
        return 'us'
    suffix = '.' + yfinance.split('.')[-1]
    swiss_suffix = '.SW'
    if suffix == swiss_suffix:
        return 'swiss'
    return 'europe'

def main():
    print("Starting stock data migration...")

    # 1. Load stock lists
    print("\n1. Loading stock lists...")

    sp500_content = (FRONTEND_UTILS / 'sp500.ts').read_text()
    sp500_stocks = parse_ts_stock_array(sp500_content)
    print(f"   - SP500: {len(sp500_stocks)} stocks")

    stoxx600_content = (FRONTEND_UTILS / 'stoxx600.ts').read_text()
    stoxx600_stocks = parse_ts_stock_array(stoxx600_content)
    print(f"   - STOXX600: {len(stoxx600_stocks)} stocks")

    swiss_content = (FRONTEND_UTILS / 'swissStocks.ts').read_text()
    swiss_stocks = parse_ts_stock_array(swiss_content)
    print(f"   - Swiss: {len(swiss_stocks)} stocks")

    # 2. Load IR links
    print("\n2. Loading IR links...")
    ir_content = (FRONTEND_UTILS / 'companyIRLinks.ts').read_text()
    ir_links = parse_ts_record(ir_content)
    print(f"   - IR links: {len(ir_links)} entries")

    # 3. Load logo domains
    print("\n3. Loading logo domains...")
    logos_content = (FRONTEND_UTILS / 'companyLogos.ts').read_text()
    logo_domains = parse_ts_record(logos_content)
    print(f"   - Logo domains: {len(logo_domains)} entries")

    # 4. Load European ticker map from backend
    print("\n4. Loading European ticker map...")
    backend_content = (BACKEND_DIR / 'investing_utils.py').read_text()
    european_map = parse_european_ticker_map(backend_content)
    print(f"   - European map: {len(european_map)} entries")

    # 5. Merge all data
    print("\n5. Merging data...")
    stocks_db = {}

    # Process SP500 stocks
    for stock in sp500_stocks:
        ticker = stock['ticker']
        stocks_db[ticker] = {
            'name': stock['name'],
            'yfinance': ticker,  # US stocks don't need suffix
            'region': 'us'
        }

    # Process STOXX600 stocks
    for stock in stoxx600_stocks:
        ticker = stock['ticker']
        yfinance = european_map.get(ticker, ticker)
        region = determine_region(ticker, yfinance)
        stocks_db[ticker] = {
            'name': stock['name'],
            'yfinance': yfinance,
            'region': region
        }

    # Process Swiss stocks
    for stock in swiss_stocks:
        ticker = stock['ticker']
        yfinance = european_map.get(ticker, f"{ticker}.SW")  # Default to .SW for Swiss
        stocks_db[ticker] = {
            'name': stock['name'],
            'yfinance': yfinance,
            'region': 'swiss'
        }

    # Add any tickers from European map that aren't already in the DB
    for ticker, yfinance in european_map.items():
        if ticker not in stocks_db:
            region = determine_region(ticker, yfinance)
            stocks_db[ticker] = {
                'name': ticker,  # No name available, use ticker
                'yfinance': yfinance,
                'region': region
            }

    # Add IR links
    for ticker, url in ir_links.items():
        if ticker in stocks_db:
            stocks_db[ticker]['ir'] = url
        else:
            # IR link for unknown ticker - add minimal entry
            stocks_db[ticker] = {
                'name': ticker,
                'yfinance': ticker,
                'region': 'us',  # Assume US if unknown
                'ir': url
            }

    # Add logo domains
    for ticker, domain in logo_domains.items():
        if ticker in stocks_db:
            stocks_db[ticker]['logo'] = domain

    print(f"   - Total unique stocks: {len(stocks_db)}")

    # 6. Sort by ticker for consistent output
    stocks_db = dict(sorted(stocks_db.items()))

    # 7. Write output
    print("\n6. Writing stocks.json...")
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, 'w') as f:
        json.dump(stocks_db, f, indent=2, ensure_ascii=False)
    print(f"   - Written to: {OUTPUT_PATH}")

    # 8. Summary
    print("\n=== Summary ===")
    regions = {}
    with_ir = 0
    with_logo = 0
    for ticker, data in stocks_db.items():
        region = data['region']
        regions[region] = regions.get(region, 0) + 1
        if 'ir' in data:
            with_ir += 1
        if 'logo' in data:
            with_logo += 1

    print(f"Total stocks: {len(stocks_db)}")
    for region, count in sorted(regions.items()):
        print(f"  - {region}: {count}")
    print(f"With IR links: {with_ir}")
    print(f"With logo domains: {with_logo}")

    print("\nMigration complete!")

if __name__ == '__main__':
    main()
