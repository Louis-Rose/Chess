-- Users table (Google OAuth data)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_id TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    picture TEXT,
    is_admin INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL,
    chess_username TEXT,
    preferred_time_class TEXT DEFAULT 'rapid',
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

-- Portfolio transactions table (investing app)
-- Each row represents a BUY or SELL transaction
CREATE TABLE IF NOT EXISTS portfolio_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    account_id INTEGER,                  -- Reference to investment_accounts (nullable for legacy data)
    stock_ticker TEXT NOT NULL,
    transaction_type TEXT NOT NULL,     -- 'BUY' or 'SELL'
    quantity INTEGER NOT NULL,
    transaction_date TEXT NOT NULL,     -- Date of transaction (YYYY-MM-DD)
    price_per_share REAL NOT NULL,      -- Price per share at transaction date (USD)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (account_id) REFERENCES investment_accounts(id) ON DELETE SET NULL
);

-- Historical stock prices cache (shared across all users)
CREATE TABLE IF NOT EXISTS historical_prices (
    ticker TEXT NOT NULL,
    date TEXT NOT NULL,              -- YYYY-MM-DD
    close_price REAL NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ticker, date)
);

-- Historical FX rates cache (shared across all users)
CREATE TABLE IF NOT EXISTS historical_fx_rates (
    pair TEXT NOT NULL,              -- e.g., 'EURUSD'
    date TEXT NOT NULL,              -- YYYY-MM-DD
    rate REAL NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (pair, date)
);

-- Investment accounts table (PEA, CTO, Assurance-vie, etc.)
CREATE TABLE IF NOT EXISTS investment_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,                   -- User-defined name (e.g., "PEA Boursorama")
    account_type TEXT NOT NULL,           -- 'PEA', 'PEA-PME', 'CTO', 'ASSURANCE_VIE'
    bank TEXT NOT NULL,                   -- 'BOURSORAMA', 'FORTUNEO', 'BOURSE_DIRECT', etc.
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Watchlist table (investing app)
CREATE TABLE IF NOT EXISTS watchlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    stock_ticker TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, stock_ticker)
);

-- Earnings watchlist table (for tracking earnings of stocks not in portfolio)
CREATE TABLE IF NOT EXISTS earnings_watchlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    stock_ticker TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, stock_ticker)
);

-- Earnings dates cache (shared across all users, refreshed daily via lazy loading)
CREATE TABLE IF NOT EXISTS earnings_cache (
    ticker TEXT PRIMARY KEY,
    next_earnings_date TEXT,           -- YYYY-MM-DD or NULL if unknown
    date_confirmed INTEGER DEFAULT 0,  -- 1 if confirmed, 0 if estimated
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User activity tracking (for time spent analytics)
CREATE TABLE IF NOT EXISTS user_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    activity_date TEXT NOT NULL,  -- YYYY-MM-DD
    minutes INTEGER DEFAULT 0,
    last_ping TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, activity_date)
);

-- Earnings alert preferences (email notifications)
CREATE TABLE IF NOT EXISTS earnings_alert_preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL,
    weekly_enabled INTEGER DEFAULT 0,     -- 1 if weekly summary enabled
    days_before_enabled INTEGER DEFAULT 0, -- 1 if X-days-before alerts enabled
    days_before INTEGER DEFAULT 7,        -- Number of days before earnings
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Graph downloads tracking (for analytics)
CREATE TABLE IF NOT EXISTS graph_downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    graph_type TEXT NOT NULL,             -- 'composition', 'performance', etc.
    downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Stock search/view tracking (for analytics)
CREATE TABLE IF NOT EXISTS stock_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    stock_ticker TEXT NOT NULL,
    view_date TEXT NOT NULL,              -- YYYY-MM-DD
    view_count INTEGER DEFAULT 1,         -- Number of views that day
    time_spent_seconds INTEGER DEFAULT 0, -- Time spent viewing that day
    last_viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, stock_ticker, view_date)
);

-- YouTube videos cache for news feed (refreshed periodically)
CREATE TABLE IF NOT EXISTS youtube_videos_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id TEXT UNIQUE NOT NULL,
    channel_id TEXT NOT NULL,
    channel_name TEXT NOT NULL,
    title TEXT NOT NULL,
    thumbnail_url TEXT,
    published_at TEXT NOT NULL,           -- ISO timestamp
    view_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Track when each channel was last fetched
CREATE TABLE IF NOT EXISTS youtube_channel_fetch_log (
    channel_id TEXT PRIMARY KEY,
    last_fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
