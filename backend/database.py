"""
Database abstraction layer supporting both SQLite (development) and PostgreSQL (production).

Environment variables for PostgreSQL:
- DB_HOST: PostgreSQL host (default: localhost)
- DB_PORT: PostgreSQL port (default: 5432)
- DB_NAME: Database name (default: lumna)
- DB_USER: Database user (default: lumna)
- DB_PASSWORD: Database password (required for PostgreSQL)

If DB_PASSWORD is not set, falls back to SQLite using DATABASE_PATH or default investing.db
"""

import os
import json
from datetime import datetime, timedelta, timezone
from contextlib import contextmanager

# Database configuration
DB_HOST = os.environ.get('DB_HOST', 'localhost')
DB_PORT = os.environ.get('DB_PORT', '5432')
DB_NAME = os.environ.get('DB_NAME', 'lumna')
DB_USER = os.environ.get('DB_USER', 'lumna')
DB_PASSWORD = os.environ.get('DB_PASSWORD')

# SQLite fallback path
_DEFAULT_DB = os.path.join(os.path.dirname(__file__), 'investing.db')
DATABASE_PATH = os.environ.get('DATABASE_PATH', _DEFAULT_DB)

# Determine which database to use
USE_POSTGRES = bool(DB_PASSWORD)

CACHE_MAX_AGE_MINUTES = 30

# Import the appropriate driver
if USE_POSTGRES:
    import psycopg2
    from psycopg2.extras import RealDictCursor
    print(f"[Database] Using PostgreSQL at {DB_HOST}:{DB_PORT}/{DB_NAME}")
else:
    import sqlite3
    print(f"[Database] Using SQLite at {DATABASE_PATH}")


class DictRow(dict):
    """Wrapper to allow both dict-style and attribute-style access."""
    def __getitem__(self, key):
        if isinstance(key, int):
            return list(self.values())[key]
        return super().__getitem__(key)


def _sqlite_dict_factory(cursor, row):
    """Convert SQLite row to dict."""
    return DictRow({col[0]: row[idx] for idx, col in enumerate(cursor.description)})


def get_db_connection():
    """Get a database connection with dict-like row access."""
    if USE_POSTGRES:
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
            cursor_factory=RealDictCursor
        )
        return conn
    else:
        conn = sqlite3.connect(DATABASE_PATH)
        conn.row_factory = _sqlite_dict_factory
        return conn


@contextmanager
def get_db():
    """Context manager for database connections with auto-commit/rollback."""
    conn = get_db_connection()
    try:
        if USE_POSTGRES:
            # PostgreSQL uses cursor for execution
            cursor = conn.cursor()
            yield _PostgresConnectionWrapper(conn, cursor)
        else:
            yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


class _PostgresConnectionWrapper:
    """Wrapper to provide consistent interface between SQLite and PostgreSQL."""

    def __init__(self, conn, cursor):
        self._conn = conn
        self._cursor = cursor

    def execute(self, query, params=None):
        """Execute a query, converting SQLite placeholders to PostgreSQL."""
        pg_query = self._convert_query(query)
        if params:
            self._cursor.execute(pg_query, params)
        else:
            self._cursor.execute(pg_query)
        return self._cursor

    def executescript(self, script):
        """Execute a SQL script."""
        self._cursor.execute(script)

    def _convert_query(self, query):
        """Convert SQLite-style query to PostgreSQL."""
        # Replace ? placeholders with %s
        return query.replace('?', '%s')

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()


def init_db():
    """Initialize database with schema."""
    if USE_POSTGRES:
        # PostgreSQL schema is initialized via docker-entrypoint-initdb.d
        # Run migrations for any new columns
        with get_db() as conn:

            # Migration: Add price_currency column to portfolio_transactions if not exists
            conn.execute("""
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'portfolio_transactions' AND column_name = 'price_currency'
            """)
            if not conn._cursor.fetchone():
                conn.execute("ALTER TABLE portfolio_transactions ADD COLUMN price_currency TEXT DEFAULT 'EUR'")
                print("[Database] Added price_currency column to portfolio_transactions")

            # Migration: Add display_order column to investment_accounts if not exists
            conn.execute("""
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'investment_accounts' AND column_name = 'display_order'
            """)
            if not conn._cursor.fetchone():
                conn.execute("ALTER TABLE investment_accounts ADD COLUMN display_order INTEGER DEFAULT 0")
                print("[Database] Added display_order column to investment_accounts")

            # Migration: Add earnings_time column to earnings_cache if not exists
            conn.execute("""
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'earnings_cache' AND column_name = 'earnings_time'
            """)
            if not conn._cursor.fetchone():
                conn.execute("ALTER TABLE earnings_cache ADD COLUMN earnings_time TEXT")
                # Clear cache to force refresh with new FMP data
                conn.execute("DELETE FROM earnings_cache")
                print("[Database] Added earnings_time column to earnings_cache and cleared cache")

            # Migration: Create dividends_cache table if not exists
            conn.execute("""
                SELECT table_name FROM information_schema.tables
                WHERE table_name = 'dividends_cache'
            """)
            if not conn._cursor.fetchone():
                conn.execute("""
                    CREATE TABLE dividends_cache (
                        ticker TEXT PRIMARY KEY,
                        ex_dividend_date TEXT,
                        dividend_amount REAL,
                        pays_dividends INTEGER DEFAULT 1,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                print("[Database] Created dividends_cache table")

            # Migration: Add duration column to youtube_videos_cache if not exists
            conn.execute("""
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'youtube_videos_cache' AND column_name = 'duration'
            """)
            if not conn._cursor.fetchone():
                conn.execute("ALTER TABLE youtube_videos_cache ADD COLUMN duration INTEGER")
                print("[Database] Added duration column to youtube_videos_cache")

            # Migration: Create video_summaries table if not exists
            conn.execute("""
                SELECT table_name FROM information_schema.tables
                WHERE table_name = 'video_summaries'
            """)
            if not conn._cursor.fetchone():
                conn.execute("""
                    CREATE TABLE video_summaries (
                        video_id TEXT NOT NULL,
                        ticker TEXT NOT NULL,
                        summary TEXT NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        PRIMARY KEY (video_id, ticker)
                    )
                """)
                print("[Database] Created video_summaries table")

            # Migration: Add ticker column to video_summaries if not exists (migrate to per-company summaries)
            conn.execute("""
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'video_summaries' AND column_name = 'ticker'
            """)
            if not conn._cursor.fetchone():
                # Recreate table with new schema (old summaries are invalidated - they need to be regenerated per ticker)
                conn.execute("DROP TABLE video_summaries")
                conn.execute("""
                    CREATE TABLE video_summaries (
                        video_id TEXT NOT NULL,
                        ticker TEXT NOT NULL,
                        summary TEXT NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        PRIMARY KEY (video_id, ticker)
                    )
                """)
                print("[Database] Migrated video_summaries to per-ticker schema")

            # Migration: Create video_transcripts table if not exists
            conn.execute("""
                SELECT table_name FROM information_schema.tables
                WHERE table_name = 'video_transcripts'
            """)
            if not conn._cursor.fetchone():
                conn.execute("""
                    CREATE TABLE video_transcripts (
                        video_id TEXT PRIMARY KEY,
                        transcript TEXT,
                        has_transcript INTEGER DEFAULT 1,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                print("[Database] Created video_transcripts table")

            # Migration: Create company_video_selections table if not exists
            conn.execute("""
                SELECT table_name FROM information_schema.tables
                WHERE table_name = 'company_video_selections'
            """)
            if not conn._cursor.fetchone():
                conn.execute("""
                    CREATE TABLE company_video_selections (
                        ticker TEXT NOT NULL,
                        video_id TEXT NOT NULL,
                        selected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        PRIMARY KEY (ticker, video_id)
                    )
                """)
                conn.execute("CREATE INDEX idx_company_video_selections_video ON company_video_selections(video_id)")
                print("[Database] Created company_video_selections table")

            # Migration: Create video_sync_runs table
            conn.execute("""
                SELECT table_name FROM information_schema.tables
                WHERE table_name = 'video_sync_runs'
            """)
            if not conn._cursor.fetchone():
                conn.execute("""
                    CREATE TABLE video_sync_runs (
                        id SERIAL PRIMARY KEY,
                        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        ended_at TIMESTAMP,
                        status TEXT DEFAULT 'running',
                        tickers_count INTEGER DEFAULT 0,
                        videos_total INTEGER DEFAULT 0,
                        videos_processed INTEGER DEFAULT 0,
                        transcripts_fetched INTEGER DEFAULT 0,
                        summaries_generated INTEGER DEFAULT 0,
                        errors INTEGER DEFAULT 0,
                        current_video TEXT,
                        current_step TEXT,
                        error_message TEXT
                    )
                """)
                print("[Database] Created video_sync_runs table")
            else:
                # Migration: Add current_step column if missing
                conn.execute("""
                    SELECT column_name FROM information_schema.columns
                    WHERE table_name = 'video_sync_runs' AND column_name = 'current_step'
                """)
                if not conn._cursor.fetchone():
                    conn.execute("ALTER TABLE video_sync_runs ADD COLUMN current_step TEXT")
                    print("[Database] Added current_step column to video_sync_runs")
                # Migration: Add videos_list column if missing
                conn.execute("""
                    SELECT column_name FROM information_schema.columns
                    WHERE table_name = 'video_sync_runs' AND column_name = 'videos_list'
                """)
                if not conn._cursor.fetchone():
                    conn.execute("ALTER TABLE video_sync_runs ADD COLUMN videos_list TEXT")
                    print("[Database] Added videos_list column to video_sync_runs")
                # Migration: Add updated_at column if missing
                conn.execute("""
                    SELECT column_name FROM information_schema.columns
                    WHERE table_name = 'video_sync_runs' AND column_name = 'updated_at'
                """)
                if not conn._cursor.fetchone():
                    conn.execute("ALTER TABLE video_sync_runs ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
                    print("[Database] Added updated_at column to video_sync_runs")

            # Migration: Add summary_fr column to video_summaries for French translations
            conn.execute("""
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'video_summaries' AND column_name = 'summary_fr'
            """)
            if not conn._cursor.fetchone():
                conn.execute("ALTER TABLE video_summaries ADD COLUMN summary_fr TEXT")
                # Rename summary to summary_en for clarity
                conn.execute("ALTER TABLE video_summaries RENAME COLUMN summary TO summary_en")
                print("[Database] Added summary_fr column to video_summaries")

            # Migration: Create demo_investment_accounts table if not exists
            conn.execute("""
                SELECT table_name FROM information_schema.tables
                WHERE table_name = 'demo_investment_accounts'
            """)
            if not conn._cursor.fetchone():
                conn.execute("""
                    CREATE TABLE demo_investment_accounts (
                        id SERIAL PRIMARY KEY,
                        user_id INTEGER NOT NULL,
                        name TEXT NOT NULL,
                        account_type TEXT NOT NULL,
                        bank TEXT NOT NULL,
                        display_order INTEGER DEFAULT 0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                    )
                """)
                conn.execute("CREATE INDEX idx_demo_investment_accounts_user_id ON demo_investment_accounts(user_id)")
                print("[Database] Created demo_investment_accounts table")

            # Migration: Create demo_portfolio_transactions table if not exists
            conn.execute("""
                SELECT table_name FROM information_schema.tables
                WHERE table_name = 'demo_portfolio_transactions'
            """)
            if not conn._cursor.fetchone():
                conn.execute("""
                    CREATE TABLE demo_portfolio_transactions (
                        id SERIAL PRIMARY KEY,
                        user_id INTEGER NOT NULL,
                        account_id INTEGER,
                        stock_ticker TEXT NOT NULL,
                        transaction_type TEXT NOT NULL,
                        quantity REAL NOT NULL,
                        transaction_date TEXT NOT NULL,
                        price_per_share REAL NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                        FOREIGN KEY (account_id) REFERENCES demo_investment_accounts(id) ON DELETE SET NULL
                    )
                """)
                conn.execute("CREATE INDEX idx_demo_portfolio_transactions_user_id ON demo_portfolio_transactions(user_id)")
                conn.execute("CREATE INDEX idx_demo_portfolio_transactions_ticker ON demo_portfolio_transactions(stock_ticker)")
                conn.execute("CREATE INDEX idx_demo_portfolio_transactions_account_id ON demo_portfolio_transactions(account_id)")
                print("[Database] Created demo_portfolio_transactions table")

            # Migration: Create alphawise_model_portfolio table if not exists
            conn.execute("""
                SELECT table_name FROM information_schema.tables
                WHERE table_name = 'alphawise_model_portfolio'
            """)
            if not conn._cursor.fetchone():
                conn.execute("""
                    CREATE TABLE alphawise_model_portfolio (
                        id SERIAL PRIMARY KEY,
                        stock_ticker TEXT UNIQUE NOT NULL,
                        allocation_pct REAL NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                print("[Database] Created alphawise_model_portfolio table")

            # Migration: Create monthly_archive_cache table if not exists
            conn.execute("""
                SELECT table_name FROM information_schema.tables
                WHERE table_name = 'monthly_archive_cache'
            """)
            if not conn._cursor.fetchone():
                conn.execute("""
                    CREATE TABLE monthly_archive_cache (
                        username TEXT NOT NULL,
                        archive_url TEXT NOT NULL,
                        games_json TEXT NOT NULL,
                        fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        PRIMARY KEY (username, archive_url)
                    )
                """)
                print("[Database] Created monthly_archive_cache table")
    else:
        # SQLite: run migrations and schema
        schema_path = os.path.join(os.path.dirname(__file__), 'schema.sql')
        conn = sqlite3.connect(DATABASE_PATH)
        conn.row_factory = _sqlite_dict_factory
        try:
            # Migration: Add account_id column to portfolio_transactions if not exists
            cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='portfolio_transactions'")
            if cursor.fetchone():
                cursor = conn.execute("PRAGMA table_info(portfolio_transactions)")
                columns = [row['name'] for row in cursor.fetchall()]
                if 'account_id' not in columns:
                    conn.execute('ALTER TABLE portfolio_transactions ADD COLUMN account_id INTEGER')
                if 'price_currency' not in columns:
                    conn.execute("ALTER TABLE portfolio_transactions ADD COLUMN price_currency TEXT DEFAULT 'EUR'")

            # Migration: Update device_usage table
            cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='device_usage'")
            if cursor.fetchone():
                cursor = conn.execute("PRAGMA table_info(device_usage)")
                columns = [row['name'] for row in cursor.fetchall()]
                if 'minutes' not in columns:
                    conn.execute('DROP TABLE device_usage')

            # Migration: Add cookie_consent columns to users table
            cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
            if cursor.fetchone():
                cursor = conn.execute("PRAGMA table_info(users)")
                columns = [row['name'] for row in cursor.fetchall()]
                if 'cookie_consent' not in columns:
                    conn.execute('ALTER TABLE users ADD COLUMN cookie_consent TEXT')
                if 'cookie_consent_at' not in columns:
                    conn.execute('ALTER TABLE users ADD COLUMN cookie_consent_at TIMESTAMP')
                if 'cookie_refusal_count' not in columns:
                    conn.execute('ALTER TABLE users ADD COLUMN cookie_refusal_count INTEGER DEFAULT 0')

            # Migration: Add display_order column to investment_accounts
            cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='investment_accounts'")
            if cursor.fetchone():
                cursor = conn.execute("PRAGMA table_info(investment_accounts)")
                columns = [row['name'] for row in cursor.fetchall()]
                if 'display_order' not in columns:
                    conn.execute('ALTER TABLE investment_accounts ADD COLUMN display_order INTEGER DEFAULT 0')

            # Migration: Add earnings_time column to earnings_cache
            cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='earnings_cache'")
            if cursor.fetchone():
                cursor = conn.execute("PRAGMA table_info(earnings_cache)")
                columns = [row['name'] for row in cursor.fetchall()]
                if 'earnings_time' not in columns:
                    conn.execute('ALTER TABLE earnings_cache ADD COLUMN earnings_time TEXT')
                    # Clear cache to force refresh with new FMP data
                    conn.execute('DELETE FROM earnings_cache')
                    print("[Database] Added earnings_time column to earnings_cache and cleared cache")

            # Run full schema
            with open(schema_path, 'r') as f:
                conn.executescript(f.read())
            conn.commit()
            print("[Database] SQLite schema initialized")
        finally:
            conn.close()


# ============= CACHE FUNCTIONS =============

def get_cached_stats(username, time_class):
    """
    Get cached stats for a player if they exist.
    Returns: (player_data, stats_data, last_archive, is_fresh) or (None, None, None, False)
    """
    username = username.lower()
    with get_db() as conn:
        cursor = conn.execute(
            '''SELECT player_data, stats_data, last_archive, updated_at
               FROM player_stats_cache
               WHERE username = ? AND time_class = ?''',
            (username, time_class)
        )
        row = cursor.fetchone()

        if not row:
            return None, None, None, False

        player_data = json.loads(row['player_data'])
        stats_data = json.loads(row['stats_data'])
        last_archive = row['last_archive']

        # Handle both string and datetime objects
        updated_at = row['updated_at']
        if isinstance(updated_at, str):
            updated_at = datetime.fromisoformat(updated_at)
        elif hasattr(updated_at, 'replace'):
            updated_at = updated_at.replace(tzinfo=None)

        is_fresh = datetime.now(timezone.utc).replace(tzinfo=None) - updated_at < timedelta(minutes=CACHE_MAX_AGE_MINUTES)

        return player_data, stats_data, last_archive, is_fresh


def _upsert_query(table, conflict_cols, update_cols, all_cols):
    """Generate an upsert query compatible with both SQLite and PostgreSQL."""
    placeholders = ', '.join(['?'] * len(all_cols))
    cols = ', '.join(all_cols)

    if USE_POSTGRES:
        conflict = ', '.join(conflict_cols)
        updates = ', '.join([f"{col} = EXCLUDED.{col}" for col in update_cols])
        return f'''INSERT INTO {table} ({cols}) VALUES ({placeholders})
                   ON CONFLICT ({conflict}) DO UPDATE SET {updates}'''
    else:
        updates = ', '.join([f"{col} = excluded.{col}" for col in update_cols])
        return f'''INSERT INTO {table} ({cols}) VALUES ({placeholders})
                   ON CONFLICT({', '.join(conflict_cols)}) DO UPDATE SET {updates}'''


def save_cached_stats(username, time_class, player_data, stats_data, last_archive):
    """Save or update cached stats for a player."""
    username = username.lower()
    now = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()

    with get_db() as conn:
        query = _upsert_query(
            'player_stats_cache',
            ['username', 'time_class'],
            ['player_data', 'stats_data', 'last_archive', 'updated_at'],
            ['username', 'time_class', 'player_data', 'stats_data', 'last_archive', 'updated_at']
        )
        conn.execute(query, (
            username, time_class,
            json.dumps(player_data), json.dumps(stats_data),
            last_archive, now
        ))


def get_all_cached_stats(username):
    """
    Get all cached stats for a player (all time classes).
    Returns: dict of {time_class: (stats_data, last_archive, is_fresh)} or empty dict
    """
    username = username.lower()
    result = {}
    with get_db() as conn:
        cursor = conn.execute(
            '''SELECT time_class, stats_data, last_archive, updated_at
               FROM player_stats_cache
               WHERE username = ?''',
            (username,)
        )
        rows = cursor.fetchall()

        for row in rows:
            stats_data = json.loads(row['stats_data'])
            last_archive = row['last_archive']

            updated_at = row['updated_at']
            if isinstance(updated_at, str):
                updated_at = datetime.fromisoformat(updated_at)
            elif hasattr(updated_at, 'replace'):
                updated_at = updated_at.replace(tzinfo=None)

            is_fresh = datetime.now(timezone.utc).replace(tzinfo=None) - updated_at < timedelta(minutes=CACHE_MAX_AGE_MINUTES)
            result[row['time_class']] = (stats_data, last_archive, is_fresh)

    return result


def save_all_cached_stats(username, player_data, all_stats_data, last_archive):
    """
    Save cached stats for all time classes at once.
    all_stats_data: dict of {time_class: stats_data}
    """
    username = username.lower()
    now = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()

    with get_db() as conn:
        query = _upsert_query(
            'player_stats_cache',
            ['username', 'time_class'],
            ['player_data', 'stats_data', 'last_archive', 'updated_at'],
            ['username', 'time_class', 'player_data', 'stats_data', 'last_archive', 'updated_at']
        )
        for time_class, stats_data in all_stats_data.items():
            conn.execute(query, (
                username, time_class,
                json.dumps(player_data), json.dumps(stats_data),
                last_archive, now
            ))


# ============= MONTHLY ARCHIVE CACHE =============

def get_cached_archives(username):
    """Get all cached monthly archives for a player.
    Returns: dict of {archive_url: games_json_string}
    """
    username = username.lower()
    with get_db() as conn:
        cursor = conn.execute(
            'SELECT archive_url, games_json FROM monthly_archive_cache WHERE username = ?',
            (username,)
        )
        return {row['archive_url']: row['games_json'] for row in cursor.fetchall()}


def save_cached_archive(username, archive_url, games_json):
    """Save or update a single month's archive cache."""
    username = username.lower()
    with get_db() as conn:
        query = _upsert_query(
            'monthly_archive_cache',
            ['username', 'archive_url'],
            ['games_json', 'fetched_at'],
            ['username', 'archive_url', 'games_json', 'fetched_at']
        )
        now = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
        conn.execute(query, (username, archive_url, games_json, now))
