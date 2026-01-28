#!/usr/bin/env python3
"""
Test script to explore alternative data sources for European stocks quarterly data.
Specifically targeting LVMH (MC.PA) quarterly revenue data.
"""

import requests
import json

# Test 1: Check if Koyfin has a public API
print("=" * 60)
print("Testing potential data sources for LVMH quarterly data")
print("=" * 60)

# Koyfin doesn't have a public API, but let's check what we can find
# They require login for most features

# Test 2: Try Financial Modeling Prep with the free key
FMP_API_KEY = "wQ9CS5yV1jYLqbasB7mDFjUuNuDYgx5o"

print("\n1. Testing FMP API for LVMH (MC.PA)...")
try:
    # Try different symbol formats
    symbols_to_try = ["MC.PA", "MC", "LVMH", "LVMUY"]

    for symbol in symbols_to_try:
        url = f"https://financialmodelingprep.com/stable/income-statement?symbol={symbol}&period=quarter&apikey={FMP_API_KEY}"
        response = requests.get(url, timeout=10)

        if response.status_code == 200:
            data = response.json() if response.text else None
            if data and isinstance(data, list) and len(data) > 0:
                print(f"   ✅ {symbol}: Found {len(data)} quarterly records")
                print(f"      Latest: {data[0].get('date', 'N/A')} - Revenue: {data[0].get('revenue', 'N/A')}")
            else:
                print(f"   ❌ {symbol}: No data or requires premium")
        else:
            print(f"   ❌ {symbol}: HTTP {response.status_code}")
except Exception as e:
    print(f"   Error: {e}")

# Test 3: Try Alpha Vantage (free tier)
print("\n2. Testing Alpha Vantage for LVMH...")
# Note: Alpha Vantage free tier is very limited
# Would need an API key to test

# Test 4: Check what yfinance actually returns
print("\n3. Checking yfinance data for LVMH (MC.PA)...")
try:
    import yfinance as yf

    ticker = yf.Ticker("MC.PA")

    # Get quarterly income statement
    quarterly = ticker.quarterly_income_stmt
    annual = ticker.income_stmt

    print(f"   Quarterly income statement columns: {len(quarterly.columns) if quarterly is not None else 0}")
    print(f"   Annual income statement columns: {len(annual.columns) if annual is not None else 0}")

    if quarterly is not None and not quarterly.empty:
        print(f"   Quarterly dates: {list(quarterly.columns)[:4]}")
        if 'Total Revenue' in quarterly.index:
            revenues = quarterly.loc['Total Revenue']
            print(f"   Quarterly revenues: {revenues.head(4).to_dict()}")
    else:
        print("   ❌ No quarterly data from yfinance")

    if annual is not None and not annual.empty:
        print(f"   Annual dates: {list(annual.columns)[:4]}")
        if 'Total Revenue' in annual.index:
            revenues = annual.loc['Total Revenue']
            print(f"   Annual revenues: {revenues.head(4).to_dict()}")

except Exception as e:
    print(f"   Error: {e}")

# Test 5: Try EODHD (requires paid API key)
print("\n4. EODHD API (requires paid subscription ~$20/mo)")
print("   - Best for European quarterly data")
print("   - Would need to sign up at: https://eodhd.com/")

# Test 6: Check Koyfin manually
print("\n5. Koyfin (Manual check required)")
print("   - Go to: https://app.koyfin.com/")
print("   - Search for 'MC' (French flag for LVMH)")
print("   - Click 'Financial Analysis' > Toggle to 'Quarterly'")
print("   - Note: Free signup required, no public API")

print("\n" + "=" * 60)
print("SUMMARY")
print("=" * 60)
print("""
For LVMH quarterly data, the options are:

1. FREE (limited):
   - yfinance: Only annual data for European stocks
   - FMP free tier: US stocks only

2. PAID (~$20/mo):
   - EODHD: Best European coverage, has quarterly data
   - FMP premium: Includes European stocks

3. MANUAL (free):
   - Koyfin: Visual tool with quarterly data, no API
   - Macrotrends: Web scraping possible but messy

Recommendation: If quarterly European data is critical,
EODHD at ~$20/mo is the best programmatic solution.
""")
