import sqlite3
import os
import json
from datetime import datetime, timedelta, timezone
from contextlib import contextmanager

_DEFAULT_DB = os.path.join(os.path.dirname(__file__), 'chess_stats.db')
DATABASE_PATH = os.environ.get('DATABASE_PATH', _DEFAULT_DB)
CACHE_MAX_AGE_MINUTES = 30


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
        updated_at = datetime.fromisoformat(row['updated_at'])

        is_fresh = datetime.now(timezone.utc).replace(tzinfo=None) - updated_at < timedelta(minutes=CACHE_MAX_AGE_MINUTES)

        return player_data, stats_data, last_archive, is_fresh


def save_cached_stats(username, time_class, player_data, stats_data, last_archive):
    """Save or update cached stats for a player."""
    username = username.lower()
    with get_db() as conn:
        conn.execute(
            '''INSERT INTO player_stats_cache (username, time_class, player_data, stats_data, last_archive, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(username, time_class) DO UPDATE SET
                   player_data = excluded.player_data,
                   stats_data = excluded.stats_data,
                   last_archive = excluded.last_archive,
                   updated_at = excluded.updated_at''',
            (username, time_class, json.dumps(player_data), json.dumps(stats_data), last_archive, datetime.now(timezone.utc).replace(tzinfo=None).isoformat())
        )


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
            updated_at = datetime.fromisoformat(row['updated_at'])
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
        for time_class, stats_data in all_stats_data.items():
            conn.execute(
                '''INSERT INTO player_stats_cache (username, time_class, player_data, stats_data, last_archive, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(username, time_class) DO UPDATE SET
                       player_data = excluded.player_data,
                       stats_data = excluded.stats_data,
                       last_archive = excluded.last_archive,
                       updated_at = excluded.updated_at''',
                (username, time_class, json.dumps(player_data), json.dumps(stats_data), last_archive, now)
            )
