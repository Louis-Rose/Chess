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
    # All historical migrations have been applied and folded into schema_postgres.sql.
    # New migrations go here temporarily, then get folded into the schema file
    # once they've run in production.
    pass
