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
            # Update user info
            conn.execute('''
                UPDATE users SET email = ?, name = ?, picture = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (google_user['email'], google_user['name'], google_user['picture'], row['id']))
            return row['id']

        # Create new user
        cursor = conn.execute('''
            INSERT INTO users (google_id, email, name, picture)
            VALUES (?, ?, ?, ?)
        ''', (google_user['google_id'], google_user['email'], google_user['name'], google_user['picture']))
        user_id = cursor.lastrowid

        # Create default preferences
        conn.execute('''
            INSERT INTO user_preferences (user_id) VALUES (?)
        ''', (user_id,))

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
