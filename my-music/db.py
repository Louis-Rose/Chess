"""
db.py — PostgreSQL storage layer for the tracker daemon.

The daemon writes into LUMNA's shared PostgreSQL database. The schema (the
`music_*` tables) is owned and created by the web backend (see
backend/schema_postgres.sql and database.py init_db) — this module is a pure
WRITER. Keeping a single source of truth for the DDL avoids the two processes
drifting out of sync.

    music_artists ──┐
                    ├──< music_track_artists >── music_tracks ──> music_albums
    music_plays ──────────────────────────────────────┘  (one row per listen)

All write helpers are idempotent "upserts" so re-seeing the same artist/album/
track never creates duplicates.
"""

from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator, Optional

import psycopg2
from psycopg2.extras import RealDictCursor

from config import DatabaseConfig


@contextmanager
def connect(db: DatabaseConfig) -> Iterator[psycopg2.extensions.connection]:
    """
    Yield a PostgreSQL connection, committing on success and rolling back on
    error. A fresh short-lived connection per poll keeps the daemon robust
    against the DB restarting underneath it.
    """
    conn = psycopg2.connect(cursor_factory=RealDictCursor, **db.dsn_kwargs())
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def schema_ready(db: DatabaseConfig) -> bool:
    """
    True once the web backend has created the music tables. The daemon waits
    for this rather than creating the tables itself, so the DDL lives in exactly
    one place.
    """
    with connect(db) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM information_schema.tables "
                "WHERE table_name = 'music_plays'"
            )
            return cur.fetchone() is not None


# ── Idempotent upserts for media metadata ────────────────────────────────────

def upsert_artist(cur, artist_id: str, name: str) -> None:
    """Insert an artist, or refresh its name if it already exists."""
    cur.execute(
        """
        INSERT INTO music_artists (id, name) VALUES (%s, %s)
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
        """,
        (artist_id, name),
    )


def upsert_album(
    cur,
    album_id: str,
    name: str,
    release_date: Optional[str],
    image_url: Optional[str],
) -> None:
    """Insert an album, or refresh its mutable fields if it already exists."""
    cur.execute(
        """
        INSERT INTO music_albums (id, name, release_date, image_url)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (id) DO UPDATE SET
            name         = EXCLUDED.name,
            release_date = EXCLUDED.release_date,
            image_url    = EXCLUDED.image_url
        """,
        (album_id, name, release_date, image_url),
    )


def upsert_track(
    cur,
    track_id: str,
    name: str,
    album_id: Optional[str],
    duration_ms: int,
) -> None:
    """Insert a track, or refresh its metadata if it already exists."""
    cur.execute(
        """
        INSERT INTO music_tracks (id, name, album_id, duration_ms)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (id) DO UPDATE SET
            name        = EXCLUDED.name,
            album_id    = EXCLUDED.album_id,
            duration_ms = EXCLUDED.duration_ms
        """,
        (track_id, name, album_id, duration_ms),
    )


def link_track_artist(cur, track_id: str, artist_id: str) -> None:
    """Record the track<->artist relationship, ignoring duplicates."""
    cur.execute(
        """
        INSERT INTO music_track_artists (track_id, artist_id) VALUES (%s, %s)
        ON CONFLICT (track_id, artist_id) DO NOTHING
        """,
        (track_id, artist_id),
    )


def insert_play(
    cur,
    track_id: str,
    played_at: str,
    ended_at: str,
    ms_played: int,
    completion_pct: float,
    committed_reason: str,
) -> int:
    """Append one row to the interaction log and return its new id."""
    cur.execute(
        """
        INSERT INTO music_plays
            (track_id, played_at, ended_at, ms_played, completion_pct,
             committed_reason)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (track_id, played_at, ended_at, ms_played, completion_pct,
         committed_reason),
    )
    return int(cur.fetchone()["id"])
