"""Music sub-app — PUBLIC, read-only.

Serves the "memory trace" collected by the standalone `my-music` Spotify
tracker daemon (which writes the `music_*` tables). This blueprint only ever
reads, so it needs no auth: anyone hitting lumna.co/music sees the listening
dashboard.

One endpoint, GET /api/music/overview, returns everything the dashboard needs
in a single round-trip: headline stats, recently played, top tracks, top
artists, and a plays-per-day series for the activity chart.
"""

import logging

from flask import Blueprint, jsonify

from database import get_db

logger = logging.getLogger(__name__)

music_bp = Blueprint('music', __name__)

# How many rows each list returns. Kept modest so the payload stays small.
RECENT_LIMIT = 30
TOP_TRACKS_LIMIT = 12
TOP_ARTISTS_LIMIT = 12
ACTIVITY_DAYS = 30


def _tables_ready(conn) -> bool:
    """The daemon may not have initialised the schema yet on a fresh deploy."""
    return bool(conn.execute(
        "SELECT 1 FROM information_schema.tables WHERE table_name = 'music_plays'"
    ).fetchone())


@music_bp.route('/api/music/overview', methods=['GET'])
def music_overview():
    """Return the full dashboard dataset in one response."""
    with get_db() as conn:
        if not _tables_ready(conn):
            return jsonify(_empty_payload())

        stats = _fetch_stats(conn)
        recent = _fetch_recent(conn)
        top_tracks = _fetch_top_tracks(conn)
        top_artists = _fetch_top_artists(conn)
        activity = _fetch_activity(conn)

    return jsonify({
        'stats': stats,
        'recent': recent,
        'top_tracks': top_tracks,
        'top_artists': top_artists,
        'activity': activity,
    })


# ── Query helpers ────────────────────────────────────────────────────────────

def _fetch_stats(conn) -> dict:
    """Headline counters across the whole history."""
    row = conn.execute("""
        SELECT
            COUNT(*)                         AS total_plays,
            COUNT(DISTINCT track_id)         AS distinct_tracks,
            COALESCE(SUM(ms_played), 0)      AS total_ms_played,
            MIN(played_at)                   AS first_play,
            MAX(played_at)                   AS last_play
        FROM music_plays
    """).fetchone()

    distinct_artists = conn.execute("""
        SELECT COUNT(DISTINCT ta.artist_id) AS n
        FROM music_plays p
        JOIN music_track_artists ta ON ta.track_id = p.track_id
    """).fetchone()

    return {
        'total_plays': row['total_plays'],
        'distinct_tracks': row['distinct_tracks'],
        'distinct_artists': distinct_artists['n'],
        'total_ms_played': int(row['total_ms_played']),
        'first_play': _iso(row['first_play']),
        'last_play': _iso(row['last_play']),
    }


def _fetch_recent(conn) -> list:
    """Most recent plays, newest first."""
    rows = conn.execute(f"""
        SELECT
            p.id,
            p.played_at,
            p.ms_played,
            p.completion_pct,
            t.name                                   AS track_name,
            al.image_url                             AS image_url,
            string_agg(ar.name, ', ' ORDER BY ar.name) AS artists
        FROM music_plays p
        JOIN music_tracks t        ON t.id = p.track_id
        LEFT JOIN music_albums al  ON al.id = t.album_id
        LEFT JOIN music_track_artists ta ON ta.track_id = t.id
        LEFT JOIN music_artists ar ON ar.id = ta.artist_id
        GROUP BY p.id, t.name, al.image_url
        ORDER BY p.played_at DESC
        LIMIT {RECENT_LIMIT}
    """).fetchall()
    return [{
        'id': r['id'],
        'played_at': _iso(r['played_at']),
        'ms_played': r['ms_played'],
        'completion_pct': r['completion_pct'],
        'track_name': r['track_name'],
        'image_url': r['image_url'],
        'artists': r['artists'] or '',
    } for r in rows]


def _fetch_top_tracks(conn) -> list:
    """Most-played tracks by number of qualifying plays."""
    rows = conn.execute(f"""
        SELECT
            t.id,
            t.name                                   AS track_name,
            al.image_url                             AS image_url,
            string_agg(DISTINCT ar.name, ', ')       AS artists,
            COUNT(p.id)                              AS play_count
        FROM music_plays p
        JOIN music_tracks t        ON t.id = p.track_id
        LEFT JOIN music_albums al  ON al.id = t.album_id
        LEFT JOIN music_track_artists ta ON ta.track_id = t.id
        LEFT JOIN music_artists ar ON ar.id = ta.artist_id
        GROUP BY t.id, t.name, al.image_url
        ORDER BY play_count DESC, t.name ASC
        LIMIT {TOP_TRACKS_LIMIT}
    """).fetchall()
    return [{
        'id': r['id'],
        'track_name': r['track_name'],
        'image_url': r['image_url'],
        'artists': r['artists'] or '',
        'play_count': r['play_count'],
    } for r in rows]


def _fetch_top_artists(conn) -> list:
    """Most-played artists by number of qualifying plays."""
    rows = conn.execute(f"""
        SELECT
            ar.id,
            ar.name        AS artist_name,
            COUNT(p.id)    AS play_count
        FROM music_plays p
        JOIN music_track_artists ta ON ta.track_id = p.track_id
        JOIN music_artists ar       ON ar.id = ta.artist_id
        GROUP BY ar.id, ar.name
        ORDER BY play_count DESC, ar.name ASC
        LIMIT {TOP_ARTISTS_LIMIT}
    """).fetchall()
    return [{
        'id': r['id'],
        'artist_name': r['artist_name'],
        'play_count': r['play_count'],
    } for r in rows]


def _fetch_activity(conn) -> list:
    """Plays per day for the last ACTIVITY_DAYS days (ascending by date)."""
    rows = conn.execute(f"""
        SELECT
            to_char(date_trunc('day', played_at), 'YYYY-MM-DD') AS day,
            COUNT(*) AS play_count
        FROM music_plays
        WHERE played_at >= CURRENT_DATE - INTERVAL '{ACTIVITY_DAYS} days'
        GROUP BY day
        ORDER BY day ASC
    """).fetchall()
    return [{'day': r['day'], 'play_count': r['play_count']} for r in rows]


# ── Small utilities ──────────────────────────────────────────────────────────

def _iso(value):
    """Render a DB timestamp as an ISO8601 string (or None)."""
    if value is None:
        return None
    # psycopg2 returns datetime objects for TIMESTAMP columns.
    return value.isoformat() if hasattr(value, 'isoformat') else str(value)


def _empty_payload() -> dict:
    """Shape returned before any data exists, so the UI can render gracefully."""
    return {
        'stats': {
            'total_plays': 0,
            'distinct_tracks': 0,
            'distinct_artists': 0,
            'total_ms_played': 0,
            'first_play': None,
            'last_play': None,
        },
        'recent': [],
        'top_tracks': [],
        'top_artists': [],
        'activity': [],
    }
