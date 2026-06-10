"""
config.py — centralised configuration loading.

All tunables and secrets live in the `.env` file (see `.env.example`). This
module reads them once at import time, validates the essentials, and exposes a
single immutable `Config` object that every other module imports.

The daemon writes into LUMNA's existing PostgreSQL database (the same DB the web
backend reads from to render the public /music page), so the database settings
mirror the backend's DB_* environment variables.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

# Resolve paths relative to THIS file so the daemon behaves the same no matter
# which working directory systemd (or the user) launches it from.
PROJECT_ROOT = Path(__file__).resolve().parent

# Load the .env file sitting next to this module into the process environment.
load_dotenv(PROJECT_ROOT / ".env")


class ConfigError(RuntimeError):
    """Raised when a required configuration value is missing or invalid."""


def _require(name: str) -> str:
    """Fetch a mandatory environment variable or fail loudly and early."""
    value = os.getenv(name, "").strip()
    if not value:
        raise ConfigError(
            f"Missing required environment variable '{name}'. "
            f"Copy .env.example to .env and fill it in."
        )
    return value


def _optional(name: str, default: str) -> str:
    """Fetch an optional environment variable, falling back to a default."""
    value = os.getenv(name, "").strip()
    return value or default


@dataclass(frozen=True)
class DatabaseConfig:
    """PostgreSQL connection settings (mirrors the LUMNA backend)."""

    host: str
    port: int
    name: str
    user: str
    password: str

    def dsn_kwargs(self) -> dict:
        """Keyword args for psycopg2.connect()."""
        return {
            "host": self.host,
            "port": self.port,
            "dbname": self.name,
            "user": self.user,
            "password": self.password,
        }


@dataclass(frozen=True)
class Config:
    """Immutable snapshot of all runtime configuration."""

    # ── Spotify OAuth credentials ────────────────────────────────────────────
    client_id: str
    client_secret: str
    redirect_uri: str
    refresh_token: str

    # ── Daemon behaviour ─────────────────────────────────────────────────────
    poll_interval_seconds: int
    min_play_ms: int
    min_completion: float
    backoff_base_seconds: float
    backoff_max_seconds: float

    # ── Storage ──────────────────────────────────────────────────────────────
    database: DatabaseConfig

    @staticmethod
    def load(
        require_refresh_token: bool = True,
        require_database: bool = True,
    ) -> "Config":
        """
        Build a Config from the environment.

        `require_refresh_token` is False during the one-time auth bootstrap,
        because that is the very step that produces the refresh token.

        `require_database` is False during that same bootstrap, which runs on a
        laptop that has the Spotify credentials but not the VM's DB password.
        """
        return Config(
            client_id=_require("SPOTIFY_CLIENT_ID"),
            client_secret=_require("SPOTIFY_CLIENT_SECRET"),
            redirect_uri=_optional(
                "SPOTIFY_REDIRECT_URI", "http://127.0.0.1:8888/callback"
            ),
            refresh_token=(
                _require("SPOTIFY_REFRESH_TOKEN")
                if require_refresh_token
                else _optional("SPOTIFY_REFRESH_TOKEN", "")
            ),
            poll_interval_seconds=int(_optional("POLL_INTERVAL_SECONDS", "30")),
            min_play_ms=int(_optional("MIN_PLAY_MS", "30000")),
            min_completion=float(_optional("MIN_COMPLETION", "0.80")),
            backoff_base_seconds=float(_optional("BACKOFF_BASE_SECONDS", "5")),
            backoff_max_seconds=float(_optional("BACKOFF_MAX_SECONDS", "300")),
            database=DatabaseConfig(
                host=_optional("DB_HOST", "localhost"),
                port=int(_optional("DB_PORT", "5432")),
                name=_optional("DB_NAME", "lumna"),
                user=_optional("DB_USER", "lumna"),
                password=(
                    _require("DB_PASSWORD")
                    if require_database
                    else _optional("DB_PASSWORD", "")
                ),
            ),
        )


# Spotify scope required to read the current playback state from /v1/me/player.
SPOTIFY_SCOPE = "user-read-playback-state user-read-currently-playing"
