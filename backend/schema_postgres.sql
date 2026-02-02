-- PostgreSQL Schema for Lumna
-- Converted from SQLite schema.sql

-- Users table (Google OAuth data)
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE NOT NULL,
    chess_username TEXT,
    preferred_time_class TEXT DEFAULT 'rapid',
    dashboard_card_order TEXT,  -- JSON array of card IDs for custom order
    financial_card_order TEXT,  -- JSON array of financial metric card IDs
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Refresh tokens table (for token rotation security)
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id SERIAL PRIMARY KEY,
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
    player_data TEXT NOT NULL,
    stats_data TEXT NOT NULL,
    last_archive TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (username, time_class)
);

-- Investment accounts table (PEA, CTO, Assurance-vie, etc.)
-- Note: Must be created before portfolio_transactions due to foreign key
CREATE TABLE IF NOT EXISTS investment_accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    account_type TEXT NOT NULL,
    bank TEXT NOT NULL,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Portfolio transactions table (investing app)
CREATE TABLE IF NOT EXISTS portfolio_transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    account_id INTEGER,
    stock_ticker TEXT NOT NULL,
    transaction_type TEXT NOT NULL,
    quantity REAL NOT NULL,
    transaction_date TEXT NOT NULL,
    price_per_share REAL NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (account_id) REFERENCES investment_accounts(id) ON DELETE SET NULL
);

-- Historical stock prices cache
CREATE TABLE IF NOT EXISTS historical_prices (
    ticker TEXT NOT NULL,
    date TEXT NOT NULL,
    close_price REAL NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ticker, date)
);

-- Historical FX rates cache
CREATE TABLE IF NOT EXISTS historical_fx_rates (
    pair TEXT NOT NULL,
    date TEXT NOT NULL,
    rate REAL NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (pair, date)
);

-- Watchlist table
CREATE TABLE IF NOT EXISTS watchlist (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    stock_ticker TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, stock_ticker)
);

-- Earnings watchlist table
CREATE TABLE IF NOT EXISTS earnings_watchlist (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    stock_ticker TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, stock_ticker)
);

-- Earnings dates cache (refreshed every 48 hours)
CREATE TABLE IF NOT EXISTS earnings_cache (
    ticker TEXT PRIMARY KEY,
    next_earnings_date TEXT,
    date_confirmed INTEGER DEFAULT 0,
    earnings_time TEXT,                -- 'bmo' (before market open), 'amc' (after market close), or NULL
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User activity tracking
CREATE TABLE IF NOT EXISTS user_activity (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    activity_date TEXT NOT NULL,
    minutes INTEGER DEFAULT 0,
    last_ping TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, activity_date)
);

-- Page-level activity tracking
CREATE TABLE IF NOT EXISTS page_activity (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    page TEXT NOT NULL,
    minutes INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, page)
);

-- Earnings alert preferences
CREATE TABLE IF NOT EXISTS earnings_alert_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE NOT NULL,
    weekly_enabled INTEGER DEFAULT 0,
    days_before_enabled INTEGER DEFAULT 0,
    days_before INTEGER DEFAULT 7,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Graph downloads tracking
CREATE TABLE IF NOT EXISTS graph_downloads (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    graph_type TEXT NOT NULL,
    downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Stock views tracking
CREATE TABLE IF NOT EXISTS stock_views (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    stock_ticker TEXT NOT NULL,
    view_date TEXT NOT NULL,
    view_count INTEGER DEFAULT 1,
    time_spent_seconds INTEGER DEFAULT 0,
    last_viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, stock_ticker, view_date)
);

-- YouTube videos cache
CREATE TABLE IF NOT EXISTS youtube_videos_cache (
    id SERIAL PRIMARY KEY,
    video_id TEXT UNIQUE NOT NULL,
    channel_id TEXT NOT NULL,
    channel_name TEXT NOT NULL,
    title TEXT NOT NULL,
    thumbnail_url TEXT,
    published_at TEXT NOT NULL,
    view_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    description TEXT
);

-- YouTube channel fetch log
CREATE TABLE IF NOT EXISTS youtube_channel_fetch_log (
    channel_id TEXT PRIMARY KEY,
    last_fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Video transcripts cache
CREATE TABLE IF NOT EXISTS video_transcripts (
    video_id TEXT PRIMARY KEY,
    transcript TEXT,                 -- NULL if no transcript available
    has_transcript INTEGER DEFAULT 1, -- 0 if video has no transcript (don't retry)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Video transcript summaries cache
CREATE TABLE IF NOT EXISTS video_summaries (
    video_id TEXT PRIMARY KEY,
    summary TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Current video selection per company (only these videos need transcripts)
CREATE TABLE IF NOT EXISTS company_video_selections (
    ticker TEXT NOT NULL,
    video_id TEXT NOT NULL,
    selected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ticker, video_id)
);
CREATE INDEX IF NOT EXISTS idx_company_video_selections_video ON company_video_selections(video_id);

-- Video sync run tracking
CREATE TABLE IF NOT EXISTS video_sync_runs (
    id SERIAL PRIMARY KEY,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,
    status TEXT DEFAULT 'running',  -- 'running', 'completed', 'failed'
    tickers_count INTEGER DEFAULT 0,
    videos_total INTEGER DEFAULT 0,
    videos_processed INTEGER DEFAULT 0,
    transcripts_fetched INTEGER DEFAULT 0,
    summaries_generated INTEGER DEFAULT 0,
    errors INTEGER DEFAULT 0,
    current_video TEXT,  -- Currently processing video title
    error_message TEXT
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
    minutes INTEGER DEFAULT 0,
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

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_player_stats_cache_updated ON player_stats_cache(updated_at);
CREATE INDEX IF NOT EXISTS idx_portfolio_transactions_user_id ON portfolio_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_transactions_ticker ON portfolio_transactions(stock_ticker);
CREATE INDEX IF NOT EXISTS idx_historical_prices_date ON historical_prices(date);
CREATE INDEX IF NOT EXISTS idx_historical_fx_rates_date ON historical_fx_rates(date);
CREATE INDEX IF NOT EXISTS idx_watchlist_user_id ON watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_investment_accounts_user_id ON investment_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_transactions_account_id ON portfolio_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_earnings_watchlist_user_id ON earnings_watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_earnings_cache_updated ON earnings_cache(updated_at);
CREATE INDEX IF NOT EXISTS idx_user_activity_user_id ON user_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_earnings_alert_preferences_user_id ON earnings_alert_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_graph_downloads_user_id ON graph_downloads(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_views_user_id ON stock_views(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_views_ticker ON stock_views(stock_ticker);
CREATE INDEX IF NOT EXISTS idx_youtube_videos_channel ON youtube_videos_cache(channel_id);
CREATE INDEX IF NOT EXISTS idx_youtube_videos_published ON youtube_videos_cache(published_at);

-- Admin analytics indexes for faster aggregation queries
CREATE INDEX IF NOT EXISTS idx_user_activity_date ON user_activity(activity_date);
CREATE INDEX IF NOT EXISTS idx_page_activity_user_id ON page_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_theme_usage_user_id ON theme_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_language_usage_user_id ON language_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_device_usage_user_id ON device_usage(user_id);
