#!/usr/bin/env python3
"""
SQLite to PostgreSQL Data Migration Script

This script migrates data from the existing SQLite database to PostgreSQL.
Run this AFTER PostgreSQL is set up and the schema is created.

Usage:
    1. Start PostgreSQL: docker-compose up -d db
    2. Set environment variables for PostgreSQL connection
    3. Run: python migrate_sqlite_to_postgres.py

Environment variables required:
    - DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD

The script will:
    1. Connect to SQLite (investing.db)
    2. Connect to PostgreSQL
    3. Migrate all tables preserving data
"""

import os
import sqlite3
import psycopg2
from psycopg2.extras import execute_values

# Configuration
SQLITE_PATH = os.path.join(os.path.dirname(__file__), 'investing.db')
PG_HOST = os.environ.get('DB_HOST', 'localhost')
PG_PORT = os.environ.get('DB_PORT', '5432')
PG_NAME = os.environ.get('DB_NAME', 'lumna')
PG_USER = os.environ.get('DB_USER', 'lumna')
PG_PASSWORD = os.environ.get('DB_PASSWORD')

# Tables to migrate (in order due to foreign key constraints)
TABLES = [
    'users',
    'user_preferences',
    'refresh_tokens',
    'player_stats_cache',
    'investment_accounts',
    'portfolio_transactions',
    'historical_prices',
    'historical_fx_rates',
    'watchlist',
    'earnings_watchlist',
    'earnings_cache',
    'user_activity',
    'page_activity',
    'earnings_alert_preferences',
    'graph_downloads',
    'stock_views',
    'youtube_videos_cache',
    'youtube_channel_fetch_log',
    'theme_usage',
    'language_usage',
    'device_usage',
    'first_visitor_reward',
]


def get_sqlite_conn():
    """Get SQLite connection."""
    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def get_pg_conn():
    """Get PostgreSQL connection."""
    if not PG_PASSWORD:
        raise ValueError("DB_PASSWORD environment variable is required for PostgreSQL")
    return psycopg2.connect(
        host=PG_HOST,
        port=PG_PORT,
        dbname=PG_NAME,
        user=PG_USER,
        password=PG_PASSWORD
    )


def get_table_columns(sqlite_conn, table_name):
    """Get column names for a table."""
    cursor = sqlite_conn.execute(f"PRAGMA table_info({table_name})")
    return [row[1] for row in cursor.fetchall()]


def migrate_table(sqlite_conn, pg_conn, table_name):
    """Migrate a single table from SQLite to PostgreSQL."""
    print(f"  Migrating {table_name}...", end=" ")

    # Get columns
    columns = get_table_columns(sqlite_conn, table_name)
    if not columns:
        print("SKIPPED (no columns)")
        return 0

    # Fetch data from SQLite
    cursor = sqlite_conn.execute(f"SELECT * FROM {table_name}")
    rows = cursor.fetchall()

    if not rows:
        print("SKIPPED (no data)")
        return 0

    # Prepare data for PostgreSQL
    data = [tuple(row) for row in rows]

    # Build INSERT query
    cols_str = ', '.join(columns)
    placeholders = ', '.join(['%s'] * len(columns))

    # Clear existing data and insert
    pg_cursor = pg_conn.cursor()
    try:
        # Disable triggers temporarily for faster inserts
        pg_cursor.execute(f"TRUNCATE TABLE {table_name} CASCADE")

        # Insert data
        insert_query = f"INSERT INTO {table_name} ({cols_str}) VALUES ({placeholders})"
        pg_cursor.executemany(insert_query, data)

        # Reset sequence for tables with SERIAL id
        if 'id' in columns:
            pg_cursor.execute(f"""
                SELECT setval(pg_get_serial_sequence('{table_name}', 'id'),
                              COALESCE((SELECT MAX(id) FROM {table_name}), 1))
            """)

        pg_conn.commit()
        print(f"OK ({len(rows)} rows)")
        return len(rows)
    except Exception as e:
        pg_conn.rollback()
        print(f"ERROR: {e}")
        return 0


def main():
    print("=" * 60)
    print("SQLite to PostgreSQL Migration")
    print("=" * 60)

    # Check SQLite file exists
    if not os.path.exists(SQLITE_PATH):
        print(f"ERROR: SQLite database not found at {SQLITE_PATH}")
        return

    print(f"\nSource: {SQLITE_PATH}")
    print(f"Target: postgresql://{PG_USER}@{PG_HOST}:{PG_PORT}/{PG_NAME}")
    print()

    # Confirm before proceeding
    response = input("This will REPLACE all data in PostgreSQL. Continue? [y/N]: ")
    if response.lower() != 'y':
        print("Aborted.")
        return

    print("\nConnecting to databases...")
    sqlite_conn = get_sqlite_conn()
    pg_conn = get_pg_conn()

    print("\nMigrating tables:")
    total_rows = 0
    for table in TABLES:
        try:
            rows = migrate_table(sqlite_conn, pg_conn, table)
            total_rows += rows
        except Exception as e:
            print(f"  {table}: ERROR - {e}")

    sqlite_conn.close()
    pg_conn.close()

    print("\n" + "=" * 60)
    print(f"Migration complete! Total rows migrated: {total_rows}")
    print("=" * 60)


if __name__ == '__main__':
    main()
