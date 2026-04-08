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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Messages (coach-student chat)
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
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
