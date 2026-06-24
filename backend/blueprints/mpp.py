"""MPP (Mon Petit Prono) sub-app — private, owner-only.

Mon Petit Prono has no public API, but its web/mobile clients talk to a JSON
API at api.mpp.football, authenticated with an Auth0 (Ligue 1 SSO) bearer
token. We never see the owner's password: they paste a *refresh token* once
(extracted from their logged-in MPP session), we store it, and the backend
exchanges it for short-lived access tokens to read their data.

Flow:
  POST /api/mpp/connect     {refresh_token}  -> validate + store
  GET  /api/mpp/status                       -> {connected}
  GET  /api/mpp/data                          -> live ranking/points/leagues
  POST /api/mpp/disconnect                    -> forget the token

Token rotation is enabled on MPP's side, so each refresh returns a new refresh
token which we persist. The access token (~24h) is cached to avoid rotating
the refresh token on every page load. All endpoints are owner-gated.
"""

import logging
from datetime import datetime, timedelta

import requests
from flask import Blueprint, jsonify, request

from auth import get_current_user
from blueprints.auth_utils import owner_required
from database import get_db

logger = logging.getLogger(__name__)

mpp_bp = Blueprint('mpp', __name__)

# Public PKCE client (no secret) — same values the MPP web bundle ships with.
MPP_API = 'https://api.mpp.football'
TOKEN_URL = 'https://connect.ligue1.fr/oauth/token'
CLIENT_ID = 'grX5jWGWWQ4Uq91oe7KPNDZ96FS3jr0X'

# Refresh a little early so a request never races the expiry boundary.
_EXPIRY_MARGIN = timedelta(seconds=120)


# ── Token plumbing ───────────────────────────────────────────────────────────

def _refresh_access_token(conn, user_id, refresh_token):
    """Exchange a refresh token for a fresh access token, persisting the
    rotated refresh token. Returns the access token, or None on failure."""
    try:
        resp = requests.post(TOKEN_URL, json={
            'grant_type': 'refresh_token',
            'client_id': CLIENT_ID,
            'refresh_token': refresh_token,
        }, timeout=15)
    except requests.RequestException as exc:
        logger.warning('MPP token refresh request failed: %s', exc)
        return None

    if resp.status_code != 200:
        logger.warning('MPP token refresh rejected (%s): %s', resp.status_code, resp.text[:200])
        return None

    data = resp.json()
    access = data.get('access_token')
    if not access:
        return None
    # Rotation: a new refresh token is returned; fall back to the old one if not.
    new_refresh = data.get('refresh_token') or refresh_token
    expires_at = datetime.utcnow() + timedelta(seconds=int(data.get('expires_in', 3600)))

    conn.execute(
        """UPDATE mpp_account
           SET refresh_token = ?, access_token = ?, access_expires_at = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE user_id = ?""",
        (new_refresh, access, expires_at, user_id),
    )
    return access


def _get_access_token(conn, user_id):
    """Return a usable access token for the owner, refreshing if needed.
    Returns None when the account isn't connected or the refresh fails."""
    row = conn.execute(
        'SELECT refresh_token, access_token, access_expires_at FROM mpp_account WHERE user_id = ?',
        (user_id,),
    ).fetchone()
    if not row:
        return None

    if row['access_token'] and row['access_expires_at'] \
            and row['access_expires_at'] > datetime.utcnow() + _EXPIRY_MARGIN:
        return row['access_token']

    return _refresh_access_token(conn, user_id, row['refresh_token'])


def _api_get(token, path, params=None):
    """GET an MPP API endpoint with the bearer token."""
    return requests.get(
        MPP_API + path,
        headers={'Authorization': f'Bearer {token}', 'Accept': 'application/json'},
        params=params,
        timeout=20,
    )


# ── Endpoints ────────────────────────────────────────────────────────────────

@mpp_bp.route('/api/mpp/status', methods=['GET'])
@owner_required
def mpp_status():
    """Whether the owner has connected an MPP account."""
    user_id = get_current_user()
    with get_db() as conn:
        row = conn.execute(
            'SELECT updated_at FROM mpp_account WHERE user_id = ?', (user_id,)
        ).fetchone()
    return jsonify({
        'connected': bool(row),
        'updated_at': row['updated_at'].isoformat() if row and row['updated_at'] else None,
    })


@mpp_bp.route('/api/mpp/connect', methods=['POST'])
@owner_required
def mpp_connect():
    """Store a pasted refresh token after validating it with a live refresh."""
    user_id = get_current_user()
    refresh_token = (request.get_json(silent=True) or {}).get('refresh_token', '').strip()
    if not refresh_token:
        return jsonify({'error': 'Missing refresh_token'}), 400

    with get_db() as conn:
        # Upsert the token first so _refresh_access_token can persist the rotation.
        conn.execute(
            """INSERT INTO mpp_account (user_id, refresh_token)
               VALUES (?, ?)
               ON CONFLICT (user_id)
               DO UPDATE SET refresh_token = EXCLUDED.refresh_token,
                             access_token = NULL, access_expires_at = NULL,
                             updated_at = CURRENT_TIMESTAMP""",
            (user_id, refresh_token),
        )
        access = _refresh_access_token(conn, user_id, refresh_token)
        if not access:
            # Don't keep a token we couldn't validate.
            conn.execute('DELETE FROM mpp_account WHERE user_id = ?', (user_id,))
            return jsonify({'error': 'That refresh token was rejected by MPP. '
                                     'Make sure you copied the whole token from a '
                                     'logged-in session.'}), 400

    return jsonify({'connected': True})


@mpp_bp.route('/api/mpp/disconnect', methods=['POST'])
@owner_required
def mpp_disconnect():
    """Forget the stored token."""
    user_id = get_current_user()
    with get_db() as conn:
        conn.execute('DELETE FROM mpp_account WHERE user_id = ?', (user_id,))
    return jsonify({'connected': False})


@mpp_bp.route('/api/mpp/data', methods=['GET'])
@owner_required
def mpp_data():
    """Fetch the owner's live MPP data (leagues, ranking, points)."""
    user_id = get_current_user()
    with get_db() as conn:
        token = _get_access_token(conn, user_id)

    if token is None:
        # Either not connected, or the refresh token is no longer valid.
        with get_db() as conn:
            connected = bool(conn.execute(
                'SELECT 1 FROM mpp_account WHERE user_id = ?', (user_id,)
            ).fetchone())
        return jsonify({
            'error': 'token_expired' if connected else 'not_connected',
        }), 409

    resp = _api_get(token, '/user-contests')
    if resp.status_code == 401:
        return jsonify({'error': 'token_expired'}), 409
    if resp.status_code != 200:
        logger.warning('MPP /user-contests failed (%s): %s', resp.status_code, resp.text[:200])
        return jsonify({'error': 'mpp_unavailable', 'status': resp.status_code}), 502

    payload = resp.json()
    return jsonify({'contests': _normalize_contests(payload)})


@mpp_bp.route('/api/mpp/standings', methods=['GET'])
@owner_required
def mpp_standings():
    """Full league leaderboard for a challenge, paginating until complete."""
    user_id = get_current_user()
    challenge_id = request.args.get('challengeId', '').strip()
    if not challenge_id:
        return jsonify({'error': 'missing_challenge'}), 400

    with get_db() as conn:
        token = _get_access_token(conn, user_id)
    if token is None:
        return jsonify({'error': 'not_connected'}), 409

    standings, offset, page = [], 0, 100
    me_user_id, total = None, None
    for _ in range(50):  # safety cap (5000 players)
        resp = _api_get(token, '/challenge-standings/users-standings',
                        params={'challengeId': challenge_id, 'offset': offset, 'limit': page})
        if resp.status_code == 401:
            return jsonify({'error': 'token_expired'}), 409
        if resp.status_code != 200:
            logger.warning('MPP standings failed (%s): %s', resp.status_code, resp.text[:200])
            return jsonify({'error': 'mpp_unavailable', 'status': resp.status_code}), 502

        data = resp.json()
        total = data.get('usersQuantity')
        me_user_id = (data.get('userRanking') or {}).get('userId') or me_user_id
        standings.extend(_normalize_standing(s) for s in data.get('standings', []))
        if not data.get('hasNext'):
            break
        offset += page

    return jsonify({'standings': standings, 'me_user_id': me_user_id, 'total': total})


# ── Shaping ──────────────────────────────────────────────────────────────────

def _normalize_contests(payload):
    """Flatten contestsCards[] into the fields the UI shows. Falls back across
    a couple of key spellings so a minor MPP rename does not blank the card."""
    cards = payload.get('contestsCards') or []
    out = []
    for c in cards:
        out.append({
            'id': c.get('contestId') or c.get('id'),
            'title': c.get('title') or c.get('name'),
            'ranking': c.get('userRanking') or c.get('ranking'),
            'points': c.get('userTotalPoints') or c.get('points'),
            'participants': c.get('totalUsers') or c.get('participantsCount'),
            'image_url': c.get('imageUrl') or c.get('championshipLogoUrl'),
            'season': c.get('season'),
            'is_live': c.get('isLive'),
        })
    return out


def _normalize_standing(s):
    """One leaderboard row: the player plus their forecast counters."""
    u = s.get('user') or {}
    r = s.get('ranking') or {}
    return {
        'user_id': u.get('id'),
        'username': u.get('username') or u.get('firstName'),
        'avatar_url': u.get('avatarUrl'),
        'level': u.get('level'),
        'rank': r.get('rank'),
        'points': r.get('points'),
        'good': r.get('goodForecasts'),
        'exact': r.get('exactForecasts'),
    }
