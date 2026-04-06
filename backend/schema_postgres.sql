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
    is_admin INTEGER DEFAULT 0,
    sign_in_count INTEGER DEFAULT 0,
    session_count INTEGER DEFAULT 0,
    last_session_ping TIMESTAMP,
    cookie_consent TEXT,
    cookie_consent_at TIMESTAMP,
    cookie_refusal_count INTEGER DEFAULT 0,
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

-- Player stats cache
CREATE TABLE IF NOT EXISTS player_stats_cache (
    username TEXT NOT NULL,
    time_class TEXT NOT NULL,
    player_data TEXT NOT NULL,
    stats_data TEXT NOT NULL,
    last_archive TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (username, time_class)
);

-- Chess user preferences (keyed by chess username, no auth required)
CREATE TABLE IF NOT EXISTS chess_user_prefs (
    username TEXT PRIMARY KEY,
    onboarding_done INTEGER NOT NULL DEFAULT 0,
    preferred_time_class TEXT DEFAULT NULL,
    fide_id TEXT DEFAULT NULL,
    leaderboard_name TEXT DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Chess goals
CREATE TABLE IF NOT EXISTS chess_goals (
    username TEXT NOT NULL,
    time_class TEXT NOT NULL,
    elo_goal INTEGER NOT NULL,
    elo_goal_start_elo INTEGER NOT NULL,
    elo_goal_start_date TEXT NOT NULL,
    elo_goal_months INTEGER NOT NULL DEFAULT 3,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (username, time_class)
);

-- Chess FIDE friends (leaderboard)
CREATE TABLE IF NOT EXISTS chess_fide_friends (
    username TEXT NOT NULL,
    fide_id TEXT NOT NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (username, fide_id)
);

-- Monthly archive cache
CREATE TABLE IF NOT EXISTS monthly_archive_cache (
    username TEXT NOT NULL,
    archive_url TEXT NOT NULL,
    games_json TEXT NOT NULL,
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (username, archive_url)
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

-- Graph downloads tracking
CREATE TABLE IF NOT EXISTS graph_downloads (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    graph_type TEXT NOT NULL,
    downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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

-- First visitor reward tracking
CREATE TABLE IF NOT EXISTS first_visitor_reward (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    user_name TEXT NOT NULL,
    user_email TEXT NOT NULL,
    selected_company TEXT NOT NULL,
    claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Coach students
CREATE TABLE IF NOT EXISTS coach_students (
    id SERIAL PRIMARY KEY,
    coach_user_id INTEGER NOT NULL,
    student_name TEXT NOT NULL,
    timezone TEXT DEFAULT 'UTC',
    currency TEXT,
    source TEXT,
    chesscom_username TEXT,
    lichess_username TEXT,
    recurring_day INTEGER,
    recurring_time TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_player_stats_cache_updated ON player_stats_cache(updated_at);
CREATE INDEX IF NOT EXISTS idx_user_activity_user_id ON user_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_date ON user_activity(activity_date);
CREATE INDEX IF NOT EXISTS idx_page_activity_user_id ON page_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_page_daily_activity_date ON page_daily_activity(activity_date);
CREATE INDEX IF NOT EXISTS idx_page_daily_activity_user ON page_daily_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_graph_downloads_user_id ON graph_downloads(user_id);
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
