import sqlite3
import os
from contextlib import contextmanager

DATABASE_PATH = os.environ.get('DATABASE_PATH', 'chess_stats.db')


def get_db_connection():
    """Get a database connection with row factory."""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def get_db():
    """Context manager for database connections with auto-commit/rollback."""
    conn = get_db_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    """Initialize database with schema."""
    schema_path = os.path.join(os.path.dirname(__file__), 'schema.sql')
    with get_db() as conn:
        with open(schema_path, 'r') as f:
            conn.executescript(f.read())
