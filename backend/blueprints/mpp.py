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

import concurrent.futures
import logging
import threading
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

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

# An "MPP day" runs 04:00 -> 04:00 US Eastern. The 2026 World Cup is played in
# the US/Canada/Mexico and late kickoffs can finish around 01:00 ET, so cutting
# at 04:00 ET keeps each day's matches on the day they were played. ZoneInfo
# handles the EST/EDT switch automatically.
_EASTERN = ZoneInfo('America/New_York')
_DAY_CUTOFF_HOURS = 4


def _mpp_day():
    """Today's MPP day as a date, cut at 04:00 US Eastern."""
    return (datetime.now(_EASTERN) - timedelta(hours=_DAY_CUTOFF_HOURS)).date()


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


def _api_json(token, path):
    """GET + parse JSON. Returns (data|None, status_code|None)."""
    try:
        resp = _api_get(token, path)
    except requests.RequestException as exc:
        logger.warning('MPP GET %s failed: %s', path, exc)
        return None, None
    if resp.status_code == 200:
        return resp.json(), 200
    return None, resp.status_code


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


def _load_standings(token, challenge_id):
    """Fetch the full league leaderboard, paginating until complete.
    Returns ({standings, me_user_id, total}, 200) or (None, status_code)."""
    standings, offset, page = [], 0, 100
    me_user_id, total = None, None
    for _ in range(50):  # safety cap (5000 players)
        resp = _api_get(token, '/challenge-standings/users-standings',
                        params={'challengeId': challenge_id, 'offset': offset, 'limit': page})
        if resp.status_code != 200:
            logger.warning('MPP standings failed (%s): %s', resp.status_code, resp.text[:200])
            return None, resp.status_code

        data = resp.json()
        total = data.get('usersQuantity')
        me_user_id = (data.get('userRanking') or {}).get('userId') or me_user_id
        standings.extend(_normalize_standing(s) for s in data.get('standings', []))
        if not data.get('hasNext'):
            break
        offset += page

    return {'standings': standings, 'me_user_id': me_user_id, 'total': total}, 200


def _snapshot_standings(user_id, challenge_id, result):
    """Record today's points/rank per player (one row per player per MPP day)
    and remember the owner's own MPP user id for later highlighting."""
    day = _mpp_day()
    with get_db() as conn:
        if result['me_user_id']:
            conn.execute('UPDATE mpp_account SET mpp_user_id = ? WHERE user_id = ?',
                         (result['me_user_id'], user_id))
        for s in result['standings']:
            if s['user_id'] is None:
                continue
            conn.execute(
                """INSERT INTO mpp_standings_history
                       (challenge_id, user_id, snapshot_date, username, points, rank)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT (challenge_id, user_id, snapshot_date)
                   DO UPDATE SET username = EXCLUDED.username,
                                 points = EXCLUDED.points,
                                 rank = EXCLUDED.rank""",
                (challenge_id, s['user_id'], day, s['username'], s['points'], s['rank']),
            )


@mpp_bp.route('/api/mpp/standings', methods=['GET'])
@owner_required
def mpp_standings():
    """Full league leaderboard for a challenge."""
    user_id = get_current_user()
    challenge_id = request.args.get('challengeId', '').strip()
    if not challenge_id:
        return jsonify({'error': 'missing_challenge'}), 400

    with get_db() as conn:
        token = _get_access_token(conn, user_id)
    if token is None:
        return jsonify({'error': 'not_connected'}), 409

    result, status = _load_standings(token, challenge_id)
    if status == 401:
        return jsonify({'error': 'token_expired'}), 409
    if result is None:
        return jsonify({'error': 'mpp_unavailable', 'status': status}), 502

    _snapshot_standings(user_id, challenge_id, result)
    return jsonify(result)


@mpp_bp.route('/api/mpp/history', methods=['GET'])
@owner_required
def mpp_history():
    """Daily points-per-player series for charting. We only have data from the
    first day this was viewed onward (MPP exposes no historical standings), so
    each visit snapshots today and the series grows one tick per day."""
    user_id = get_current_user()
    challenge_id = request.args.get('challengeId', '').strip()
    if not challenge_id:
        return jsonify({'error': 'missing_challenge'}), 400

    with get_db() as conn:
        token = _get_access_token(conn, user_id)
        has_today = conn.execute(
            "SELECT 1 FROM mpp_standings_history "
            "WHERE challenge_id = ? AND snapshot_date = ? LIMIT 1",
            (challenge_id, _mpp_day()),
        ).fetchone()
        mpp_user_id = (conn.execute(
            'SELECT mpp_user_id FROM mpp_account WHERE user_id = ?', (user_id,)
        ).fetchone() or {}).get('mpp_user_id')

    # Make sure today has a data point even if the leaderboard wasn't opened.
    if not has_today and token is not None:
        result, status = _load_standings(token, challenge_id)
        if result is not None:
            _snapshot_standings(user_id, challenge_id, result)
            mpp_user_id = result['me_user_id'] or mpp_user_id

    with get_db() as conn:
        rows = conn.execute(
            """SELECT user_id, username, snapshot_date, points
               FROM mpp_standings_history
               WHERE challenge_id = ?
               ORDER BY snapshot_date ASC""",
            (challenge_id,),
        ).fetchall()

    return jsonify(_build_history(rows, mpp_user_id))


def _build_history(rows, me_user_id):
    """Pivot snapshot rows into recharts-friendly data: one row per date with a
    column per player, plus the player list ordered by their latest points."""
    by_date = {}        # date -> {user_id: points}
    names = {}          # user_id -> latest username
    latest_points = {}  # user_id -> most recent points (rows are date-ascending)
    for r in rows:
        d = r['snapshot_date'].isoformat()
        by_date.setdefault(d, {})[r['user_id']] = r['points']
        names[r['user_id']] = r['username']
        latest_points[r['user_id']] = r['points']

    users = sorted(names, key=lambda u: latest_points.get(u) or 0, reverse=True)
    data_rows = []
    for d in sorted(by_date):
        row = {'date': d}
        for u in users:
            row[u] = by_date[d].get(u)
        data_rows.append(row)

    return {
        'rows': data_rows,
        'users': [{'id': u, 'name': names[u]} for u in users],
        'me_user_id': me_user_id,
    }


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


# ── Match detail & cotes ─────────────────────────────────────────────────────
# Shared plumbing for reading a match's teams and MPP "cote" (the 1/N/2 reward
# points), used by the Matches tab snapshots. MPP exposes no bulk match endpoint,
# so we expand the championship calendar into per-match detail calls. Those calls
# are rate-limited (bursts get throttled), so we keep concurrency low, retry, and
# cache hard: club names and finished matches never change, so in steady state we
# only re-read the handful of live/upcoming matches.

_CREST_BASE = 'https://s3.eu-west-1.amazonaws.com/image.mpg'
_FINAL_TTL = 24 * 3600   # a finished match never changes
_LIVE_TTL = 90           # live/upcoming detail (scores, cotes) — refresh often

_clubs_lock = threading.Lock()
_clubs_cache = {}        # club_id -> {name, short, crest}  (real teams only)
_match_lock = threading.Lock()
_match_cache = {}        # match_id -> (raw_detail, fetched_at)


def _resolve_club(token, club_id):
    """A club's {name, short, crest}, or None when it's an unresolved
    placeholder (e.g. a knockout slot whose team isn't known yet)."""
    if not club_id:
        return None
    with _clubs_lock:
        if club_id in _clubs_cache:
            return _clubs_cache[club_id]

    data, _ = _api_json(token, f'/championship-club/{club_id}')
    name = (data or {}).get('name') or {}
    label = name.get('fr-FR') or name.get('en-GB')
    if not label:
        return None  # placeholder — don't cache; it may resolve later

    # Prefer MPP's own logo URL; some teams (e.g. national sides) aren't at the
    # constructed {num}.png path, so fall back to that only if none is given.
    num = club_id.rsplit('_', 1)[-1]
    logo = ((data or {}).get('defaultAssets') or {}).get('logo') or {}
    crest = logo.get('small') or logo.get('medium') or logo.get('large') \
        or f'{_CREST_BASE}/{num}.png'
    info = {'name': label, 'short': (data or {}).get('shortName'), 'crest': crest}
    with _clubs_lock:
        _clubs_cache[club_id] = info
    return info


def _fetch_match(token, match_id, force=False):
    """A match's raw detail, cached. Finished matches are cached for a day,
    others briefly. Retries a few times to ride out rate-limiting. Pass
    force=True to bypass the cache (used by a manual Tests re-fetch)."""
    now = time.time()
    with _match_lock:
        cached = _match_cache.get(match_id)
    if cached and not force:
        raw, ts = cached
        ttl = _FINAL_TTL if raw.get('period') == 'fullTime' else _LIVE_TTL
        if now - ts < ttl:
            return raw

    for attempt in range(3):
        data, status = _api_json(token, f'/championship-match/{match_id}')
        if data is not None:
            with _match_lock:
                _match_cache[match_id] = (data, now)
            return data
        if status == 401:
            return None
        time.sleep(0.3 * (attempt + 1))
    return None


def _owner_contest(token):
    """The owner's contest card (championship id, contest id, game-week range)."""
    contests, _ = _api_json(token, '/user-contests')
    cards = (contests or {}).get('contestsCards') or []
    return next((c for c in cards if c.get('championshipId')), None)


def _match_detail(token, raw):
    """The cote and MPP prono split for one match, shaped for a Tests snapshot.
    Reuses the same raw detail the calendar scan already fetched and cached."""
    home_raw = raw.get('home') or {}
    away_raw = raw.get('away') or {}
    home = _resolve_club(token, home_raw.get('clubId')) or {}
    away = _resolve_club(token, away_raw.get('clubId')) or {}

    q = raw.get('quotations') or {}
    cote = {'home': q.get('home'), 'draw': q.get('draw'), 'away': q.get('away')} \
        if q.get('home') is not None else None

    bets = (raw.get('stats') or {}).get('bets') or {}
    prono = {'home': bets.get('home'), 'draw': bets.get('draw'), 'away': bets.get('away')} \
        if bets else None

    period = raw.get('period')
    if period == 'fullTime':
        status = 'final'
    elif home_raw.get('score') is not None or away_raw.get('score') is not None:
        status = 'live'
    else:
        status = 'upcoming'

    return {
        'id': raw.get('id'),
        'date': raw.get('date'),
        'status': status,
        'home': {'name': home.get('name'), 'crest': home.get('crest'), 'score': home_raw.get('score')},
        'away': {'name': away.get('name'), 'crest': away.get('crest'), 'score': away_raw.get('score')},
        'cote': cote,
        'bets': prono,            # Stats Prono MPP: share of players on each result
    }


# ── Matches tab: cote/prono drift over time ──────────────────────────────────
# Every upcoming fixture of the owner's competition. Each manual fetch records
# the live cotes (1/N/2 reward points) and prono split of all matches not yet
# kicked off, so the table shows how they move as kickoff approaches. The UI
# groups the rows day by day, starting from today.


def _upcoming_match_ids(token):
    """Ids of every not-yet-played match of the owner's competition, so the
    Matches tab can track them all, day by day, from today on."""
    card = _owner_contest(token)
    champ_id = card.get('championshipId') if card else None
    if not champ_id:
        return []

    cal, _ = _api_json(token, f'/championship-calendar/{champ_id}')
    game_weeks = (cal or {}).get('gameWeeks') or {}
    ids = []
    for key in sorted(game_weeks, key=lambda k: int(k)):
        ids.extend(game_weeks[key].get('matchesIds') or [])

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        raws = list(pool.map(lambda mid: _fetch_match(token, mid), ids))

    upcoming = []
    for raw in raws:
        if not raw:
            continue
        home_raw, away_raw = raw.get('home') or {}, raw.get('away') or {}
        if raw.get('period') == 'fullTime':
            continue  # already played
        if home_raw.get('score') is not None or away_raw.get('score') is not None:
            continue  # live or played
        if not _resolve_club(token, home_raw.get('clubId')) \
                or not _resolve_club(token, away_raw.get('clubId')):
            continue  # teams not drawn yet
        upcoming.append(raw.get('id'))
    return upcoming


def _snapshot_test_matches(token):
    """Record one cote/prono row per upcoming match, all sharing one batch_at so
    the round forms a single fetch column. force=True bypasses the match cache so
    a manual re-fetch always reads live values."""
    match_ids = _upcoming_match_ids(token)
    batch = datetime.utcnow()
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        raws = list(pool.map(lambda mid: _fetch_match(token, mid, force=True), match_ids))

    count = 0
    for raw in raws:
        if not raw:
            continue
        detail = _match_detail(token, raw)
        cote = detail.get('cote') or {}
        bets = detail.get('bets') or {}
        with get_db() as conn:
            conn.execute(
                """INSERT INTO mpp_cote_history
                       (match_id, batch_at, home_team, away_team,
                        home_crest, away_crest, match_date, status,
                        cote_home, cote_draw, cote_away,
                        prono_home, prono_draw, prono_away)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (detail['id'], batch, detail['home']['name'], detail['away']['name'],
                 detail['home'].get('crest'), detail['away'].get('crest'),
                 detail.get('date'), detail.get('status'),
                 cote.get('home'), cote.get('draw'), cote.get('away'),
                 bets.get('home'), bets.get('draw'), bets.get('away')),
            )
        count += 1
    return count


def _tests_payload():
    """Pivot stored snapshots into a matches-by-fetches table: a list of fetch
    columns (batches, oldest first) and a row per watched match holding the
    cote/prono cell for each batch."""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT match_id, batch_at, home_team, away_team,
                      home_crest, away_crest, match_date, status,
                      cote_home, cote_draw, cote_away,
                      prono_home, prono_draw, prono_away
               FROM mpp_cote_history
               ORDER BY batch_at ASC"""
        ).fetchall()

    def _iso(v):
        return v.isoformat() if hasattr(v, 'isoformat') else v

    columns, matches = {}, {}
    for r in rows:
        batch = _iso(r['batch_at'])
        columns[batch] = True
        m = matches.get(r['match_id'])
        if m is None:
            m = matches[r['match_id']] = {'match_id': r['match_id'], 'cells': {}}
        # Carry the latest known meta forward (rows are batch-ascending).
        m['home'], m['away'] = r['home_team'], r['away_team']
        m['home_crest'], m['away_crest'] = r['home_crest'], r['away_crest']
        m['date'], m['status'] = r['match_date'], r['status']
        m['cells'][batch] = {
            'cote': {'home': r['cote_home'], 'draw': r['cote_draw'], 'away': r['cote_away']},
            'prono': {'home': r['prono_home'], 'draw': r['prono_draw'], 'away': r['prono_away']},
        }

    ordered = sorted(matches.values(), key=lambda m: (m['date'] is None, m['date'] or ''))
    return {'columns': sorted(columns), 'matches': ordered}


@mpp_bp.route('/api/mpp/tests', methods=['GET'])
@owner_required
def mpp_tests():
    """All recorded cote/prono snapshots for the watched matches."""
    return jsonify(_tests_payload())


@mpp_bp.route('/api/mpp/tests/fetch', methods=['POST'])
@owner_required
def mpp_tests_fetch():
    """Fetch the watched matches' cotes + prono now, store a snapshot each, and
    return the full updated history."""
    user_id = get_current_user()
    with get_db() as conn:
        token = _get_access_token(conn, user_id)
    if token is None:
        with get_db() as conn:
            connected = bool(conn.execute(
                'SELECT 1 FROM mpp_account WHERE user_id = ?', (user_id,)
            ).fetchone())
        return jsonify({'error': 'token_expired' if connected else 'not_connected'}), 409

    try:
        _snapshot_test_matches(token)
    except Exception:
        logger.exception('MPP test snapshot failed')
        return jsonify({'error': 'mpp_unavailable'}), 502
    return jsonify(_tests_payload())


@mpp_bp.route('/api/mpp/tests/batch', methods=['DELETE'])
@owner_required
def mpp_tests_delete_batch():
    """Remove one fetch column (all rows sharing a batch_at)."""
    batch_at = request.args.get('batchAt', '').strip()
    if not batch_at:
        return jsonify({'error': 'missing_batch'}), 400
    try:
        when = datetime.fromisoformat(batch_at)
    except ValueError:
        return jsonify({'error': 'bad_batch'}), 400
    with get_db() as conn:
        conn.execute('DELETE FROM mpp_cote_history WHERE batch_at = ?', (when,))
    return jsonify(_tests_payload())


# ── Daily snapshot scheduler ─────────────────────────────────────────────────
# MPP has no historical-standings endpoint, so a point only exists for a day if
# we recorded it. This in-process scheduler snapshots every connected account's
# leagues hourly, so each MPP day gets its final standings near the 04:00 ET cut
# even on days the page isn't opened. Writes are idempotent (upsert keyed by the
# MPP day), so running across multiple gunicorn workers is harmless.

def _fetch_contest_ids(token):
    """Challenge ids for the account, from /user-contests."""
    resp = _api_get(token, '/user-contests')
    if resp.status_code != 200:
        return []
    cards = (resp.json() or {}).get('contestsCards') or []
    return [c.get('contestId') for c in cards if c.get('contestId')]


def run_snapshot_cycle():
    """Snapshot every connected account's leagues. Safe to call repeatedly."""
    with get_db() as conn:
        accounts = [row['user_id'] for row in
                    conn.execute('SELECT user_id FROM mpp_account').fetchall()]

    for uid in accounts:
        try:
            with get_db() as conn:
                token = _get_access_token(conn, uid)
            if not token:
                continue
            for challenge_id in _fetch_contest_ids(token):
                result, _ = _load_standings(token, challenge_id)
                if result is not None:
                    _snapshot_standings(uid, challenge_id, result)
        except Exception:
            logger.exception('MPP snapshot cycle failed for user %s', uid)


def _scheduler_loop(interval_seconds):
    while True:
        try:
            run_snapshot_cycle()
        except Exception:
            logger.exception('MPP scheduler tick failed')
        time.sleep(interval_seconds)


def start_scheduler(interval_seconds=3600):
    """Launch the snapshot loop on a daemon thread (call once at startup)."""
    thread = threading.Thread(
        target=_scheduler_loop, args=(interval_seconds,),
        name='mpp-snapshot', daemon=True,
    )
    thread.start()
    logger.info('MPP snapshot scheduler started (every %ss)', interval_seconds)
