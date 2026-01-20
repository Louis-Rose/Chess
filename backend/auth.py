import os
import jwt
import hashlib
import secrets
from datetime import datetime, timedelta
from functools import wraps
from flask import request, jsonify, make_response
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from database import get_db

# Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'dev-secret-change-in-production')
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID')
ACCESS_TOKEN_EXPIRES = timedelta(minutes=15)
REFRESH_TOKEN_EXPIRES = timedelta(days=7)
IS_PRODUCTION = os.environ.get('FLASK_ENV') == 'prod'


def create_access_token(user_id: int) -> str:
    """Create a short-lived access token."""
    payload = {
        'user_id': user_id,
        'exp': datetime.utcnow() + ACCESS_TOKEN_EXPIRES,
        'type': 'access'
    }
    return jwt.encode(payload, JWT_SECRET, algorithm='HS256')


def create_refresh_token(user_id: int) -> tuple:
    """Create a refresh token and store its hash."""
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    expires_at = datetime.utcnow() + REFRESH_TOKEN_EXPIRES

    with get_db() as conn:
        conn.execute(
            'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
            (user_id, token_hash, expires_at)
        )

    return token, token_hash


def verify_google_token(token: str) -> dict:
    """Verify Google ID token and return user info."""
    try:
        idinfo = id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            GOOGLE_CLIENT_ID
        )
        return {
            'google_id': idinfo['sub'],
            'email': idinfo['email'],
            'name': idinfo.get('name'),
            'picture': idinfo.get('picture')
        }
    except ValueError as e:
        print(f"Google token verification failed: {e}")
        return None


def _insert_demo_portfolio(user_id: int, conn, force: bool = False):
    """Insert demo portfolio data into database (internal helper)."""
    # Always check if user already has a demo portfolio
    cursor = conn.execute(
        "SELECT id FROM investment_accounts WHERE user_id = ? AND name = 'Demo Portfolio'",
        (user_id,)
    )
    if cursor.fetchone():
        return False  # User already has demo portfolio, skip

    if not force:
        # Check if user already has transactions
        cursor = conn.execute(
            'SELECT COUNT(*) as count FROM portfolio_transactions WHERE user_id = ?',
            (user_id,)
        )
        if cursor.fetchone()['count'] > 0:
            return False  # User already has transactions, skip

    # Create a demo investment account
    cursor = conn.execute('''
        INSERT INTO investment_accounts (user_id, name, account_type, bank)
        VALUES (?, 'Demo Portfolio', 'CTO', 'OTHER')
        RETURNING id
    ''', (user_id,))
    account_id = cursor.fetchone()['id']

    # Demo transactions: 5 US stocks + 5 French stocks
    # Total ~$10,000 USD + ~€10,000 EUR ≈ €20,000
    demo_transactions = [
        # US Stocks (prices in USD from 2022-2023)
        ('AAPL', 12, '2022-03-15', 155.00),    # ~$1,860
        ('MSFT', 8, '2022-06-20', 260.00),     # ~$2,080
        ('GOOGL', 18, '2023-01-10', 95.00),    # ~$1,710
        ('AMZN', 15, '2022-11-08', 102.00),    # ~$1,530
        ('NVDA', 12, '2023-04-18', 275.00),    # ~$3,300
        # French Stocks (prices in EUR from 2022-2023)
        ('MC.PA', 2, '2022-05-12', 620.00),    # ~€1,240
        ('OR.PA', 6, '2023-02-22', 365.00),    # ~€2,190
        ('TTE.PA', 35, '2022-08-30', 52.00),   # ~€1,820
        ('AIR.PA', 18, '2023-03-14', 115.00),  # ~€2,070
        ('SAN.PA', 30, '2022-10-05', 82.00),   # ~€2,460
    ]

    for ticker, quantity, date, price in demo_transactions:
        conn.execute('''
            INSERT INTO portfolio_transactions
            (user_id, account_id, stock_ticker, transaction_type, quantity, transaction_date, price_per_share)
            VALUES (?, ?, ?, 'BUY', ?, ?, ?)
        ''', (user_id, account_id, ticker, quantity, date, price))

    return True


def create_demo_portfolio(user_id: int, conn=None, force: bool = False):
    """Create a demo portfolio with 10 stocks (~€20,000 total) for a user."""
    if conn is not None:
        # Use provided connection (within existing transaction)
        return _insert_demo_portfolio(user_id, conn, force)
    else:
        # Create new connection
        with get_db() as new_conn:
            return _insert_demo_portfolio(user_id, new_conn, force)


def get_or_create_user(google_user: dict) -> int:
    """Get existing user or create new one, return user_id."""
    with get_db() as conn:
        # Try to find existing user
        cursor = conn.execute(
            'SELECT id FROM users WHERE google_id = ?',
            (google_user['google_id'],)
        )
        row = cursor.fetchone()

        if row:
            # Update user info and increment sign-in count
            conn.execute('''
                UPDATE users SET email = ?, name = ?, picture = ?, sign_in_count = sign_in_count + 1, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (google_user['email'], google_user['name'], google_user['picture'], row['id']))
            return row['id']

        # Create new user with sign_in_count = 1
        cursor = conn.execute('''
            INSERT INTO users (google_id, email, name, picture, sign_in_count)
            VALUES (?, ?, ?, ?, 1)
            RETURNING id
        ''', (google_user['google_id'], google_user['email'], google_user['name'], google_user['picture']))
        user_id = cursor.fetchone()['id']

        # Create default preferences
        conn.execute('''
            INSERT INTO user_preferences (user_id) VALUES (?)
        ''', (user_id,))

        # Create demo portfolio for new user
        create_demo_portfolio(user_id, conn)

        return user_id


def set_auth_cookies(response, access_token: str, refresh_token: str):
    """Set HTTP-only cookies for tokens."""
    response.set_cookie(
        'access_token',
        access_token,
        httponly=True,
        secure=IS_PRODUCTION,
        samesite='Lax',
        max_age=int(ACCESS_TOKEN_EXPIRES.total_seconds())
    )
    response.set_cookie(
        'refresh_token',
        refresh_token,
        httponly=True,
        secure=IS_PRODUCTION,
        samesite='Lax',
        max_age=int(REFRESH_TOKEN_EXPIRES.total_seconds()),
        path='/api/auth'
    )


def clear_auth_cookies(response):
    """Clear authentication cookies."""
    response.delete_cookie('access_token')
    response.delete_cookie('refresh_token', path='/api/auth')


def get_current_user():
    """Extract user from access token cookie. Returns None if not authenticated."""
    token = request.cookies.get('access_token')
    if not token:
        return None

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
        if payload.get('type') != 'access':
            return None
        return payload.get('user_id')
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def login_required(f):
    """Decorator for endpoints that require authentication."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user_id = get_current_user()
        if user_id is None:
            return jsonify({'error': 'Authentication required'}), 401
        request.user_id = user_id
        return f(*args, **kwargs)
    return decorated_function


def login_optional(f):
    """Decorator for endpoints where auth is optional."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        request.user_id = get_current_user()
        return f(*args, **kwargs)
    return decorated_function


def admin_required(f):
    """Decorator for endpoints that require admin privileges."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user_id = get_current_user()
        if user_id is None:
            return jsonify({'error': 'Authentication required'}), 401

        # Check if user is admin
        with get_db() as conn:
            cursor = conn.execute('SELECT is_admin FROM users WHERE id = ?', (user_id,))
            row = cursor.fetchone()
            if not row or not row['is_admin']:
                return jsonify({'error': 'Admin privileges required'}), 403

        request.user_id = user_id
        return f(*args, **kwargs)
    return decorated_function
