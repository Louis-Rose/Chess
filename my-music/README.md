# My Music

A lightweight, always-on daemon that listens to your personal Spotify playback
and builds a permanent **memory trace** of everything you listen to. It writes
into LUMNA's PostgreSQL database, and the trace is surfaced publicly at
**[lumna.co/music](https://lumna.co/music)**.

It polls Spotify's `GET /v1/me/player` every 30 seconds, tracks the in-progress
song with a small state machine, and logs a play **only** once it has been
actively played for ≥ 30 seconds or has passed 80% completion — so skips and
previews never pollute your history.

## How it works

```
   ┌──────────────┐  poll every 30s   ┌─────────────────────┐
   │  tracker.py  │ ────────────────► │  Spotify Web API     │
   │ state machine│ ◄──────────────── │  GET /v1/me/player   │
   └──────┬───────┘  playback state   └─────────────────────┘
          │ on track change / stop: validate the finished track
          ▼
   ┌─────────────────────────────┐        ┌──────────────────────┐
   │  LUMNA PostgreSQL           │ ◄───── │  Flask /api/music     │
   │  music_artists / _albums /  │  read  │  → React /music page  │
   │  _tracks / _track_artists / │        └──────────────────────┘
   │  _plays                     │
   └─────────────────────────────┘
```

- **Media metadata** (`music_artists`, `music_albums`, `music_tracks`) is stored
  once and reused.
- **Interaction log** (`music_plays`) is append-only: one row per qualifying
  listen.
- The **schema is owned by the LUMNA backend** (`backend/schema_postgres.sql` +
  `database.py`). This daemon only writes rows; on a fresh deploy it waits for
  the backend to create the tables.

## Files

| File | Purpose |
|------|---------|
| `config.py`         | Loads & validates config from `.env` (Spotify + DB). |
| `db.py`             | PostgreSQL writer: idempotent upserts into `music_*`. |
| `spotify_client.py` | Spotify API client with automatic token refresh. |
| `tracker.py`        | The daemon: poll loop, state machine, commit logic. |
| `auth_setup.py`     | One-time browser login to mint the refresh token. |
| `my-music.service`  | systemd unit to run it on the VM. |

## Setup

### 1. Create a Spotify app

Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard),
create an app, and copy its **Client ID** and **Client Secret**. In the app
settings add this exact Redirect URI:

```
http://127.0.0.1:8888/callback
```

### 2. Install

```bash
cd my-music
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# edit .env: paste SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET, and the DB_*
# values (same as the LUMNA backend's .env.prod).
```

### 3. Authorise once (on a machine with a browser)

```bash
python auth_setup.py
```

This opens Spotify, you approve the scopes, and it writes
`SPOTIFY_REFRESH_TOKEN` into your `.env`. It does **not** need the DB password,
so you can run it on your laptop and copy the token to the VM.

### 4. Run

```bash
python tracker.py
```

You'll see lines like:

```
2026-06-10 09:31:02 INFO    logged Bohemian Rhapsody  (212s, 98%) [min_completion]
2026-06-10 09:31:32 INFO    skip   Some Track I Skipped (4s, 2%) — below threshold
```

## Deploy to the Azure VM (headless)

The VM never needs a browser — just the `refresh_token` from step 3. The daemon
and the LUMNA backend share the same PostgreSQL instance on the VM.

```bash
# On the VM:
git pull
cd my-music
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# copy your .env (Spotify creds + REFRESH_TOKEN) and set DB_* to match the
# backend. The backend must have started at least once so the music_* tables
# exist (the daemon will otherwise wait for them).

sudo cp my-music.service /etc/systemd/system/my-music.service
# edit User=/paths in the unit if needed
sudo systemctl daemon-reload
sudo systemctl enable --now my-music.service
journalctl -u my-music -f     # watch it run
```

## Querying your memory trace

The data lives in the `lumna` database:

```sql
-- Top 10 most-played tracks
SELECT t.name, COUNT(*) AS plays
FROM music_plays p JOIN music_tracks t ON t.id = p.track_id
GROUP BY t.id, t.name ORDER BY plays DESC LIMIT 10;

-- Everything you listened to today
SELECT p.played_at, t.name
FROM music_plays p JOIN music_tracks t ON t.id = p.track_id
WHERE p.played_at >= CURRENT_DATE
ORDER BY p.played_at;
```

…or just open **lumna.co/music**.

## Configuration reference

All values live in `.env` (see `.env.example`). Key knobs:

| Variable | Default | Meaning |
|----------|---------|---------|
| `POLL_INTERVAL_SECONDS` | `30`   | How often to poll Spotify. |
| `MIN_PLAY_MS`           | `30000`| Min active play time to log a track. |
| `MIN_COMPLETION`        | `0.80` | Or this fraction of the track reached. |
| `BACKOFF_BASE_SECONDS`  | `5`    | Initial backoff on errors. |
| `BACKOFF_MAX_SECONDS`   | `300`  | Backoff ceiling. |
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | localhost / 5432 / lumna / lumna / — | LUMNA PostgreSQL connection. |
