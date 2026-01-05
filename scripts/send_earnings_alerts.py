#!/usr/bin/env python3
"""
Earnings Alert Email Sender

This script sends earnings alert emails to subscribed users.
Run it via cron (9 AM Paris time = 8 AM UTC in winter, 7 AM UTC in summer):

Using system cron with TZ environment variable:
  CRON_TZ=Europe/Paris
  0 9 * * 1 cd /home/azureuser/Chess && ./venv/bin/python scripts/send_earnings_alerts.py weekly
  0 9 * * * cd /home/azureuser/Chess && ./venv/bin/python scripts/send_earnings_alerts.py days_before

Or using systemd timers with OnCalendar=*-*-* 09:00:00 Europe/Paris
"""

import os
import sys
from datetime import datetime, timedelta

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

# Load environment
env = os.environ.get('FLASK_ENV', 'dev')
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'backend', f'.env.{env}'))

import yfinance as yf
from database import get_db
from email_utils import send_earnings_alert_email


def get_company_name(ticker: str) -> str:
    """Fetch company name from yfinance."""
    try:
        stock = yf.Ticker(ticker)
        info = stock.info
        return info.get('longName') or info.get('shortName') or ticker
    except Exception:
        return ticker


def get_user_earnings_data(user_id: int) -> list:
    """Get earnings data for a user's portfolio and watchlist."""
    from database import get_db

    tickers = set()

    with get_db() as conn:
        # Get portfolio tickers
        cursor = conn.execute('''
            SELECT DISTINCT stock_ticker FROM portfolio_transactions
            WHERE user_id = ?
        ''', (user_id,))
        for row in cursor.fetchall():
            tickers.add(row['stock_ticker'])

        # Get watchlist tickers
        cursor = conn.execute('''
            SELECT stock_ticker FROM watchlist WHERE user_id = ?
        ''', (user_id,))
        for row in cursor.fetchall():
            tickers.add(row['stock_ticker'])

    if not tickers:
        return []

    today = datetime.now().date()
    earnings_data = []

    for ticker in tickers:
        with get_db() as conn:
            cursor = conn.execute('''
                SELECT next_earnings_date, date_confirmed FROM earnings_cache
                WHERE ticker = ?
            ''', (ticker,))
            row = cursor.fetchone()

            if row and row['next_earnings_date']:
                try:
                    earnings_date = datetime.strptime(row['next_earnings_date'], '%Y-%m-%d').date()
                    remaining_days = (earnings_date - today).days

                    if remaining_days >= 0:  # Only future earnings
                        earnings_data.append({
                            'ticker': ticker,
                            'company_name': get_company_name(ticker),
                            'next_earnings_date': row['next_earnings_date'],
                            'remaining_days': remaining_days,
                            'date_confirmed': bool(row['date_confirmed'])
                        })
                except ValueError:
                    continue

    # Sort by remaining days
    earnings_data.sort(key=lambda x: x['remaining_days'])
    return earnings_data


def send_weekly_alerts():
    """Send weekly summary emails to all subscribed users."""
    print(f"[{datetime.now()}] Starting weekly alerts...")

    with get_db() as conn:
        cursor = conn.execute('''
            SELECT u.id, u.email, u.name, eap.days_before
            FROM users u
            JOIN earnings_alert_preferences eap ON u.id = eap.user_id
            WHERE eap.weekly_enabled = 1
        ''')
        users = cursor.fetchall()

    sent_count = 0
    for user in users:
        user_id = user['id']
        email = user['email']
        name = user['name'] or 'Investor'

        earnings_data = get_user_earnings_data(user_id)

        if earnings_data:
            # Filter to only earnings in the next 14 days for weekly summary
            earnings_data = [e for e in earnings_data if e['remaining_days'] <= 14]

            if earnings_data:
                success = send_earnings_alert_email(email, name, earnings_data, 'weekly')
                if success:
                    sent_count += 1
                    print(f"  Sent weekly alert to {email}")
                else:
                    print(f"  Failed to send to {email}")

    print(f"[{datetime.now()}] Weekly alerts complete. Sent {sent_count} emails.")


def send_days_before_alerts():
    """Send alerts to users whose stocks have earnings in X days."""
    print(f"[{datetime.now()}] Starting days-before alerts...")

    with get_db() as conn:
        cursor = conn.execute('''
            SELECT u.id, u.email, u.name, eap.days_before
            FROM users u
            JOIN earnings_alert_preferences eap ON u.id = eap.user_id
            WHERE eap.days_before_enabled = 1
        ''')
        users = cursor.fetchall()

    sent_count = 0
    for user in users:
        user_id = user['id']
        email = user['email']
        name = user['name'] or 'Investor'
        days_before = user['days_before']

        earnings_data = get_user_earnings_data(user_id)

        if earnings_data:
            # Filter to only earnings exactly X days away
            matching_earnings = [e for e in earnings_data if e['remaining_days'] == days_before]

            if matching_earnings:
                success = send_earnings_alert_email(email, name, matching_earnings, 'days_before')
                if success:
                    sent_count += 1
                    print(f"  Sent {days_before}-day alert to {email} for {[e['ticker'] for e in matching_earnings]}")
                else:
                    print(f"  Failed to send to {email}")

    print(f"[{datetime.now()}] Days-before alerts complete. Sent {sent_count} emails.")


def main():
    if len(sys.argv) < 2:
        print("Usage: python send_earnings_alerts.py [weekly|days_before|all]")
        sys.exit(1)

    alert_type = sys.argv[1]

    if alert_type == 'weekly':
        send_weekly_alerts()
    elif alert_type == 'days_before':
        send_days_before_alerts()
    elif alert_type == 'all':
        send_weekly_alerts()
        send_days_before_alerts()
    else:
        print(f"Unknown alert type: {alert_type}")
        print("Usage: python send_earnings_alerts.py [weekly|days_before|all]")
        sys.exit(1)


if __name__ == '__main__':
    main()
