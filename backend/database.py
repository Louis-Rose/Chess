"""
PostgreSQL database layer for LUMNA.

Environment variables:
- DB_HOST: PostgreSQL host (default: localhost)
- DB_PORT: PostgreSQL port (default: 5432)
- DB_NAME: Database name (default: lumna)
- DB_USER: Database user (default: lumna)
- DB_PASSWORD: Database password (required)
"""

import logging
import os
from contextlib import contextmanager

import psycopg2
from psycopg2.extras import RealDictCursor

logger = logging.getLogger(__name__)

# Database configuration
DB_HOST = os.environ.get('DB_HOST', 'localhost')
DB_PORT = os.environ.get('DB_PORT', '5432')
DB_NAME = os.environ.get('DB_NAME', 'lumna')
DB_USER = os.environ.get('DB_USER', 'lumna')
DB_PASSWORD = os.environ.get('DB_PASSWORD')

logger.info("Using PostgreSQL at %s:%s/%s", DB_HOST, DB_PORT, DB_NAME)


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


def _table_exists(conn, name: str) -> bool:
    return bool(conn.execute(
        "SELECT 1 FROM information_schema.tables WHERE table_name = %s", (name,)
    ).fetchone())


def _column_exists(conn, table: str, column: str) -> bool:
    return bool(conn.execute(
        "SELECT 1 FROM information_schema.columns WHERE table_name = %s AND column_name = %s",
        (table, column)
    ).fetchone())


def init_db():
    """Run pending migrations. Schema is created by schema_postgres.sql via Docker init."""
    # New migrations go here temporarily, then get folded into the schema file
    # once they've run in production.
    with get_db() as conn:
        # Migration: Create coach_profiles table
        if not _table_exists(conn, 'coach_profiles'):
            conn.execute("""
                CREATE TABLE coach_profiles (
                    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                    display_name TEXT,
                    city TEXT,
                    timezone TEXT,
                    currency TEXT,
                    lesson_rate REAL,
                    lesson_duration INTEGER DEFAULT 60,
                    chesscom_username TEXT,
                    lichess_username TEXT,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            logger.info("Created coach_profiles table")

        # Migration: Create coach_bundle_offers table
        if not _table_exists(conn, 'coach_bundle_offers'):
            conn.execute("""
                CREATE TABLE coach_bundle_offers (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    lessons INTEGER NOT NULL,
                    price REAL NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("CREATE INDEX idx_coach_bundle_offers_user ON coach_bundle_offers(user_id)")
            logger.info("Created coach_bundle_offers table")

        # Migration: Add role column to users
        if not _column_exists(conn, 'users', 'role'):
            conn.execute("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'coach'")
            logger.info("Added role column to users")

        # Migration: Add linked_user_id column to coach_students
        if not _column_exists(conn, 'coach_students', 'linked_user_id'):
            conn.execute("ALTER TABLE coach_students ADD COLUMN linked_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL")
            logger.info("Added linked_user_id column to coach_students")

        # Migration: Create student_invites table
        if not _table_exists(conn, 'student_invites'):
            conn.execute("""
                CREATE TABLE student_invites (
                    id SERIAL PRIMARY KEY,
                    coach_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    student_id INTEGER NOT NULL REFERENCES coach_students(id) ON DELETE CASCADE,
                    token TEXT UNIQUE NOT NULL,
                    accepted_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("CREATE INDEX idx_student_invites_token ON student_invites(token)")
            logger.info("Created student_invites table")

        # Migration: Create messages table
        if not _table_exists(conn, 'messages'):
            conn.execute("""
                CREATE TABLE messages (
                    id SERIAL PRIMARY KEY,
                    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    content TEXT NOT NULL,
                    read_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("CREATE INDEX idx_messages_sender ON messages(sender_id)")
            conn.execute("CREATE INDEX idx_messages_receiver ON messages(receiver_id)")
            conn.execute("CREATE INDEX idx_messages_conversation ON messages(sender_id, receiver_id, created_at)")
            logger.info("Created messages table")

        # Migration: Create invoices table
        if not _table_exists(conn, 'invoices'):
            conn.execute("""
                CREATE TABLE invoices (
                    id SERIAL PRIMARY KEY,
                    coach_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    student_id INTEGER NOT NULL REFERENCES coach_students(id) ON DELETE CASCADE,
                    message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
                    amount REAL NOT NULL,
                    currency TEXT NOT NULL,
                    description TEXT,
                    status TEXT DEFAULT 'pending',
                    paid_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("CREATE INDEX idx_invoices_student ON invoices(student_id)")
            conn.execute("CREATE INDEX idx_invoices_coach ON invoices(coach_user_id)")
            logger.info("Created invoices table")

        # Migration: Add invoice_id to messages
        if not _column_exists(conn, 'messages', 'invoice_id'):
            conn.execute("ALTER TABLE messages ADD COLUMN invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL")
            logger.info("Added invoice_id column to messages")

        # Migration: Add revolut_username to coach_profiles
        if not _column_exists(conn, 'coach_profiles', 'revolut_username'):
            conn.execute("ALTER TABLE coach_profiles ADD COLUMN revolut_username TEXT")
            logger.info("Added revolut_username column to coach_profiles")

        # Migration: Add notes column to coach_lessons
        if not _column_exists(conn, 'coach_lessons', 'notes'):
            conn.execute("ALTER TABLE coach_lessons ADD COLUMN notes TEXT")
            logger.info("Added notes column to coach_lessons")

        # Migration: Add meet_link to coach_lessons
        if not _column_exists(conn, 'coach_lessons', 'meet_link'):
            conn.execute("ALTER TABLE coach_lessons ADD COLUMN meet_link TEXT")
            logger.info("Added meet_link column to coach_lessons")

        # Migration: Add google_calendar_refresh_token to users
        if not _column_exists(conn, 'users', 'google_calendar_refresh_token'):
            conn.execute("ALTER TABLE users ADD COLUMN google_calendar_refresh_token TEXT")
            logger.info("Added google_calendar_refresh_token column to users")

        # Migration: Add email and phone_number to coach_profiles
        if not _column_exists(conn, 'coach_profiles', 'email'):
            conn.execute("ALTER TABLE coach_profiles ADD COLUMN email TEXT")
            logger.info("Added email column to coach_profiles")
        if not _column_exists(conn, 'coach_profiles', 'phone_number'):
            conn.execute("ALTER TABLE coach_profiles ADD COLUMN phone_number TEXT")
            logger.info("Added phone_number column to coach_profiles")

        # Migration: Add lichess_token to coach_profiles
        if not _column_exists(conn, 'coach_profiles', 'lichess_token'):
            conn.execute("ALTER TABLE coach_profiles ADD COLUMN lichess_token TEXT")
            logger.info("Added lichess_token column to coach_profiles")

        # Migration: Add email and phone_number to coach_students
        if not _column_exists(conn, 'coach_students', 'email'):
            conn.execute("ALTER TABLE coach_students ADD COLUMN email TEXT")
            logger.info("Added email column to coach_students")
        if not _column_exists(conn, 'coach_students', 'phone_number'):
            conn.execute("ALTER TABLE coach_students ADD COLUMN phone_number TEXT")
            logger.info("Added phone_number column to coach_students")

        # Migration: Add city column to coach_students
        if not _column_exists(conn, 'coach_students', 'city'):
            conn.execute("ALTER TABLE coach_students ADD COLUMN city TEXT")
            logger.info("Added city column to coach_students")

        # Migration: Add fide_arena_username column to coach_students
        if not _column_exists(conn, 'coach_students', 'fide_arena_username'):
            conn.execute("ALTER TABLE coach_students ADD COLUMN fide_arena_username TEXT")
            logger.info("Added fide_arena_username column to coach_students")

        # Migration: Add fide_arena_profile_url column to coach_students
        if not _column_exists(conn, 'coach_students', 'fide_arena_profile_url'):
            conn.execute("ALTER TABLE coach_students ADD COLUMN fide_arena_profile_url TEXT")
            logger.info("Added fide_arena_profile_url column to coach_students")

        # Migration: Knowledge Center — folders tree + saved positions
        if not _table_exists(conn, 'knowledge_folders'):
            conn.execute("""
                CREATE TABLE knowledge_folders (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    parent_id INTEGER REFERENCES knowledge_folders(id) ON DELETE CASCADE,
                    name TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("CREATE INDEX idx_knowledge_folders_user ON knowledge_folders(user_id)")
            conn.execute("CREATE INDEX idx_knowledge_folders_parent ON knowledge_folders(parent_id)")
            logger.info("Created knowledge_folders table")

        if not _table_exists(conn, 'knowledge_positions'):
            conn.execute("""
                CREATE TABLE knowledge_positions (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    folder_id INTEGER REFERENCES knowledge_folders(id) ON DELETE SET NULL,
                    fen TEXT NOT NULL,
                    white_player TEXT,
                    black_player TEXT,
                    active_color CHAR(1),
                    diagram_number INTEGER,
                    crop_data_url TEXT,
                    notes TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("CREATE INDEX idx_knowledge_positions_user ON knowledge_positions(user_id)")
            conn.execute("CREATE INDEX idx_knowledge_positions_folder ON knowledge_positions(folder_id)")
            logger.info("Created knowledge_positions table")
