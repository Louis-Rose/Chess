"""
PostgreSQL database layer for LUMNA.

Environment variables:
- DB_HOST: PostgreSQL host (default: localhost)
- DB_PORT: PostgreSQL port (default: 5432)
- DB_NAME: Database name (default: lumna)
- DB_USER: Database user (default: lumna)
- DB_PASSWORD: Database password (required)
"""

import os
from contextlib import contextmanager

import psycopg2
from psycopg2.extras import RealDictCursor

# Database configuration
DB_HOST = os.environ.get('DB_HOST', 'localhost')
DB_PORT = os.environ.get('DB_PORT', '5432')
DB_NAME = os.environ.get('DB_NAME', 'lumna')
DB_USER = os.environ.get('DB_USER', 'lumna')
DB_PASSWORD = os.environ.get('DB_PASSWORD')

print(f"[Database] Using PostgreSQL at {DB_HOST}:{DB_PORT}/{DB_NAME}")


def get_db_connection():
    """Get a PostgreSQL connection with dict-like row access."""
    return psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        cursor_factory=RealDictCursor
    )


@contextmanager
def get_db():
    """Context manager for database connections with auto-commit/rollback."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        yield _ConnectionWrapper(conn, cursor)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


class _ConnectionWrapper:
    """Wrapper that converts ? placeholders to %s for PostgreSQL."""

    def __init__(self, conn, cursor):
        self._conn = conn
        self._cursor = cursor

    def execute(self, query, params=None):
        pg_query = query.replace('?', '%s')
        if params:
            self._cursor.execute(pg_query, params)
        else:
            self._cursor.execute(pg_query)
        return self._cursor

    def executescript(self, script):
        self._cursor.execute(script)

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()


def init_db():
    """Run PostgreSQL migrations for any new columns/tables."""
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

        # Migration: Create coach_students table
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
