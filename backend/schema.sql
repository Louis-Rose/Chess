-- Users table (Google OAuth data)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_id TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    picture TEXT,
    is_admin INTEGER DEFAULT 0,
    sign_in_count INTEGER DEFAULT 0,
    session_count INTEGER DEFAULT 0,
    last_session_ping TIMESTAMP,
    cookie_consent TEXT,              -- 'accepted' or NULL (refused/pending are not stored)
    cookie_consent_at TIMESTAMP,      -- When consent was given
    cookie_refusal_count INTEGER DEFAULT 0,  -- How many times user refused before accepting
    registered_app TEXT,                     -- Which app the user signed up from (e.g. 'coaches')
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL,
    chess_username TEXT,
    coaches_chess_username TEXT,
    lichess_username TEXT,
    preferred_time_class TEXT DEFAULT 'rapid',
    dashboard_card_order TEXT,  -- JSON array of card IDs for custom order
    financial_card_order TEXT,  -- JSON array of financial metric card IDs
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Refresh tokens table (for token rotation security)
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Player stats cache table
CREATE TABLE IF NOT EXISTS player_stats_cache (
    username TEXT NOT NULL,
    time_class TEXT NOT NULL,
    player_data TEXT NOT NULL,  -- JSON: player info (name, avatar, followers, joined)
    stats_data TEXT NOT NULL,   -- JSON: history, elo_history, openings, game_number_stats, totals
    last_archive TEXT,          -- Last archive URL processed (for incremental updates)
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (username, time_class)
);

-- User activity tracking (for time spent analytics)
CREATE TABLE IF NOT EXISTS user_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    activity_date TEXT NOT NULL,  -- YYYY-MM-DD
    seconds INTEGER DEFAULT 0,
    last_ping TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, activity_date)
);

-- Page-level activity tracking (for section breakdown)
CREATE TABLE IF NOT EXISTS page_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    page TEXT NOT NULL,
    seconds INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, page)
);

-- Page-level daily activity tracking (for per-page daily charts)
CREATE TABLE IF NOT EXISTS page_daily_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    activity_date TEXT NOT NULL,  -- YYYY-MM-DD
    page TEXT NOT NULL,
    seconds INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, activity_date, page)
);
CREATE INDEX IF NOT EXISTS idx_page_daily_activity_date ON page_daily_activity(activity_date);
CREATE INDEX IF NOT EXISTS idx_page_daily_activity_user ON page_daily_activity(user_id);

-- Graph downloads tracking (for analytics)
CREATE TABLE IF NOT EXISTS graph_downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    graph_type TEXT NOT NULL,             -- 'composition', 'performance', etc.
    downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Theme preferences tracking (for analytics)
CREATE TABLE IF NOT EXISTS theme_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL,
    theme TEXT NOT NULL,             -- 'light', 'dark', or 'system'
    resolved_theme TEXT NOT NULL,    -- 'light' or 'dark' (actual display)
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Language preferences tracking (for analytics)
CREATE TABLE IF NOT EXISTS language_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL,
    language TEXT NOT NULL,          -- 'en' or 'fr'
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Device type tracking (for analytics) - tracks seconds per device type
CREATE TABLE IF NOT EXISTS device_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    device_type TEXT NOT NULL,       -- 'mobile' or 'desktop'
    seconds INTEGER DEFAULT 0,       -- Total seconds spent on this device type
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, device_type)
);

-- First visitor reward tracking (one-time reward for first user to reach 5 visits)
CREATE TABLE IF NOT EXISTS first_visitor_reward (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    user_name TEXT NOT NULL,
    user_email TEXT NOT NULL,
    selected_company TEXT NOT NULL,  -- Ticker chosen by the winner
    claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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

-- Chess goals (keyed by chess username, no auth required)
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

-- Per-month chess archive cache (completed months never change)
CREATE TABLE IF NOT EXISTS monthly_archive_cache (
    username TEXT NOT NULL,
    archive_url TEXT NOT NULL,
    games_json TEXT NOT NULL,
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (username, archive_url)
);

-- Coach students table
CREATE TABLE IF NOT EXISTS coach_students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    coach_user_id INTEGER NOT NULL,
    student_name TEXT NOT NULL,
    timezone TEXT DEFAULT 'UTC',
    currency TEXT,                           -- e.g. 'USD', 'EUR', NULL=not set
    source TEXT,                             -- origin platform: 'chess.com', 'lichess', 'superprof', 'my website'
    chesscom_username TEXT,                  -- chess.com username
    lichess_username TEXT,                   -- lichess username
    recurring_day INTEGER,                   -- 0=Mon .. 6=Sun, NULL=no recurring
    recurring_time TEXT,                     -- 'HH:MM' in coach's TZ, NULL=no recurring
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Lesson packs (prepaid bundles of N lessons)
CREATE TABLE IF NOT EXISTS coach_packs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    total_lessons INTEGER NOT NULL,
    lessons_done INTEGER DEFAULT 0,
    lessons_paid INTEGER DEFAULT 0,
    price REAL,
    currency TEXT,
    source TEXT,
    note TEXT,
    status TEXT DEFAULT 'active',            -- 'active' | 'completed'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES coach_students(id) ON DELETE CASCADE
);

-- Individual lessons
CREATE TABLE IF NOT EXISTS coach_lessons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    scheduled_at TIMESTAMP NOT NULL,
    duration_minutes INTEGER DEFAULT 60,
    status TEXT DEFAULT 'scheduled',          -- 'scheduled', 'completed', 'cancelled', 'rescheduled'
    paid INTEGER DEFAULT 0,                   -- 0=unpaid, 1=paid
    pack_id INTEGER,                          -- links lesson to a pack (credit consumed)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES coach_students(id) ON DELETE CASCADE,
    FOREIGN KEY (pack_id) REFERENCES coach_packs(id) ON DELETE SET NULL
);

-- API usage tracking (Gemini calls for scoresheet/diagram reading)
CREATE TABLE IF NOT EXISTS api_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,                       -- NULL for unauthenticated requests
    request_id TEXT,                       -- Groups model calls from one feature invocation
    feature TEXT NOT NULL,                 -- 'scoresheet', 'reread', 'diagram'
    model_id TEXT NOT NULL,                -- e.g. 'gemini-3-flash-preview'
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    thinking_tokens INTEGER DEFAULT 0,
    billing_tier TEXT DEFAULT 'paid',     -- 'free' or 'paid'
    elapsed_seconds INTEGER DEFAULT 0,
    error TEXT,                            -- NULL if successful
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
CREATE INDEX IF NOT EXISTS idx_graph_downloads_user_id ON graph_downloads(user_id);
CREATE INDEX IF NOT EXISTS idx_theme_usage_user_id ON theme_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_language_usage_user_id ON language_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_device_usage_user_id ON device_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_created ON api_usage(created_at);
CREATE INDEX IF NOT EXISTS idx_api_usage_feature ON api_usage(feature);
CREATE INDEX IF NOT EXISTS idx_coach_students_coach ON coach_students(coach_user_id);
CREATE INDEX IF NOT EXISTS idx_coach_students_active ON coach_students(coach_user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_coach_packs_student ON coach_packs(student_id);
CREATE INDEX IF NOT EXISTS idx_coach_lessons_student ON coach_lessons(student_id);
CREATE INDEX IF NOT EXISTS idx_coach_lessons_scheduled ON coach_lessons(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_coach_lessons_pack ON coach_lessons(pack_id);
