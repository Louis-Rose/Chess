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
    """Run pending migrations. Schema is created by schema_postgres.sql via Docker init."""
    # New migrations go here temporarily, then get folded into the schema file
    # once they've run in production.
    with get_db() as conn:
        # Migration: Create coach_profiles table
        conn.execute("SELECT table_name FROM information_schema.tables WHERE table_name = 'coach_profiles'")
        if not conn._cursor.fetchone():
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
            print("[Database] Created coach_profiles table")

        # Migration: Create coach_bundle_offers table
        conn.execute("SELECT table_name FROM information_schema.tables WHERE table_name = 'coach_bundle_offers'")
        if not conn._cursor.fetchone():
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
            print("[Database] Created coach_bundle_offers table")

        # Migration: Add role column to users
        conn.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'role'")
        if not conn._cursor.fetchone():
            conn.execute("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'coach'")
            print("[Database] Added role column to users")

        # Migration: Add linked_user_id column to coach_students
        conn.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'coach_students' AND column_name = 'linked_user_id'")
        if not conn._cursor.fetchone():
            conn.execute("ALTER TABLE coach_students ADD COLUMN linked_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL")
            print("[Database] Added linked_user_id column to coach_students")

        # Migration: Create student_invites table
        conn.execute("SELECT table_name FROM information_schema.tables WHERE table_name = 'student_invites'")
        if not conn._cursor.fetchone():
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
            print("[Database] Created student_invites table")

        # Migration: Create messages table
        conn.execute("SELECT table_name FROM information_schema.tables WHERE table_name = 'messages'")
        if not conn._cursor.fetchone():
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
            print("[Database] Created messages table")

        # Migration: Create invoices table
        conn.execute("SELECT table_name FROM information_schema.tables WHERE table_name = 'invoices'")
        if not conn._cursor.fetchone():
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
            print("[Database] Created invoices table")

        # Migration: Add invoice_id to messages
        conn.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'invoice_id'")
        if not conn._cursor.fetchone():
            conn.execute("ALTER TABLE messages ADD COLUMN invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL")
            print("[Database] Added invoice_id column to messages")

        # Migration: Add revolut_username to coach_profiles
        conn.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'coach_profiles' AND column_name = 'revolut_username'")
        if not conn._cursor.fetchone():
            conn.execute("ALTER TABLE coach_profiles ADD COLUMN revolut_username TEXT")
            print("[Database] Added revolut_username column to coach_profiles")

        # Migration: Add notes column to coach_lessons
        conn.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'coach_lessons' AND column_name = 'notes'")
        if not conn._cursor.fetchone():
            conn.execute("ALTER TABLE coach_lessons ADD COLUMN notes TEXT")
            print("[Database] Added notes column to coach_lessons")
