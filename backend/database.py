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

        # Migration: Add position_id for homework (a coach sending a saved position to a student)
        if not _column_exists(conn, 'messages', 'position_id'):
            conn.execute("ALTER TABLE messages ADD COLUMN position_id INTEGER REFERENCES knowledge_positions(id) ON DELETE SET NULL")
            logger.info("Added position_id column to messages")
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

        # Migration: Add deleted_at for soft-delete (undoable lesson deletion)
        if not _column_exists(conn, 'coach_lessons', 'deleted_at'):
            conn.execute("ALTER TABLE coach_lessons ADD COLUMN deleted_at TIMESTAMP")
            logger.info("Added deleted_at column to coach_lessons")

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

        # Migration: Gym sub-app — flat set log synced from Notion
        if not _table_exists(conn, 'gym_sets'):
            conn.execute("""
                CREATE TABLE gym_sets (
                    id SERIAL PRIMARY KEY,
                    session_date DATE NOT NULL,
                    muscle_group TEXT NOT NULL,
                    exercise TEXT NOT NULL,
                    reps INTEGER,
                    weight_kg REAL,
                    raw_line TEXT,
                    is_warmup BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("CREATE INDEX idx_gym_sets_exercise ON gym_sets(exercise)")
            conn.execute("CREATE INDEX idx_gym_sets_date ON gym_sets(session_date)")
            logger.info("Created gym_sets table")

        if not _table_exists(conn, 'gym_ignored_exercises'):
            conn.execute("""
                CREATE TABLE gym_ignored_exercises (
                    exercise TEXT PRIMARY KEY,
                    state TEXT NOT NULL DEFAULT 'archived',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            logger.info("Created gym_ignored_exercises table")

        if not _column_exists(conn, 'gym_ignored_exercises', 'state'):
            conn.execute("ALTER TABLE gym_ignored_exercises ADD COLUMN state TEXT NOT NULL DEFAULT 'archived'")
            logger.info("Added state column to gym_ignored_exercises")

        if not _table_exists(conn, 'gym_sync_meta'):
            conn.execute("""
                CREATE TABLE gym_sync_meta (
                    id INTEGER PRIMARY KEY,
                    last_synced_at TIMESTAMP,
                    last_status TEXT
                )
            """)
            logger.info("Created gym_sync_meta table")

        # Migration: Fit sub-app — per-user training profile (one row per user)
        if not _table_exists(conn, 'fit_profile'):
            conn.execute("""
                CREATE TABLE fit_profile (
                    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                    split TEXT,
                    work_sets INTEGER,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            logger.info("Created fit_profile table")

        # Migration: fit_profile — working sets per exercise (2..6)
        if not _column_exists(conn, 'fit_profile', 'work_sets'):
            conn.execute("ALTER TABLE fit_profile ADD COLUMN work_sets INTEGER")
            logger.info("Added fit_profile.work_sets column")

        # Migration: Fit sub-app — selected exercises per muscle group, per user
        if not _table_exists(conn, 'fit_exercises'):
            conn.execute("""
                CREATE TABLE fit_exercises (
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    muscle TEXT NOT NULL,
                    exercise TEXT NOT NULL,
                    PRIMARY KEY (user_id, muscle, exercise)
                )
            """)
            logger.info("Created fit_exercises table")

        # Migration: Fit sub-app — workout sessions and their logged sets
        if not _table_exists(conn, 'fit_sessions'):
            conn.execute("""
                CREATE TABLE fit_sessions (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    ended_at TIMESTAMP
                )
            """)
            logger.info("Created fit_sessions table")

        if not _table_exists(conn, 'fit_session_sets'):
            conn.execute("""
                CREATE TABLE fit_session_sets (
                    id SERIAL PRIMARY KEY,
                    session_id INTEGER NOT NULL REFERENCES fit_sessions(id) ON DELETE CASCADE,
                    exercise TEXT NOT NULL,
                    weight REAL,
                    reps INTEGER NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            logger.info("Created fit_session_sets table")

        # Migration: fit_session_sets — mark warmup sets (vs working sets)
        if not _column_exists(conn, 'fit_session_sets', 'warmup'):
            conn.execute("ALTER TABLE fit_session_sets ADD COLUMN warmup BOOLEAN NOT NULL DEFAULT FALSE")
            logger.info("Added fit_session_sets.warmup column")

        # Migration: fit_sessions — optional free-text comment on a session
        if not _column_exists(conn, 'fit_sessions', 'comment'):
            conn.execute("ALTER TABLE fit_sessions ADD COLUMN comment TEXT")
            logger.info("Added fit_sessions.comment column")

        # Migration: per-user working weight per exercise, persisted across
        # sessions (pre-fills new working sets, stays editable).
        if not _table_exists(conn, 'fit_work_weights'):
            conn.execute("""
                CREATE TABLE fit_work_weights (
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    exercise TEXT NOT NULL,
                    weight REAL NOT NULL,
                    PRIMARY KEY (user_id, exercise)
                )
            """)
            logger.info("Created fit_work_weights table")

        # Migration: per-user machine setting per exercise (base name), an
        # editable free-text override of the catalogue default.
        if not _table_exists(conn, 'fit_exercise_settings'):
            conn.execute("""
                CREATE TABLE fit_exercise_settings (
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    exercise TEXT NOT NULL,
                    setting TEXT NOT NULL,
                    PRIMARY KEY (user_id, exercise)
                )
            """)
            logger.info("Created fit_exercise_settings table")

        # Migration: per-exercise free-text note within a session, captured when
        # the exercise is validated (one note per exercise per session).
        if not _table_exists(conn, 'fit_session_exercise_notes'):
            conn.execute("""
                CREATE TABLE fit_session_exercise_notes (
                    session_id INTEGER NOT NULL REFERENCES fit_sessions(id) ON DELETE CASCADE,
                    exercise TEXT NOT NULL,
                    note TEXT NOT NULL,
                    PRIMARY KEY (session_id, exercise)
                )
            """)
            logger.info("Created fit_session_exercise_notes table")

        # One-off backfill: an in-progress session is now one with ended_at IS NULL
        # (the Calendrier and stats only count finished sessions). Existing
        # sessions that already have logged sets predate that rule and were
        # effectively "saved", so finalize them once. Guarded by fit_migrations
        # so it never re-fires and finalizes a genuinely in-progress session.
        if not _table_exists(conn, 'fit_migrations'):
            conn.execute("CREATE TABLE fit_migrations (name TEXT PRIMARY KEY)")
            logger.info("Created fit_migrations table")
        if not conn.execute("SELECT 1 FROM fit_migrations WHERE name = ?", ('finalize_legacy_sessions',)).fetchone():
            conn.execute(
                """UPDATE fit_sessions SET ended_at = started_at
                   WHERE ended_at IS NULL
                     AND EXISTS (SELECT 1 FROM fit_session_sets ss WHERE ss.session_id = fit_sessions.id)"""
            )
            conn.execute("INSERT INTO fit_migrations (name) VALUES (?)", ('finalize_legacy_sessions',))
            logger.info("Finalized legacy in-progress fit sessions that had sets")

        # One-off seed: give each exercise its first working weight from the most
        # recent finished session where every working set was at the same weight.
        # Runs once (guarded); afterwards the persisted value is the only source.
        if not conn.execute("SELECT 1 FROM fit_migrations WHERE name = ?", ('seed_work_weights',)).fetchone():
            conn.execute("""
                WITH last_session AS (
                    SELECT DISTINCT ON (s.user_id, ss.exercise)
                           s.user_id, ss.exercise, ss.session_id
                    FROM fit_session_sets ss
                    JOIN fit_sessions s ON s.id = ss.session_id
                    WHERE s.ended_at IS NOT NULL
                    ORDER BY s.user_id, ss.exercise, s.started_at DESC
                ),
                agg AS (
                    SELECT ls.user_id, ls.exercise,
                           COUNT(*) FILTER (WHERE ss.warmup = FALSE) AS work_count,
                           COUNT(*) FILTER (WHERE ss.warmup = FALSE AND ss.weight IS NOT NULL) AS weighted_count,
                           COUNT(DISTINCT ss.weight) FILTER (WHERE ss.warmup = FALSE) AS distinct_weights,
                           MAX(ss.weight) FILTER (WHERE ss.warmup = FALSE) AS weight
                    FROM last_session ls
                    JOIN fit_session_sets ss
                      ON ss.session_id = ls.session_id AND ss.exercise = ls.exercise
                    GROUP BY ls.user_id, ls.exercise
                )
                INSERT INTO fit_work_weights (user_id, exercise, weight)
                SELECT user_id, exercise, weight FROM agg
                WHERE work_count >= 1 AND weighted_count = work_count AND distinct_weights = 1
                ON CONFLICT (user_id, exercise) DO NOTHING
            """)
            conn.execute("INSERT INTO fit_migrations (name) VALUES (?)", ('seed_work_weights',))
            logger.info("Seeded initial fit working weights from uniform-weight history")

        # Reseed: the first seed only looked at each exercise's most recent
        # finished session. Walk back through all finished sessions instead and
        # take the most recent one whose working sets were uniform (every set
        # weighted and at the same weight). This both fills exercises whose last
        # session wasn't uniform and keeps stored values aligned with history.
        # Going forward, finish_session refreshes this on every validated session.
        if not conn.execute("SELECT 1 FROM fit_migrations WHERE name = ?", ('reseed_work_weights_walkback',)).fetchone():
            conn.execute("""
                WITH per_session AS (
                    SELECT s.user_id, ss.exercise, s.id AS session_id, s.started_at,
                           COUNT(*) FILTER (WHERE ss.warmup = FALSE) AS work_count,
                           COUNT(*) FILTER (WHERE ss.warmup = FALSE AND ss.weight IS NOT NULL) AS weighted_count,
                           COUNT(DISTINCT ss.weight) FILTER (WHERE ss.warmup = FALSE) AS distinct_weights,
                           MAX(ss.weight) FILTER (WHERE ss.warmup = FALSE) AS weight
                    FROM fit_sessions s
                    JOIN fit_session_sets ss ON ss.session_id = s.id
                    WHERE s.ended_at IS NOT NULL
                    GROUP BY s.user_id, ss.exercise, s.id, s.started_at
                ),
                qualifying AS (
                    SELECT user_id, exercise, weight, started_at
                    FROM per_session
                    WHERE work_count >= 1 AND weighted_count = work_count AND distinct_weights = 1
                ),
                latest AS (
                    SELECT DISTINCT ON (user_id, exercise) user_id, exercise, weight
                    FROM qualifying
                    ORDER BY user_id, exercise, started_at DESC
                )
                INSERT INTO fit_work_weights (user_id, exercise, weight)
                SELECT user_id, exercise, weight FROM latest
                ON CONFLICT (user_id, exercise) DO UPDATE SET weight = EXCLUDED.weight
            """)
            conn.execute("INSERT INTO fit_migrations (name) VALUES (?)", ('reseed_work_weights_walkback',))
            logger.info("Reseeded fit working weights via walk-back over all finished sessions")

        # One-off: "Développé couché/incliné barre|haltères" became a single
        # exercise with a Barre/Haltères variant. Rename existing data to the new
        # variant leaves so history, selections and working weights carry over.
        if not conn.execute("SELECT 1 FROM fit_migrations WHERE name = ?", ('rename_dc_di_variants',)).fetchone():
            renames = [
                ('Développé couché barre', 'Développé couché — Barre'),
                ('Développé couché haltères', 'Développé couché — Haltères'),
                ('Développé incliné barre', 'Développé incliné — Barre'),
                ('Développé incliné haltères', 'Développé incliné — Haltères'),
            ]
            for old, new in renames:
                conn.execute('UPDATE fit_session_sets SET exercise = ? WHERE exercise = ?', (new, old))
                conn.execute('UPDATE fit_exercises SET exercise = ? WHERE exercise = ?', (new, old))
                conn.execute('UPDATE fit_work_weights SET exercise = ? WHERE exercise = ?', (new, old))
            conn.execute("INSERT INTO fit_migrations (name) VALUES (?)", ('rename_dc_di_variants',))
            logger.info("Renamed Développé couché/incliné to Barre/Haltères variants")

        # Migration: multiple programs per user. A "program" now owns the split,
        # working-sets count and exercise selection; fit_profile keeps only a
        # pointer to the active one (the program used everywhere in the app).
        # Working weights and machine settings stay global (per user/exercise).
        if not _table_exists(conn, 'fit_programs'):
            conn.execute("""
                CREATE TABLE fit_programs (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    name TEXT NOT NULL,
                    split TEXT,
                    work_sets INTEGER,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            logger.info("Created fit_programs table")
        if not _column_exists(conn, 'fit_profile', 'active_program_id'):
            conn.execute("ALTER TABLE fit_profile ADD COLUMN active_program_id INTEGER REFERENCES fit_programs(id) ON DELETE SET NULL")
            logger.info("Added fit_profile.active_program_id column")
        if not _column_exists(conn, 'fit_exercises', 'program_id'):
            conn.execute("ALTER TABLE fit_exercises ADD COLUMN program_id INTEGER REFERENCES fit_programs(id) ON DELETE CASCADE")
            logger.info("Added fit_exercises.program_id column")

        # One-off backfill: every user with an existing profile or exercise
        # selection gets a "Programme 1" carrying their current split/work_sets,
        # set as active, with their exercises attached. Then the program-scoped
        # shape is locked in (program_id NOT NULL, PK on (program_id, muscle, exercise)).
        if not conn.execute("SELECT 1 FROM fit_migrations WHERE name = ?", ('introduce_programs',)).fetchone():
            user_rows = conn.execute(
                """SELECT DISTINCT user_id FROM (
                       SELECT user_id FROM fit_profile
                       UNION
                       SELECT user_id FROM fit_exercises
                   ) u"""
            ).fetchall()
            for u in user_rows:
                uid = u['user_id']
                prof = conn.execute(
                    'SELECT split, work_sets FROM fit_profile WHERE user_id = ?', (uid,)
                ).fetchone()
                pid = conn.execute(
                    'INSERT INTO fit_programs (user_id, name, split, work_sets) VALUES (?, ?, ?, ?) RETURNING id',
                    (uid, 'Programme 1', prof['split'] if prof else None, prof['work_sets'] if prof else None)
                ).fetchone()['id']
                conn.execute(
                    'UPDATE fit_exercises SET program_id = ? WHERE user_id = ? AND program_id IS NULL',
                    (pid, uid)
                )
                conn.execute(
                    """INSERT INTO fit_profile (user_id, active_program_id) VALUES (?, ?)
                       ON CONFLICT (user_id) DO UPDATE SET active_program_id = EXCLUDED.active_program_id""",
                    (uid, pid)
                )
            # Lock in the new shape (drop any orphan exercise rows defensively).
            conn.execute('DELETE FROM fit_exercises WHERE program_id IS NULL')
            conn.execute('ALTER TABLE fit_exercises ALTER COLUMN program_id SET NOT NULL')
            conn.execute('ALTER TABLE fit_exercises DROP CONSTRAINT fit_exercises_pkey')
            conn.execute('ALTER TABLE fit_exercises ADD PRIMARY KEY (program_id, muscle, exercise)')
            conn.execute("INSERT INTO fit_migrations (name) VALUES (?)", ('introduce_programs',))
            logger.info("Migrated existing fit profiles into per-user programs")

        # Migration: user-defined custom exercises (free-text name + manual muscle
        # involvement + an optional single row of variants). Merged into the
        # catalogue everywhere; primary/secondary feed the weighted volume.
        # primary_muscles / secondary_muscles / variants are JSON arrays (TEXT).
        if not _table_exists(conn, 'fit_custom_exercises'):
            conn.execute("""
                CREATE TABLE fit_custom_exercises (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    name TEXT NOT NULL,
                    muscle TEXT NOT NULL,
                    primary_muscles TEXT NOT NULL DEFAULT '[]',
                    secondary_muscles TEXT NOT NULL DEFAULT '[]',
                    variants TEXT NOT NULL DEFAULT '[]',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE (user_id, name)
                )
            """)
            logger.info("Created fit_custom_exercises table")

        # Migration: per-side (unilateral) logging. fit_session_sets.reps_right
        # holds the right-side reps; NULL = a normal bilateral set (reps is the
        # whole count). fit_exercise_unilateral marks a base exercise (per user)
        # as unilateral so its set entry asks for left/right reps (shared weight).
        if not _column_exists(conn, 'fit_session_sets', 'reps_right'):
            conn.execute("ALTER TABLE fit_session_sets ADD COLUMN reps_right INTEGER")
            logger.info("Added fit_session_sets.reps_right column")
        if not _table_exists(conn, 'fit_exercise_unilateral'):
            conn.execute("""
                CREATE TABLE fit_exercise_unilateral (
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    exercise TEXT NOT NULL,
                    PRIMARY KEY (user_id, exercise)
                )
            """)
            logger.info("Created fit_exercise_unilateral table")

        # Migration: a program can carry several splits (each week the user picks
        # which one applies). Stored as a JSON array in fit_programs.splits; the
        # legacy single `split` column is backfilled into it once, then unused.
        if not _column_exists(conn, 'fit_programs', 'splits'):
            conn.execute("ALTER TABLE fit_programs ADD COLUMN splits TEXT")
            conn.execute("UPDATE fit_programs SET splits = '[\"' || split || '\"]' WHERE split IS NOT NULL")
            conn.execute("UPDATE fit_programs SET splits = '[]' WHERE splits IS NULL")
            logger.info("Added fit_programs.splits column")

        # Migration: per-muscle training priority within a program. A JSON object
        # mapping a muscle to 'weak' (a weak point — its exercises lead the
        # session) or 'strong' (a strong point — they close it); muscles absent
        # from the object are neutral. Empty object = no prioritisation.
        if not _column_exists(conn, 'fit_programs', 'priorities'):
            conn.execute("ALTER TABLE fit_programs ADD COLUMN priorities TEXT NOT NULL DEFAULT '{}'")
            logger.info("Added fit_programs.priorities column")

        # Migration: for a Body part split, the user's chosen day order (one muscle
        # group per day) — a JSON array of muscle names, per program. Other splits
        # use a fixed day->muscle mapping defined in code.
        if not _column_exists(conn, 'fit_programs', 'body_part_order'):
            conn.execute("ALTER TABLE fit_programs ADD COLUMN body_part_order TEXT NOT NULL DEFAULT '[]'")
            logger.info("Added fit_programs.body_part_order column")

        # Migration: split the 'Dos' muscle group into 'Dorsaux' (its existing,
        # lat-focused exercises) and a new, initially empty 'Trapèzes' group.
        # Rename 'Dos' wherever it is stored: exercise selections, the priorities
        # map and the Body part day order. The REPLACEs are no-ops on rows that
        # never referenced 'Dos'. Stored set logs key off exercise leaves (which
        # don't change), so sessions are unaffected.
        if not conn.execute("SELECT 1 FROM fit_migrations WHERE name = ?", ('split_dos_into_dorsaux',)).fetchone():
            conn.execute("UPDATE fit_exercises SET muscle = 'Dorsaux' WHERE muscle = 'Dos'")
            conn.execute("""UPDATE fit_programs SET priorities = REPLACE(priorities, '"Dos"', '"Dorsaux"')""")
            conn.execute("""UPDATE fit_programs SET body_part_order = REPLACE(body_part_order, '"Dos"', '"Dorsaux"')""")
            conn.execute("INSERT INTO fit_migrations (name) VALUES (?)", ('split_dos_into_dorsaux',))
            logger.info("Split muscle 'Dos' into 'Dorsaux' + 'Trapèzes'")

        # Migration: the split chosen for a given week (Monday-anchored). A program
        # can carry several splits; each week the user picks which one applies, at
        # the first session of the week. One row per user per week.
        if not _table_exists(conn, 'fit_week_splits'):
            conn.execute("""
                CREATE TABLE fit_week_splits (
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    week_start DATE NOT NULL,
                    split TEXT NOT NULL,
                    PRIMARY KEY (user_id, week_start)
                )
            """)
            logger.info("Created fit_week_splits table")

        # Migration: target reps per working set, per exercise category
        # (upper / lower / isolation). A JSON object; the session averages the
        # working-set reps and reaching the goal cues a weight increase.
        if not _column_exists(conn, 'fit_programs', 'rep_goals'):
            conn.execute("""ALTER TABLE fit_programs ADD COLUMN rep_goals TEXT NOT NULL DEFAULT '{"upper":10,"lower":12,"isolation":12}'""")
            logger.info("Added fit_programs.rep_goals column")

        # Migration: catalogue refinement. 'Dips' becomes 'Dips (Pectoraux)' (its
        # historic home) with a new 'Dips (Triceps)'; 'Curl marteau' moves from
        # Avant-bras to Biceps and 'Squat gobelet' from Fessiers to Quadriceps.
        # Rename the stored 'Dips' leaf everywhere (selections, set logs, working
        # weights, settings, unilateral) and re-file the two moved exercises'
        # selections under their new muscle group.
        if not conn.execute("SELECT 1 FROM fit_migrations WHERE name = ?", ('recat_dips_curl_squat',)).fetchone():
            for table in ('fit_exercises', 'fit_session_sets', 'fit_work_weights',
                          'fit_exercise_settings', 'fit_exercise_unilateral'):
                conn.execute(f"UPDATE {table} SET exercise = 'Dips (Pectoraux)' WHERE exercise = 'Dips'")
            conn.execute("UPDATE fit_exercises SET muscle = 'Biceps' WHERE exercise = 'Curl marteau' AND muscle = 'Avant-bras'")
            conn.execute("UPDATE fit_exercises SET muscle = 'Quadriceps' WHERE exercise = 'Squat gobelet' AND muscle = 'Fessiers'")
            conn.execute("INSERT INTO fit_migrations (name) VALUES (?)", ('recat_dips_curl_squat',))
            logger.info("Re-categorised Dips / Curl marteau / Squat gobelet")

        # Migration: custom exercises carry a compound/isolation flag (feeds the
        # rep goal, like catalogue exercises). Existing customs default to compound.
        if not _column_exists(conn, 'fit_custom_exercises', 'isolation'):
            conn.execute("ALTER TABLE fit_custom_exercises ADD COLUMN isolation BOOLEAN NOT NULL DEFAULT FALSE")
            logger.info("Added fit_custom_exercises.isolation column")

        # Migration: Add phase column to api_usage so we can break diagram timings
        # into locate / judge / read. Backfills existing rows by the rules:
        #   - model_id='gemini-3.1-flash-lite-preview' -> 'judge'
        #   - earliest pro-preview row per request_id   -> 'locate'
        #   - remaining pro-preview rows                -> 'read'
        # Non-diagram features stay NULL.
        if not _column_exists(conn, 'api_usage', 'phase'):
            conn.execute("ALTER TABLE api_usage ADD COLUMN phase TEXT")
            conn.execute("""
                UPDATE api_usage
                SET phase = 'judge'
                WHERE phase IS NULL
                  AND feature = 'diagram'
                  AND model_id = 'gemini-3.1-flash-lite-preview'
            """)
            conn.execute("""
                WITH ranked AS (
                    SELECT id,
                           ROW_NUMBER() OVER (
                               PARTITION BY request_id
                               ORDER BY created_at ASC, id ASC
                           ) AS rn
                    FROM api_usage
                    WHERE phase IS NULL
                      AND feature = 'diagram'
                      AND request_id IS NOT NULL
                      AND model_id <> 'gemini-3.1-flash-lite-preview'
                )
                UPDATE api_usage a
                SET phase = CASE WHEN r.rn = 1 THEN 'locate' ELSE 'read' END
                FROM ranked r
                WHERE a.id = r.id
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_api_usage_phase ON api_usage(phase)")
            logger.info("Added phase column to api_usage and backfilled diagram rows")

        # Migration: allow messaging a student who has no platform account yet.
        # Adds receiver_student_id (nullable FK to coach_students.id) and relaxes
        # receiver_id NOT NULL. Exactly one of (receiver_id, receiver_student_id)
        # must be set. Unlinked-student rows have no receiver_id; once they
        # accept the invite the row stays as-is (history is keyed on the
        # student record, which survives linking).
        if not _column_exists(conn, 'messages', 'receiver_student_id'):
            conn.execute("ALTER TABLE messages ALTER COLUMN receiver_id DROP NOT NULL")
            conn.execute("ALTER TABLE messages ADD COLUMN receiver_student_id INTEGER REFERENCES coach_students(id) ON DELETE CASCADE")
            conn.execute("""
                ALTER TABLE messages ADD CONSTRAINT messages_receiver_xor CHECK (
                    (receiver_id IS NOT NULL AND receiver_student_id IS NULL) OR
                    (receiver_id IS NULL AND receiver_student_id IS NOT NULL)
                )
            """)
            conn.execute("CREATE INDEX idx_messages_receiver_student ON messages(receiver_student_id)")
            logger.info("Added receiver_student_id column to messages")

        # Migration: Music memory-trace tables, written by the standalone
        # "my-music" Spotify tracker daemon and read by the public /music page.
        # Media metadata (artists/albums/tracks) is separated from the
        # append-only interaction log (music_plays). This is the single source
        # of truth for the schema; the daemon only writes rows, never DDL.
        if not _table_exists(conn, 'music_plays'):
            conn.execute("""
                CREATE TABLE music_artists (
                    id          TEXT PRIMARY KEY,
                    name        TEXT NOT NULL,
                    first_seen  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("""
                CREATE TABLE music_albums (
                    id            TEXT PRIMARY KEY,
                    name          TEXT NOT NULL,
                    release_date  TEXT,
                    image_url     TEXT,
                    first_seen    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("""
                CREATE TABLE music_tracks (
                    id           TEXT PRIMARY KEY,
                    name         TEXT NOT NULL,
                    album_id     TEXT REFERENCES music_albums(id),
                    duration_ms  INTEGER NOT NULL,
                    first_seen   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("""
                CREATE TABLE music_track_artists (
                    track_id   TEXT NOT NULL REFERENCES music_tracks(id),
                    artist_id  TEXT NOT NULL REFERENCES music_artists(id),
                    PRIMARY KEY (track_id, artist_id)
                )
            """)
            conn.execute("""
                CREATE TABLE music_plays (
                    id                SERIAL PRIMARY KEY,
                    track_id          TEXT NOT NULL REFERENCES music_tracks(id),
                    played_at         TIMESTAMP NOT NULL,
                    ended_at          TIMESTAMP NOT NULL,
                    ms_played         INTEGER NOT NULL,
                    completion_pct    REAL NOT NULL,
                    committed_reason  TEXT NOT NULL
                )
            """)
            conn.execute("CREATE INDEX idx_music_plays_played_at ON music_plays(played_at)")
            conn.execute("CREATE INDEX idx_music_plays_track ON music_plays(track_id)")
            logger.info("Created music_* tables")
