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

        # Migration: Add optional transaction_time (HH:MM, Paris time) to
        # portfolio_transactions. That table only exists where it was carried
        # over from the investing app, so guard on its presence.
        if _table_exists(conn, 'portfolio_transactions') and not _column_exists(
            conn, 'portfolio_transactions', 'transaction_time'
        ):
            conn.execute("ALTER TABLE portfolio_transactions ADD COLUMN transaction_time TEXT")
            logger.info("Added transaction_time column to portfolio_transactions")

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
                    higher_weight BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            logger.info("Created fit_session_sets table")

        # Migration: fit_session_sets — mark warmup sets (vs working sets)
        if not _column_exists(conn, 'fit_session_sets', 'warmup'):
            conn.execute("ALTER TABLE fit_session_sets ADD COLUMN warmup BOOLEAN NOT NULL DEFAULT FALSE")
            logger.info("Added fit_session_sets.warmup column")

        # Migration: fit_session_sets — flag a set as a "higher weight" attempt
        # (heavier than the working weight). Excluded from the working-weight
        # derivation and the records, never demoted to warmup; shown as
        # "Higher weight" in Progrès.
        if not _column_exists(conn, 'fit_session_sets', 'higher_weight'):
            conn.execute("ALTER TABLE fit_session_sets ADD COLUMN higher_weight BOOLEAN NOT NULL DEFAULT FALSE")
            logger.info("Added fit_session_sets.higher_weight column")

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

        # Migration: revert to a single split per program (the multi-split-per-
        # program option was removed). Backfill the scalar `split` from the first
        # element of the now-unused `splits` JSON array, then drop that column and
        # the fit_week_splits table (which only stored the weekly split choice).
        if not conn.execute("SELECT 1 FROM fit_migrations WHERE name = ?", ('revert_to_single_split',)).fetchone():
            if _column_exists(conn, 'fit_programs', 'splits'):
                conn.execute("UPDATE fit_programs SET split = (splits::json ->> 0) WHERE splits IS NOT NULL")
                conn.execute("ALTER TABLE fit_programs DROP COLUMN splits")
            if _table_exists(conn, 'fit_week_splits'):
                conn.execute("DROP TABLE fit_week_splits")
            conn.execute("INSERT INTO fit_migrations (name) VALUES (?)", ('revert_to_single_split',))
            logger.info("Reverted fit programs to a single split (dropped splits column + fit_week_splits)")

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

        # Migration: the unilateral flag is now per program (a movement can be
        # logged per side in one program and not another). New table keyed by
        # program; backfill each user's old per-user flags into all their programs.
        if not _table_exists(conn, 'fit_program_unilateral'):
            conn.execute("""
                CREATE TABLE fit_program_unilateral (
                    program_id INTEGER NOT NULL REFERENCES fit_programs(id) ON DELETE CASCADE,
                    exercise TEXT NOT NULL,
                    PRIMARY KEY (program_id, exercise)
                )
            """)
            if _table_exists(conn, 'fit_exercise_unilateral'):
                conn.execute("""
                    INSERT INTO fit_program_unilateral (program_id, exercise)
                    SELECT p.id, eu.exercise
                    FROM fit_exercise_unilateral eu
                    JOIN fit_programs p ON p.user_id = eu.user_id
                    ON CONFLICT DO NOTHING
                """)
            logger.info("Created fit_program_unilateral table (per-program unilateral)")

        # Migration: per-program muscle execution order (used to order the session
        # exercise picker within each priority tier). JSON array of muscle names;
        # empty falls back to the catalogue (anatomical) order in code.
        if not _column_exists(conn, 'fit_programs', 'muscle_order'):
            conn.execute("ALTER TABLE fit_programs ADD COLUMN muscle_order TEXT NOT NULL DEFAULT '[]'")
            logger.info("Added fit_programs.muscle_order column")

        # Migration: per-session muscle order/membership within a split. A JSON
        # object {split: [[muscle, …], …]} — for the chosen split, the ordered
        # (and possibly trimmed) muscle groups of each of its sessions, letting the
        # user reorder and drop a muscle from a given session. Empty = the split's
        # default day breakdown (derived in code).
        if not _column_exists(conn, 'fit_programs', 'session_order'):
            conn.execute("ALTER TABLE fit_programs ADD COLUMN session_order TEXT NOT NULL DEFAULT '{}'")
            logger.info("Added fit_programs.session_order column")

        # Migration: a session has one working weight per exercise — the heaviest
        # used. Retroactively demote any working set lighter than its session's
        # heaviest (per exercise) to a warmup (bodyweight counts as 0).
        if not conn.execute("SELECT 1 FROM fit_migrations WHERE name = ?", ('one_working_weight_per_session',)).fetchone():
            conn.execute("""
                WITH maxes AS (
                    SELECT session_id, exercise, MAX(COALESCE(weight, 0)) AS maxw
                    FROM fit_session_sets
                    WHERE warmup = FALSE
                    GROUP BY session_id, exercise
                )
                UPDATE fit_session_sets ss
                SET warmup = TRUE
                FROM maxes m
                WHERE ss.session_id = m.session_id AND ss.exercise = m.exercise
                  AND ss.warmup = FALSE AND COALESCE(ss.weight, 0) < m.maxw
            """)
            conn.execute("INSERT INTO fit_migrations (name) VALUES (?)", ('one_working_weight_per_session',))
            logger.info("Normalized sessions to one working weight per exercise (lighter working sets -> warmups)")

        # Migration: pull-ups (Tractions) recorded assistance as a positive
        # number. Assistance is now modelled as negative weight (added load will
        # be positive), so flip every non-zero Tractions weight in the history to
        # negative — both logged sets and the persisted working weight.
        if not conn.execute("SELECT 1 FROM fit_migrations WHERE name = ?", ('tractions_assist_negative',)).fetchone():
            conn.execute("""
                UPDATE fit_session_sets SET weight = -ABS(weight)
                WHERE weight IS NOT NULL AND weight <> 0
                  AND split_part(exercise, ' — ', 1) = 'Tractions'
            """)
            conn.execute("""
                UPDATE fit_work_weights SET weight = -ABS(weight)
                WHERE weight IS NOT NULL AND weight <> 0
                  AND split_part(exercise, ' — ', 1) = 'Tractions'
            """)
            conn.execute("INSERT INTO fit_migrations (name) VALUES (?)", ('tractions_assist_negative',))
            logger.info("Flipped historical Tractions assistance weights to negative")

        # Migration: the one-working-weight normalization ran while Tractions
        # assistance was still positive, so it tagged the MOST-assisted set (then
        # the largest number) as the working set — inverted once signs flipped.
        # Re-derive warmup/work across ALL sets per (session, exercise) for signed
        # exercises: the working sets are those at the session's heaviest weight
        # (least assistance / most load), the rest become warmups. Unlike
        # _normalize_working_weight this also promotes, so it self-corrects.
        if not conn.execute("SELECT 1 FROM fit_migrations WHERE name = ?", ('renormalize_tractions_work_sets',)).fetchone():
            conn.execute("""
                WITH maxes AS (
                    SELECT session_id, exercise, MAX(COALESCE(weight, 0)) AS maxw
                    FROM fit_session_sets
                    WHERE split_part(exercise, ' — ', 1) = 'Tractions'
                    GROUP BY session_id, exercise
                )
                UPDATE fit_session_sets ss
                SET warmup = (COALESCE(ss.weight, 0) < m.maxw)
                FROM maxes m
                WHERE ss.session_id = m.session_id AND ss.exercise = m.exercise
            """)
            conn.execute("INSERT INTO fit_migrations (name) VALUES (?)", ('renormalize_tractions_work_sets',))
            logger.info("Re-normalized Tractions work/warmup tagging after the sign flip")

        # Migration: a heavy opener is really the exercise's last warmup. When the
        # first working set of a (session, exercise) is followed by another, demote
        # it to a warmup if it's a single (1 rep) or a double (2 reps) backed off
        # to >= 5 reps next (a 2 then 3 stays two working sets). Matches
        # _demote_feeler_sets applied going forward.
        if not conn.execute("SELECT 1 FROM fit_migrations WHERE name = ?", ('demote_feeler_work_sets',)).fetchone():
            conn.execute("""
                WITH ordered AS (
                    SELECT id, session_id, exercise, reps,
                           ROW_NUMBER() OVER (PARTITION BY session_id, exercise ORDER BY id) AS rn
                    FROM fit_session_sets
                    WHERE warmup = FALSE
                ),
                feelers AS (
                    SELECT o1.id
                    FROM ordered o1
                    JOIN ordered o2 ON o2.session_id = o1.session_id
                                   AND o2.exercise = o1.exercise AND o2.rn = 2
                    WHERE o1.rn = 1 AND (o1.reps = 1 OR (o1.reps = 2 AND o2.reps >= 5))
                )
                UPDATE fit_session_sets SET warmup = TRUE
                WHERE id IN (SELECT id FROM feelers)
            """)
            conn.execute("INSERT INTO fit_migrations (name) VALUES (?)", ('demote_feeler_work_sets',))
            logger.info("Demoted opening feeler singles/doubles to warmups")

        # Migration: the first demote_feeler_work_sets shipped a looser rule
        # (2 reps with any next > 2 reps was a feeler) and already ran on prod, so
        # the refined rule above won't re-run there. Restore the sets it over-
        # demoted: a 2-rep opener backed off to only 3-4 reps next is now a working
        # set again. They sit as warmups at the session's working weight, just
        # before the work block. (No-op on fresh DBs, where the refined rule ran.)
        if not conn.execute("SELECT 1 FROM fit_migrations WHERE name = ?", ('restore_overdemoted_feelers',)).fetchone():
            conn.execute("""
                WITH work AS (
                    SELECT session_id, exercise,
                           MIN(id) AS first_work_id,
                           MAX(COALESCE(weight, 0)) AS maxw
                    FROM fit_session_sets
                    WHERE warmup = FALSE
                    GROUP BY session_id, exercise
                ),
                first_work AS (
                    SELECT w.session_id, w.exercise, w.first_work_id, w.maxw, ss.reps AS first_reps
                    FROM work w
                    JOIN fit_session_sets ss ON ss.id = w.first_work_id
                ),
                candidates AS (
                    SELECT s.id, s.session_id, s.exercise
                    FROM fit_session_sets s
                    JOIN first_work fw ON fw.session_id = s.session_id AND fw.exercise = s.exercise
                    WHERE s.warmup = TRUE AND s.reps = 2
                      AND COALESCE(s.weight, 0) = fw.maxw
                      AND s.id < fw.first_work_id
                      AND fw.first_reps IN (3, 4)
                ),
                restore AS (
                    SELECT MAX(id) AS id FROM candidates GROUP BY session_id, exercise
                )
                UPDATE fit_session_sets SET warmup = FALSE
                WHERE id IN (SELECT id FROM restore)
            """)
            conn.execute("INSERT INTO fit_migrations (name) VALUES (?)", ('restore_overdemoted_feelers',))
            logger.info("Restored over-demoted 2-rep openers (3-4 reps next) to working sets")

        # Migration: Louis's historical Élévations latérales were all done at the
        # cable (Poulie basse), one arm at a time, but logged before variants /
        # unilateral existed. They therefore sit under a leaf that no longer
        # matches the program's "Élévations latérales — Poulie basse" selection
        # (so Suivi, which matches the exact leaf, hides them) and as bilateral
        # sets. Re-file every such set to the Poulie basse leaf and mark it
        # unilateral — the logged rep count was per-side, so reps_right = reps.
        # Then recompute the persisted working weight for the leaf: it was stuck
        # at a stale orphan value (e.g. 20 kg) because _recompute_work_weight only
        # ever read the exact "— Poulie basse" leaf (empty until this re-file) and
        # never clears a value when nothing qualifies. Re-derive it as the heaviest
        # working set over the 3 most recent finished sessions, matching the live
        # recompute. Scoped to Louis only; other users' variants are untouched.
        if not conn.execute("SELECT 1 FROM fit_migrations WHERE name = ?", ('latraises_louis_poulie_basse_unilateral',)).fetchone():
            louis = conn.execute("SELECT id FROM users WHERE email = ?", ('rose.louis.mail@gmail.com',)).fetchone()
            if louis:
                conn.execute("""
                    UPDATE fit_session_sets ss
                    SET exercise = 'Élévations latérales — Poulie basse',
                        reps_right = COALESCE(ss.reps_right, ss.reps)
                    FROM fit_sessions s
                    WHERE ss.session_id = s.id
                      AND s.user_id = ?
                      AND split_part(ss.exercise, ' — ', 1) = 'Élévations latérales'
                      AND ss.exercise <> 'Élévations latérales — Poulie basse'
                """, (louis['id'],))
                conn.execute("""
                    WITH recent AS (
                        SELECT s.id
                        FROM fit_sessions s
                        JOIN fit_session_sets ss ON ss.session_id = s.id
                        WHERE s.user_id = ? AND s.ended_at IS NOT NULL
                          AND ss.exercise = 'Élévations latérales — Poulie basse'
                          AND ss.warmup = FALSE AND ss.weight IS NOT NULL
                        GROUP BY s.id, s.started_at
                        ORDER BY s.started_at DESC
                        LIMIT 3
                    )
                    INSERT INTO fit_work_weights (user_id, exercise, weight)
                    SELECT ?, 'Élévations latérales — Poulie basse', MAX(ss.weight)
                    FROM fit_session_sets ss
                    JOIN recent r ON r.id = ss.session_id
                    WHERE ss.exercise = 'Élévations latérales — Poulie basse'
                      AND ss.warmup = FALSE AND ss.weight IS NOT NULL
                    HAVING MAX(ss.weight) IS NOT NULL
                    ON CONFLICT (user_id, exercise) DO UPDATE SET weight = EXCLUDED.weight
                """, (louis['id'], louis['id']))
            conn.execute("INSERT INTO fit_migrations (name) VALUES (?)", ('latraises_louis_poulie_basse_unilateral',))
            logger.info("Re-filed Louis's Élévations latérales history to Poulie basse + unilateral, recomputed work weight")

        # Migration: the recompute above was added by amending the migration after
        # its first (re-file-only) version had already run on prod, so the guard
        # skipped it on the next deploy — leaving the persisted working weight stuck
        # at the stale orphan (20 kg) even though the re-filed history maxes at 4.5.
        # Run the recompute under a fresh guard so it actually executes. Heaviest
        # working set over the 3 most recent finished Poulie basse sessions.
        if not conn.execute("SELECT 1 FROM fit_migrations WHERE name = ?", ('latraises_louis_recompute_work_weight',)).fetchone():
            louis = conn.execute("SELECT id FROM users WHERE email = ?", ('rose.louis.mail@gmail.com',)).fetchone()
            if louis:
                conn.execute("""
                    WITH recent AS (
                        SELECT s.id
                        FROM fit_sessions s
                        JOIN fit_session_sets ss ON ss.session_id = s.id
                        WHERE s.user_id = ? AND s.ended_at IS NOT NULL
                          AND ss.exercise = 'Élévations latérales — Poulie basse'
                          AND ss.warmup = FALSE AND ss.weight IS NOT NULL
                        GROUP BY s.id, s.started_at
                        ORDER BY s.started_at DESC
                        LIMIT 3
                    )
                    INSERT INTO fit_work_weights (user_id, exercise, weight)
                    SELECT ?, 'Élévations latérales — Poulie basse', MAX(ss.weight)
                    FROM fit_session_sets ss
                    JOIN recent r ON r.id = ss.session_id
                    WHERE ss.exercise = 'Élévations latérales — Poulie basse'
                      AND ss.warmup = FALSE AND ss.weight IS NOT NULL
                    HAVING MAX(ss.weight) IS NOT NULL
                    ON CONFLICT (user_id, exercise) DO UPDATE SET weight = EXCLUDED.weight
                """, (louis['id'], louis['id']))
            conn.execute("INSERT INTO fit_migrations (name) VALUES (?)", ('latraises_louis_recompute_work_weight',))
            logger.info("Recomputed Louis's Élévations latérales working weight (fresh-guard fix)")

        # Migration: some Élévations latérales sessions came from the old gym
        # import, which stored each unilateral set's two sides as two separate
        # rows; the earlier re-file then set reps_right = reps on each, so a real
        # 3-set session (8/8, 7/9, 6/7) shows as 6 doubled rows (8/8, 8/8, 7/7,
        # 9/9, 6/6, 7/7). Per Louis's rule, any Poulie basse session with exactly
        # 6 sets is a doubled 3-set session: fold each consecutive (left, right)
        # pair into one unilateral set (reps = left, reps_right = right) and drop
        # the right row. UPDATE runs before DELETE (it reads the right rows' reps).
        # Scoped to Louis.
        if not conn.execute("SELECT 1 FROM fit_migrations WHERE name = ?", ('latraises_merge_doubled_gym_sessions',)).fetchone():
            louis = conn.execute("SELECT id FROM users WHERE email = ?", ('rose.louis.mail@gmail.com',)).fetchone()
            if louis:
                conn.execute("""
                    WITH la AS (
                        SELECT ss.id, ss.session_id, ss.reps,
                               ROW_NUMBER() OVER (PARTITION BY ss.session_id ORDER BY ss.id) AS rn,
                               COUNT(*) OVER (PARTITION BY ss.session_id) AS cnt
                        FROM fit_session_sets ss
                        JOIN fit_sessions s ON s.id = ss.session_id
                        WHERE s.user_id = ? AND ss.exercise = 'Élévations latérales — Poulie basse'
                    ),
                    pairs AS (
                        SELECT l.id AS left_id, r.reps AS right_reps
                        FROM la l
                        JOIN la r ON r.session_id = l.session_id AND r.rn = l.rn + 1
                        WHERE l.cnt = 6 AND MOD(l.rn, 2) = 1
                    )
                    UPDATE fit_session_sets ss
                    SET reps_right = p.right_reps
                    FROM pairs p
                    WHERE ss.id = p.left_id
                """, (louis['id'],))
                conn.execute("""
                    WITH la AS (
                        SELECT ss.id,
                               ROW_NUMBER() OVER (PARTITION BY ss.session_id ORDER BY ss.id) AS rn,
                               COUNT(*) OVER (PARTITION BY ss.session_id) AS cnt
                        FROM fit_session_sets ss
                        JOIN fit_sessions s ON s.id = ss.session_id
                        WHERE s.user_id = ? AND ss.exercise = 'Élévations latérales — Poulie basse'
                    )
                    DELETE FROM fit_session_sets
                    WHERE id IN (SELECT id FROM la WHERE cnt = 6 AND MOD(rn, 2) = 0)
                """, (louis['id'],))
            conn.execute("INSERT INTO fit_migrations (name) VALUES (?)", ('latraises_merge_doubled_gym_sessions',))
            logger.info("Merged doubled 6-set Élévations latérales sessions back into 3 unilateral sets")

        # Migration: the merge above keyed on 6 TOTAL sets, so it missed doubled
        # sessions that also have warmup rows (total > 6) — e.g. séances 50/53,
        # still showing 6 working sets. Re-do it keyed on 6 WORKING sets, pairing
        # only the working sets (ranked among themselves, warmups left as-is).
        # Already-fixed sessions now have 3 working sets, so they're untouched.
        # UPDATE before DELETE. Scoped to Louis.
        if not conn.execute("SELECT 1 FROM fit_migrations WHERE name = ?", ('latraises_merge_doubled_6working',)).fetchone():
            louis = conn.execute("SELECT id FROM users WHERE email = ?", ('rose.louis.mail@gmail.com',)).fetchone()
            if louis:
                conn.execute("""
                    WITH la AS (
                        SELECT ss.id, ss.session_id, ss.reps,
                               ROW_NUMBER() OVER (PARTITION BY ss.session_id ORDER BY ss.id) AS rn,
                               COUNT(*) OVER (PARTITION BY ss.session_id) AS cnt
                        FROM fit_session_sets ss
                        JOIN fit_sessions s ON s.id = ss.session_id
                        WHERE s.user_id = ? AND ss.exercise = 'Élévations latérales — Poulie basse'
                              AND ss.warmup = FALSE
                    ),
                    pairs AS (
                        SELECT l.id AS left_id, r.reps AS right_reps
                        FROM la l
                        JOIN la r ON r.session_id = l.session_id AND r.rn = l.rn + 1
                        WHERE l.cnt = 6 AND MOD(l.rn, 2) = 1
                    )
                    UPDATE fit_session_sets ss
                    SET reps_right = p.right_reps
                    FROM pairs p
                    WHERE ss.id = p.left_id
                """, (louis['id'],))
                conn.execute("""
                    WITH la AS (
                        SELECT ss.id,
                               ROW_NUMBER() OVER (PARTITION BY ss.session_id ORDER BY ss.id) AS rn,
                               COUNT(*) OVER (PARTITION BY ss.session_id) AS cnt
                        FROM fit_session_sets ss
                        JOIN fit_sessions s ON s.id = ss.session_id
                        WHERE s.user_id = ? AND ss.exercise = 'Élévations latérales — Poulie basse'
                              AND ss.warmup = FALSE
                    )
                    DELETE FROM fit_session_sets
                    WHERE id IN (SELECT id FROM la WHERE cnt = 6 AND MOD(rn, 2) = 0)
                """, (louis['id'],))
            conn.execute("INSERT INTO fit_migrations (name) VALUES (?)", ('latraises_merge_doubled_6working',))
            logger.info("Merged doubled 6-working-set Élévations latérales sessions (warmups present)")

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

        # Migration: Create workblock_state — single-row site-blocking toggle.
        # The Focus app (/focus) flips `blocking`; the local Mac watcher polls
        # it and closes distracting browser tabs while it's true.
        if not _table_exists(conn, 'workblock_state'):
            conn.execute("""
                CREATE TABLE workblock_state (
                    id         INTEGER PRIMARY KEY,
                    blocking   BOOLEAN NOT NULL DEFAULT FALSE,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("INSERT INTO workblock_state (id, blocking) VALUES (1, FALSE)")
            logger.info("Created workblock_state table")

        # Migration: Create workblock_items — the editable block list. Each row
        # is either a website ('site', matched against tab URLs) or a macOS app
        # ('app', quit while blocking). Seeded with the original three sites.
        if not _table_exists(conn, 'workblock_items'):
            conn.execute("""
                CREATE TABLE workblock_items (
                    id         SERIAL PRIMARY KEY,
                    kind       TEXT NOT NULL,
                    value      TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE (kind, value)
                )
            """)
            for v in ('youtube.com', 'linkedin.com', 'chess.com'):
                conn.execute("INSERT INTO workblock_items (kind, value) VALUES (?, ?)", ('site', v))
            logger.info("Created workblock_items table")

        # Keep block-list values lowercase (matching is case-insensitive).
        # Idempotent: drops any case-duplicates, then lowercases the rest.
        if _table_exists(conn, 'workblock_items'):
            conn.execute("""
                DELETE FROM workblock_items a
                USING workblock_items b
                WHERE a.id > b.id AND a.kind = b.kind AND lower(a.value) = lower(b.value)
            """)
            conn.execute("UPDATE workblock_items SET value = lower(value) WHERE value <> lower(value)")

        # Migration: make Focus (workblock) per-user. The tables started as
        # global singletons (state keyed on id=1, items unique on kind+value);
        # the Focus app is now open to any logged-in user, so each owns their
        # own switch and list. Existing global rows belong to the owner — whose
        # local Mac watcher still polls /status for them — so backfill them to
        # the owner's user_id before re-keying.
        state_needs = _table_exists(conn, 'workblock_state') and not _column_exists(
            conn, 'workblock_state', 'user_id'
        )
        items_needs = _table_exists(conn, 'workblock_items') and not _column_exists(
            conn, 'workblock_items', 'user_id'
        )
        if state_needs or items_needs:
            from blueprints.auth_utils import owner_email
            oe = (owner_email() or '').strip().lower()
            owner_row = conn.execute(
                "SELECT id FROM users WHERE lower(email) = ?", (oe,)
            ).fetchone() if oe else None
            owner_id = owner_row['id'] if owner_row else None

            if state_needs:
                conn.execute(
                    "ALTER TABLE workblock_state ADD COLUMN user_id INTEGER "
                    "REFERENCES users(id) ON DELETE CASCADE"
                )
                if owner_id is not None:
                    conn.execute(
                        "UPDATE workblock_state SET user_id = ? WHERE user_id IS NULL",
                        (owner_id,),
                    )
                # Drop any rows we couldn't attribute (e.g. owner not yet
                # provisioned), then re-key the table on user_id.
                conn.execute("DELETE FROM workblock_state WHERE user_id IS NULL")
                conn.execute("ALTER TABLE workblock_state DROP CONSTRAINT workblock_state_pkey")
                conn.execute("ALTER TABLE workblock_state DROP COLUMN id")
                conn.execute("ALTER TABLE workblock_state ADD PRIMARY KEY (user_id)")
                logger.info("Made workblock_state per-user")

            if items_needs:
                conn.execute(
                    "ALTER TABLE workblock_items ADD COLUMN user_id INTEGER "
                    "REFERENCES users(id) ON DELETE CASCADE"
                )
                if owner_id is not None:
                    conn.execute(
                        "UPDATE workblock_items SET user_id = ? WHERE user_id IS NULL",
                        (owner_id,),
                    )
                conn.execute("DELETE FROM workblock_items WHERE user_id IS NULL")
                conn.execute("ALTER TABLE workblock_items ALTER COLUMN user_id SET NOT NULL")
                conn.execute(
                    "ALTER TABLE workblock_items DROP CONSTRAINT IF EXISTS workblock_items_kind_value_key"
                )
                conn.execute(
                    "ALTER TABLE workblock_items ADD CONSTRAINT workblock_items_user_kind_value_key "
                    "UNIQUE (user_id, kind, value)"
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_workblock_items_user ON workblock_items(user_id)"
                )
                logger.info("Made workblock_items per-user")

        # Migration: correlation tool — shared growable ticker universe + each
        # user's extra tickers (beyond portfolio holdings). The universe is
        # seeded from investing.py's _SEED_UNIVERSE on first use, not here.
        if not _table_exists(conn, 'correlation_universe'):
            conn.execute("""
                CREATE TABLE correlation_universe (
                    ticker   TEXT PRIMARY KEY,
                    name     TEXT NOT NULL,
                    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            logger.info("Created correlation_universe table")

        if not _table_exists(conn, 'correlation_extra_tickers'):
            conn.execute("""
                CREATE TABLE correlation_extra_tickers (
                    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    ticker     TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (user_id, ticker)
                )
            """)
            logger.info("Created correlation_extra_tickers table")

        # Migration: per-user token for the LUMNA Focus browser extension.
        if not _table_exists(conn, 'workblock_tokens'):
            conn.execute("""
                CREATE TABLE workblock_tokens (
                    user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                    token      TEXT NOT NULL UNIQUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            logger.info("Created workblock_tokens table")

        # Migration: Focus for anonymous users (optional login). Same switch +
        # list, keyed by the browser's X-Focus-Token instead of a user_id.
        if not _table_exists(conn, 'workblock_anon_state'):
            conn.execute("""
                CREATE TABLE workblock_anon_state (
                    token      TEXT PRIMARY KEY,
                    blocking   BOOLEAN NOT NULL DEFAULT FALSE,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            logger.info("Created workblock_anon_state table")

        if not _table_exists(conn, 'workblock_anon_items'):
            conn.execute("""
                CREATE TABLE workblock_anon_items (
                    id         SERIAL PRIMARY KEY,
                    token      TEXT NOT NULL,
                    kind       TEXT NOT NULL,
                    value      TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE (token, kind, value)
                )
            """)
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_workblock_anon_items_token "
                "ON workblock_anon_items(token)"
            )
            logger.info("Created workblock_anon_items table")

        # Migration: MPP (Mon Petit Prono) account — stores the owner's Auth0
        # refresh token plus a cached access token for the api.mpp.football calls.
        if not _table_exists(conn, 'mpp_account'):
            conn.execute("""
                CREATE TABLE mpp_account (
                    user_id           INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                    refresh_token     TEXT NOT NULL,
                    access_token      TEXT,
                    access_expires_at TIMESTAMP,
                    updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            logger.info("Created mpp_account table")
