-- PostgreSQL Schema for LUMNA (Chess Coaches App)
-- This is the single source of truth for fresh database setups.
-- Loaded by Docker via docker-entrypoint-initdb.d on first container creation.

-- Users (Google OAuth)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    google_id TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    picture TEXT,
    role TEXT,  -- NULL until first login choice, then 'coach' or 'student'
    is_admin INTEGER DEFAULT 0,
    sign_in_count INTEGER DEFAULT 0,
    session_count INTEGER DEFAULT 0,
    last_session_ping TIMESTAMP,
    cookie_consent TEXT,
    cookie_consent_at TIMESTAMP,
    cookie_refusal_count INTEGER DEFAULT 0,
    google_calendar_refresh_token TEXT,
    registered_app TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User preferences
CREATE TABLE IF NOT EXISTS user_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE NOT NULL,
    chess_username TEXT,
    coaches_chess_username TEXT,
    lichess_username TEXT,
    preferred_time_class TEXT DEFAULT 'rapid',
    dashboard_card_order TEXT,
    financial_card_order TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Refresh tokens (JWT rotation)
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    token_hash TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- User activity tracking
CREATE TABLE IF NOT EXISTS user_activity (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    activity_date TEXT NOT NULL,
    seconds INTEGER DEFAULT 0,
    last_ping TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, activity_date)
);

-- Page-level activity tracking
CREATE TABLE IF NOT EXISTS page_activity (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    page TEXT NOT NULL,
    seconds INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, page)
);

-- Page-level daily activity tracking
CREATE TABLE IF NOT EXISTS page_daily_activity (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    activity_date TEXT NOT NULL,
    page TEXT NOT NULL,
    seconds INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, activity_date, page)
);

-- Theme usage tracking
CREATE TABLE IF NOT EXISTS theme_usage (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE NOT NULL,
    theme TEXT NOT NULL,
    resolved_theme TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Language usage tracking
CREATE TABLE IF NOT EXISTS language_usage (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE NOT NULL,
    language TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Device usage tracking
CREATE TABLE IF NOT EXISTS device_usage (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    device_type TEXT NOT NULL,
    seconds INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, device_type)
);

-- Coach students
CREATE TABLE IF NOT EXISTS coach_students (
    id SERIAL PRIMARY KEY,
    coach_user_id INTEGER NOT NULL,
    linked_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,  -- set when student accepts invite
    student_name TEXT NOT NULL,
    city TEXT,
    timezone TEXT DEFAULT 'UTC',
    currency TEXT,
    source TEXT,
    chesscom_username TEXT,
    lichess_username TEXT,
    fide_arena_username TEXT,
    fide_arena_profile_url TEXT,
    email TEXT,
    phone_number TEXT,
    recurring_day INTEGER,
    recurring_time TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Student invites (coach invites student to create an account)
CREATE TABLE IF NOT EXISTS student_invites (
    id SERIAL PRIMARY KEY,
    coach_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES coach_students(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    accepted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_student_invites_token ON student_invites(token);

-- Lesson packs
CREATE TABLE IF NOT EXISTS coach_packs (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES coach_students(id) ON DELETE CASCADE,
    total_lessons INTEGER NOT NULL,
    lessons_done INTEGER DEFAULT 0,
    lessons_paid INTEGER DEFAULT 0,
    price REAL,
    currency TEXT,
    source TEXT,
    note TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Individual lessons
CREATE TABLE IF NOT EXISTS coach_lessons (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES coach_students(id) ON DELETE CASCADE,
    scheduled_at TIMESTAMP NOT NULL,
    duration_minutes INTEGER DEFAULT 60,
    status TEXT DEFAULT 'scheduled',
    paid INTEGER DEFAULT 0,
    pack_id INTEGER REFERENCES coach_packs(id) ON DELETE SET NULL,
    notes TEXT,
    meet_link TEXT,
    deleted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Messages (coach-student chat)
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
    position_id INTEGER REFERENCES knowledge_positions(id) ON DELETE SET NULL,
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(sender_id, receiver_id, created_at);

-- Invoices (coach sends to student, paid via Revolut link)
CREATE TABLE IF NOT EXISTS invoices (
    id SERIAL PRIMARY KEY,
    coach_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES coach_students(id) ON DELETE CASCADE,
    message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending',  -- 'pending' or 'paid'
    paid_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_invoices_student ON invoices(student_id);
CREATE INDEX IF NOT EXISTS idx_invoices_coach ON invoices(coach_user_id);

-- Coach profile (one per coach)
CREATE TABLE IF NOT EXISTS coach_profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    display_name TEXT,
    city TEXT,
    timezone TEXT,
    currency TEXT,
    lesson_rate REAL,
    lesson_duration INTEGER DEFAULT 60,
    chesscom_username TEXT,
    lichess_username TEXT,
    revolut_username TEXT,
    email TEXT,
    phone_number TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Coach bundle offers (multiple per coach)
CREATE TABLE IF NOT EXISTS coach_bundle_offers (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lessons INTEGER NOT NULL,
    price REAL NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_coach_bundle_offers_user ON coach_bundle_offers(user_id);

-- Knowledge Center: folder tree + saved positions
CREATE TABLE IF NOT EXISTS knowledge_folders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id INTEGER REFERENCES knowledge_folders(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS knowledge_positions (
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
);

-- API usage tracking (Gemini calls)
CREATE TABLE IF NOT EXISTS api_usage (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    request_id TEXT,
    feature TEXT NOT NULL,
    model_id TEXT NOT NULL,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    thinking_tokens INTEGER DEFAULT 0,
    billing_tier TEXT DEFAULT 'paid',
    elapsed_seconds INTEGER DEFAULT 0,
    error TEXT,
    retry_free_error TEXT,
    retry_free_elapsed INTEGER,
    phase TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Clothing agent job queue. Enqueued by the web app, claimed and fulfilled by a
-- worker on the owner's own machine (residential IP + real Chrome) so it can
-- browse bot-protected stores. sources/result are JSON text.
CREATE TABLE IF NOT EXISTS clothing_jobs (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    prompt      TEXT NOT NULL,
    sources     TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    result      TEXT,
    error       TEXT,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    claimed_at  TIMESTAMP,
    finished_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_clothing_jobs_status ON clothing_jobs(status, created_at);

-- Music memory trace (written by the my-music Spotify tracker daemon, read by
-- the public /music page). Media metadata is separated from the play log.
CREATE TABLE IF NOT EXISTS music_artists (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    first_seen  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS music_albums (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    release_date  TEXT,
    image_url     TEXT,
    first_seen    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS music_tracks (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    album_id     TEXT REFERENCES music_albums(id),
    duration_ms  INTEGER NOT NULL,
    first_seen   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS music_track_artists (
    track_id   TEXT NOT NULL REFERENCES music_tracks(id),
    artist_id  TEXT NOT NULL REFERENCES music_artists(id),
    PRIMARY KEY (track_id, artist_id)
);

CREATE TABLE IF NOT EXISTS music_plays (
    id                SERIAL PRIMARY KEY,
    track_id          TEXT NOT NULL REFERENCES music_tracks(id),
    played_at         TIMESTAMP NOT NULL,
    ended_at          TIMESTAMP NOT NULL,
    ms_played         INTEGER NOT NULL,
    completion_pct    REAL NOT NULL,
    committed_reason  TEXT NOT NULL
);

-- Focus app (workblock): per-user blocking switch + editable block list.
-- The Focus app (/focus) edits these. The owner's local Mac watcher polls
-- /status for the owner's list; browser extensions poll per logged-in user.
CREATE TABLE IF NOT EXISTS workblock_state (
    user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    blocking   BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workblock_items (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL,
    value      TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, kind, value)
);
CREATE INDEX IF NOT EXISTS idx_workblock_items_user ON workblock_items(user_id);

-- Per-user token for the LUMNA Focus browser extension (polls /api/workblock/feed).
CREATE TABLE IF NOT EXISTS workblock_tokens (
    user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    token      TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Focus for anonymous (not-logged-in) users: same switch + list, keyed by the
-- random token the browser generates and sends in the X-Focus-Token header.
CREATE TABLE IF NOT EXISTS workblock_anon_state (
    token      TEXT PRIMARY KEY,
    blocking   BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workblock_anon_items (
    id         SERIAL PRIMARY KEY,
    token      TEXT NOT NULL,
    kind       TEXT NOT NULL,
    value      TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (token, kind, value)
);
CREATE INDEX IF NOT EXISTS idx_workblock_anon_items_token ON workblock_anon_items(token);

-- Correlation tool: a shared, growable universe of tickers (seeded in code from
-- investing.py _SEED_UNIVERSE) plus each user's extra tickers beyond their
-- portfolio holdings. A user's correlation list = their holdings + their extras.
CREATE TABLE IF NOT EXISTS correlation_universe (
    ticker   TEXT PRIMARY KEY,
    name     TEXT NOT NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS correlation_extra_tickers (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ticker     TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, ticker)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_music_plays_played_at ON music_plays(played_at);
CREATE INDEX IF NOT EXISTS idx_music_plays_track ON music_plays(track_id);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_user_activity_user_id ON user_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_date ON user_activity(activity_date);
CREATE INDEX IF NOT EXISTS idx_page_activity_user_id ON page_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_page_daily_activity_date ON page_daily_activity(activity_date);
CREATE INDEX IF NOT EXISTS idx_page_daily_activity_user ON page_daily_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_theme_usage_user_id ON theme_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_language_usage_user_id ON language_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_device_usage_user_id ON device_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_coach_students_coach ON coach_students(coach_user_id);
CREATE INDEX IF NOT EXISTS idx_coach_packs_student ON coach_packs(student_id);
CREATE INDEX IF NOT EXISTS idx_coach_lessons_student ON coach_lessons(student_id);
CREATE INDEX IF NOT EXISTS idx_coach_lessons_scheduled ON coach_lessons(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_coach_lessons_pack ON coach_lessons(pack_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_created ON api_usage(created_at);
CREATE INDEX IF NOT EXISTS idx_api_usage_feature ON api_usage(feature);
CREATE INDEX IF NOT EXISTS idx_api_usage_phase ON api_usage(phase);
CREATE INDEX IF NOT EXISTS idx_knowledge_folders_user ON knowledge_folders(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_folders_parent ON knowledge_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_positions_user ON knowledge_positions(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_positions_folder ON knowledge_positions(folder_id);
