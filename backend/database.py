"""
Database abstraction layer supporting both SQLite (development) and PostgreSQL (production).

Environment variables for PostgreSQL:
- DB_HOST: PostgreSQL host (default: localhost)
- DB_PORT: PostgreSQL port (default: 5432)
- DB_NAME: Database name (default: lumna)
- DB_USER: Database user (default: lumna)
- DB_PASSWORD: Database password (required for PostgreSQL)

If DB_PASSWORD is not set, falls back to SQLite using DATABASE_PATH or default lumna.db
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
_DEFAULT_DB = os.path.join(os.path.dirname(__file__), 'lumna.db')
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

            # Migration: Create chess_user_prefs table if not exists
            conn.execute("""
                SELECT table_name FROM information_schema.tables
                WHERE table_name = 'chess_user_prefs'
            """)
            if not conn._cursor.fetchone():
                conn.execute("""
                    CREATE TABLE chess_user_prefs (
                        username TEXT PRIMARY KEY,
                        onboarding_done INTEGER NOT NULL DEFAULT 0,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                print("[Database] Created chess_user_prefs table")

            # Migration: Add preferred_time_class column to chess_user_prefs
            conn.execute("""
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'chess_user_prefs' AND column_name = 'preferred_time_class'
            """)
            if not conn._cursor.fetchone():
                conn.execute("ALTER TABLE chess_user_prefs ADD COLUMN preferred_time_class TEXT DEFAULT NULL")
                print("[Database] Added preferred_time_class column to chess_user_prefs")

            # Migration: Add fide_id column to chess_user_prefs
            conn.execute("""
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'chess_user_prefs' AND column_name = 'fide_id'
            """)
            if not conn._cursor.fetchone():
                conn.execute("ALTER TABLE chess_user_prefs ADD COLUMN fide_id TEXT DEFAULT NULL")
                print("[Database] Added fide_id column to chess_user_prefs")

            # Migration: Add leaderboard_name column to chess_user_prefs
            conn.execute("""
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'chess_user_prefs' AND column_name = 'leaderboard_name'
            """)
            if not conn._cursor.fetchone():
                conn.execute("ALTER TABLE chess_user_prefs ADD COLUMN leaderboard_name TEXT DEFAULT NULL")
                print("[Database] Added leaderboard_name column to chess_user_prefs")

            # Migration: Create chess_goals table if not exists
            conn.execute("""
                SELECT table_name FROM information_schema.tables
                WHERE table_name = 'chess_goals'
            """)
            if not conn._cursor.fetchone():
                conn.execute("""
                    CREATE TABLE chess_goals (
                        username TEXT NOT NULL,
                        time_class TEXT NOT NULL,
                        elo_goal INTEGER NOT NULL,
                        elo_goal_start_elo INTEGER NOT NULL,
                        elo_goal_start_date TEXT NOT NULL,
                        elo_goal_months INTEGER NOT NULL DEFAULT 3,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        PRIMARY KEY (username, time_class)
                    )
                """)
                print("[Database] Created chess_goals table")

            # Migration: Create chess_fide_friends table if not exists
            conn.execute("""
                SELECT table_name FROM information_schema.tables
                WHERE table_name = 'chess_fide_friends'
            """)
            if not conn._cursor.fetchone():
                conn.execute("""
                    CREATE TABLE chess_fide_friends (
                        username TEXT NOT NULL,
                        fide_id TEXT NOT NULL,
                        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        PRIMARY KEY (username, fide_id)
                    )
                """)
                print("[Database] Created chess_fide_friends table")

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

            # Migration: Recreate coach tables with simplified scheduling schema
            conn.execute("""
                SELECT table_name FROM information_schema.tables
                WHERE table_name = 'coach_students'
            """)
            if not conn._cursor.fetchone():
                conn.execute("""
                    CREATE TABLE coach_students (
                        id SERIAL PRIMARY KEY,
                        coach_user_id INTEGER NOT NULL,
                        student_name TEXT NOT NULL,
                        timezone TEXT DEFAULT 'UTC',
                        recurring_day INTEGER,
                        recurring_time TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                conn.execute("CREATE INDEX idx_coach_students_coach ON coach_students(coach_user_id)")
                print("[Database] Created coach_students table")
            else:
                # Add recurring columns if missing
                conn.execute("""
                    SELECT column_name FROM information_schema.columns
                    WHERE table_name = 'coach_students' AND column_name = 'recurring_day'
                """)
                if not conn._cursor.fetchone():
                    conn.execute("ALTER TABLE coach_students ADD COLUMN recurring_day INTEGER")
                    conn.execute("ALTER TABLE coach_students ADD COLUMN recurring_time TEXT")
                    print("[Database] Added recurring_day/recurring_time to coach_students")
                # Add currency column if missing
                conn.execute("""
                    SELECT column_name FROM information_schema.columns
                    WHERE table_name = 'coach_students' AND column_name = 'currency'
                """)
                if not conn._cursor.fetchone():
                    conn.execute("ALTER TABLE coach_students ADD COLUMN currency TEXT")
                    print("[Database] Added currency column to coach_students")
                # Add source column if missing
                conn.execute("""
                    SELECT column_name FROM information_schema.columns
                    WHERE table_name = 'coach_students' AND column_name = 'source'
                """)
                if not conn._cursor.fetchone():
                    conn.execute("ALTER TABLE coach_students ADD COLUMN source TEXT")
                    print("[Database] Added source column to coach_students")
                # Add chesscom_username / lichess_username columns if missing
                conn.execute("""
                    SELECT column_name FROM information_schema.columns
                    WHERE table_name = 'coach_students' AND column_name = 'chesscom_username'
                """)
                if not conn._cursor.fetchone():
                    conn.execute("ALTER TABLE coach_students ADD COLUMN chesscom_username TEXT")
                    print("[Database] Added chesscom_username column to coach_students")
                conn.execute("""
                    SELECT column_name FROM information_schema.columns
                    WHERE table_name = 'coach_students' AND column_name = 'lichess_username'
                """)
                if not conn._cursor.fetchone():
                    conn.execute("ALTER TABLE coach_students ADD COLUMN lichess_username TEXT")
                    print("[Database] Added lichess_username column to coach_students")
                # Migrate old chess_username to chesscom_username if it exists
                conn.execute("""
                    SELECT column_name FROM information_schema.columns
                    WHERE table_name = 'coach_students' AND column_name = 'chess_username'
                """)
                if conn._cursor.fetchone():
                    conn.execute("UPDATE coach_students SET chesscom_username = chess_username WHERE chess_username IS NOT NULL AND chesscom_username IS NULL")
                    conn.execute("ALTER TABLE coach_students DROP COLUMN chess_username")
                    print("[Database] Migrated chess_username -> chesscom_username")
                # Relax old NOT NULL constraints so new simplified INSERT works
                conn.execute("""
                    SELECT column_name, is_nullable FROM information_schema.columns
                    WHERE table_name = 'coach_students' AND column_name = 'coach_username' AND is_nullable = 'NO'
                """)
                if conn._cursor.fetchone():
                    conn.execute("ALTER TABLE coach_students ALTER COLUMN coach_username DROP NOT NULL")
                    print("[Database] Relaxed coach_username NOT NULL constraint")
                # Drop dead is_active column if it exists
                conn.execute("""
                    SELECT column_name FROM information_schema.columns
                    WHERE table_name = 'coach_students' AND column_name = 'is_active'
                """)
                if conn._cursor.fetchone():
                    conn.execute("ALTER TABLE coach_students DROP COLUMN is_active")
                    print("[Database] Dropped is_active column from coach_students")

            conn.execute("""
                SELECT table_name FROM information_schema.tables
                WHERE table_name = 'coach_lessons'
            """)
            if not conn._cursor.fetchone():
                conn.execute("""
                    CREATE TABLE coach_lessons (
                        id SERIAL PRIMARY KEY,
                        student_id INTEGER NOT NULL REFERENCES coach_students(id) ON DELETE CASCADE,
                        scheduled_at TIMESTAMP NOT NULL,
                        duration_minutes INTEGER DEFAULT 60,
                        status TEXT DEFAULT 'scheduled',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                conn.execute("CREATE INDEX idx_coach_lessons_student ON coach_lessons(student_id)")
                conn.execute("CREATE INDEX idx_coach_lessons_scheduled ON coach_lessons(scheduled_at)")
                print("[Database] Created coach_lessons table")

            # Migration: Add paid column to coach_lessons if missing
            conn.execute("""
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'coach_lessons' AND column_name = 'paid'
            """)
            if not conn._cursor.fetchone():
                conn.execute("ALTER TABLE coach_lessons ADD COLUMN paid INTEGER DEFAULT 0")
                print("[Database] Added paid column to coach_lessons")

            # Migration: Create coach_packs table if not exists
            conn.execute("""
                SELECT table_name FROM information_schema.tables
                WHERE table_name = 'coach_packs'
            """)
            if not conn._cursor.fetchone():
                conn.execute("""
                    CREATE TABLE coach_packs (
                        id SERIAL PRIMARY KEY,
                        student_id INTEGER NOT NULL REFERENCES coach_students(id) ON DELETE CASCADE,
                        total_lessons INTEGER NOT NULL,
                        price REAL,
                        currency TEXT,
                        source TEXT,
                        note TEXT,
                        status TEXT DEFAULT 'active',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                conn.execute("CREATE INDEX idx_coach_packs_student ON coach_packs(student_id)")
                print("[Database] Created coach_packs table")

            # Migration: Add lessons_done/lessons_paid columns to coach_packs if missing
            conn.execute("""
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'coach_packs' AND column_name = 'lessons_done'
            """)
            if not conn._cursor.fetchone():
                conn.execute("ALTER TABLE coach_packs ADD COLUMN lessons_done INTEGER DEFAULT 0")
                conn.execute("ALTER TABLE coach_packs ADD COLUMN lessons_paid INTEGER DEFAULT 0")
                print("[Database] Added lessons_done/lessons_paid columns to coach_packs")

            # Migration: Add pack_id column to coach_lessons if missing
            conn.execute("""
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'coach_lessons' AND column_name = 'pack_id'
            """)
            if not conn._cursor.fetchone():
                conn.execute("ALTER TABLE coach_lessons ADD COLUMN pack_id INTEGER REFERENCES coach_packs(id) ON DELETE SET NULL")
                conn.execute("CREATE INDEX idx_coach_lessons_pack ON coach_lessons(pack_id)")
                print("[Database] Added pack_id column to coach_lessons")

            # Migration: Add registered_app column to users if not exists
            conn.execute("""
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'users' AND column_name = 'registered_app'
            """)
            if not conn._cursor.fetchone():
                conn.execute("ALTER TABLE users ADD COLUMN registered_app TEXT")
                print("[Database] Added registered_app column to users")

            # Migration: Create api_usage table if not exists
            conn.execute("""
                SELECT table_name FROM information_schema.tables
                WHERE table_name = 'api_usage'
            """)
            if not conn._cursor.fetchone():
                conn.execute("""
                    CREATE TABLE api_usage (
                        id SERIAL PRIMARY KEY,
                        user_id INTEGER,
                        feature TEXT NOT NULL,
                        model_id TEXT NOT NULL,
                        input_tokens INTEGER DEFAULT 0,
                        output_tokens INTEGER DEFAULT 0,
                        elapsed_seconds INTEGER DEFAULT 0,
                        error TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                conn.execute("CREATE INDEX idx_api_usage_created ON api_usage(created_at)")
                conn.execute("CREATE INDEX idx_api_usage_feature ON api_usage(feature)")
                print("[Database] Created api_usage table")
            else:
                # Migration: Add request_id column if missing
                conn.execute("""
                    SELECT column_name FROM information_schema.columns
                    WHERE table_name = 'api_usage' AND column_name = 'request_id'
                """)
                if not conn._cursor.fetchone():
                    conn.execute("ALTER TABLE api_usage ADD COLUMN request_id TEXT")
                    print("[Database] Added request_id column to api_usage")
                # Migration: Add thinking_tokens column if missing
                conn.execute("""
                    SELECT column_name FROM information_schema.columns
                    WHERE table_name = 'api_usage' AND column_name = 'thinking_tokens'
                """)
                if not conn._cursor.fetchone():
                    conn.execute("ALTER TABLE api_usage ADD COLUMN thinking_tokens INTEGER DEFAULT 0")
                    print("[Database] Added thinking_tokens column to api_usage")
                # Migration: Add billing_tier column if missing
                conn.execute("""
                    SELECT column_name FROM information_schema.columns
                    WHERE table_name = 'api_usage' AND column_name = 'billing_tier'
                """)
                if not conn._cursor.fetchone():
                    conn.execute("ALTER TABLE api_usage ADD COLUMN billing_tier TEXT DEFAULT 'paid'")
                    print("[Database] Added billing_tier column to api_usage")
                # Migration: Add retry columns if missing
                conn.execute("""
                    SELECT column_name FROM information_schema.columns
                    WHERE table_name = 'api_usage' AND column_name = 'retry_free_error'
                """)
                if not conn._cursor.fetchone():
                    conn.execute("ALTER TABLE api_usage ADD COLUMN retry_free_error TEXT")
                    conn.execute("ALTER TABLE api_usage ADD COLUMN retry_free_elapsed INTEGER")
                    print("[Database] Added retry columns to api_usage")

            # Migration: Create page_daily_activity table if not exists
            conn.execute("""
                SELECT table_name FROM information_schema.tables
                WHERE table_name = 'page_daily_activity'
            """)
            if not conn._cursor.fetchone():
                conn.execute("""
                    CREATE TABLE page_daily_activity (
                        id SERIAL PRIMARY KEY,
                        user_id INTEGER NOT NULL,
                        activity_date TEXT NOT NULL,
                        page TEXT NOT NULL,
                        seconds INTEGER DEFAULT 0,
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                        UNIQUE(user_id, activity_date, page)
                    )
                """)
                conn.execute("CREATE INDEX idx_page_daily_activity_date ON page_daily_activity(activity_date)")
                conn.execute("CREATE INDEX idx_page_daily_activity_user ON page_daily_activity(user_id)")
                print("[Database] Created page_daily_activity table")

            # Migration: Add coaches_chess_username and lichess_username to user_preferences
            conn.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'user_preferences' AND column_name = 'coaches_chess_username'")
            if not conn._cursor.fetchone():
                conn.execute("ALTER TABLE user_preferences ADD COLUMN coaches_chess_username TEXT")
                conn.execute("ALTER TABLE user_preferences ADD COLUMN lichess_username TEXT")
                print("[Database] Added coaches_chess_username and lichess_username to user_preferences")

            # Migration: Tag admin account as coaches app user
            conn.execute("UPDATE users SET registered_app = 'coaches' WHERE email = 'rose.louis.mail@gmail.com' AND registered_app IS NULL")


    else:
        # SQLite: run migrations and schema
        schema_path = os.path.join(os.path.dirname(__file__), 'schema.sql')
        conn = sqlite3.connect(DATABASE_PATH)
        conn.row_factory = _sqlite_dict_factory
        try:
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

            # Migration: Add fide_id and leaderboard_name columns to chess_user_prefs (SQLite)
            cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='chess_user_prefs'")
            if cursor.fetchone():
                cursor = conn.execute("PRAGMA table_info(chess_user_prefs)")
                columns = [row['name'] for row in cursor.fetchall()]
                if 'fide_id' not in columns:
                    conn.execute('ALTER TABLE chess_user_prefs ADD COLUMN fide_id TEXT DEFAULT NULL')
                    print("[Database] Added fide_id column to chess_user_prefs")
                if 'leaderboard_name' not in columns:
                    conn.execute('ALTER TABLE chess_user_prefs ADD COLUMN leaderboard_name TEXT DEFAULT NULL')
                    print("[Database] Added leaderboard_name column to chess_user_prefs")

            # Migration: Recreate coach tables with simplified scheduling schema
            cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='coach_students'")
            if cursor.fetchone():
                cursor = conn.execute("PRAGMA table_info(coach_students)")
                columns = [row['name'] for row in cursor.fetchall()]
                if 'recurring_day' not in columns:
                    # Drop old tables and let schema.sql recreate with new schema
                    conn.execute('DROP TABLE IF EXISTS coach_lessons')
                    conn.execute('DROP TABLE IF EXISTS coach_lesson_bundles')
                    conn.execute('DROP TABLE IF EXISTS coach_students')
                    print("[Database] Recreated coach tables with scheduling schema")

            # Migration: Add paid column to coach_lessons if missing (SQLite)
            cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='coach_lessons'")
            if cursor.fetchone():
                cursor = conn.execute("PRAGMA table_info(coach_lessons)")
                columns = [row['name'] for row in cursor.fetchall()]
                if 'paid' not in columns:
                    conn.execute('ALTER TABLE coach_lessons ADD COLUMN paid INTEGER DEFAULT 0')
                    print("[Database] Added paid column to coach_lessons")

            # Migration: Add currency column to coach_students if missing (SQLite)
            cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='coach_students'")
            if cursor.fetchone():
                cursor = conn.execute("PRAGMA table_info(coach_students)")
                columns = [row['name'] for row in cursor.fetchall()]
                if 'currency' not in columns:
                    conn.execute('ALTER TABLE coach_students ADD COLUMN currency TEXT')
                    print("[Database] Added currency column to coach_students")
                if 'source' not in columns:
                    conn.execute('ALTER TABLE coach_students ADD COLUMN source TEXT')
                    print("[Database] Added source column to coach_students")
                if 'chesscom_username' not in columns:
                    conn.execute('ALTER TABLE coach_students ADD COLUMN chesscom_username TEXT')
                    print("[Database] Added chesscom_username column to coach_students")
                if 'lichess_username' not in columns:
                    conn.execute('ALTER TABLE coach_students ADD COLUMN lichess_username TEXT')
                    print("[Database] Added lichess_username column to coach_students")

            # Migration: Add pack_id column to coach_lessons if missing (SQLite)
            cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='coach_lessons'")
            if cursor.fetchone():
                cursor = conn.execute("PRAGMA table_info(coach_lessons)")
                columns = [row['name'] for row in cursor.fetchall()]
                if 'pack_id' not in columns:
                    conn.execute('ALTER TABLE coach_lessons ADD COLUMN pack_id INTEGER REFERENCES coach_packs(id)')
                    print("[Database] Added pack_id column to coach_lessons")

            # Migration: Add lessons_done/lessons_paid columns to coach_packs if missing (SQLite)
            cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='coach_packs'")
            if cursor.fetchone():
                cursor = conn.execute("PRAGMA table_info(coach_packs)")
                columns = [row['name'] for row in cursor.fetchall()]
                if 'lessons_done' not in columns:
                    conn.execute('ALTER TABLE coach_packs ADD COLUMN lessons_done INTEGER DEFAULT 0')
                    conn.execute('ALTER TABLE coach_packs ADD COLUMN lessons_paid INTEGER DEFAULT 0')
                    print("[Database] Added lessons_done/lessons_paid columns to coach_packs")

            # Migration: Add registered_app column to users if not exists
            cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
            if cursor.fetchone():
                cursor = conn.execute("PRAGMA table_info(users)")
                columns = [row['name'] for row in cursor.fetchall()]
                if 'registered_app' not in columns:
                    conn.execute('ALTER TABLE users ADD COLUMN registered_app TEXT')
                    print("[Database] Added registered_app column to users")

            # Migration: Add coaches_chess_username and lichess_username to user_preferences
            cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='user_preferences'")
            if cursor.fetchone():
                cursor = conn.execute("PRAGMA table_info(user_preferences)")
                columns = [row['name'] for row in cursor.fetchall()]
                if 'coaches_chess_username' not in columns:
                    conn.execute('ALTER TABLE user_preferences ADD COLUMN coaches_chess_username TEXT')
                    conn.execute('ALTER TABLE user_preferences ADD COLUMN lichess_username TEXT')
                    print("[Database] Added coaches_chess_username and lichess_username to user_preferences")

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
