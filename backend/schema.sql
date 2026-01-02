-- Users table (Google OAuth data)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_id TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    picture TEXT,
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
