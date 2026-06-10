"""
spotify_client.py — thin Spotify Web API client with automatic token refresh.

The headless daemon never logs in interactively. Instead it holds a long-lived
`refresh_token` (minted once by `auth_setup.py`) and exchanges it for a
short-lived access token whenever needed. This module hides that dance behind a
simple `get_playback_state()` call.

Errors are deliberately split into two kinds so the daemon can react sensibly:
  - SpotifyAuthError      -> credentials/refresh problem; not worth retrying blindly
  - SpotifyTransientError -> 5xx / network blip; back off and try again
"""

from __future__ import annotations

import time
from typing import Any, Optional

import requests

TOKEN_URL = "https://accounts.spotify.com/api/token"
PLAYER_URL = "https://api.spotify.com/v1/me/player"

# Refresh the access token this many seconds BEFORE it actually expires, so a
# request never races the expiry boundary.
TOKEN_REFRESH_SKEW_SECONDS = 60

# Per-request network timeout (connect, read) in seconds.
REQUEST_TIMEOUT = (10, 15)


class SpotifyAuthError(RuntimeError):
    """Authentication/authorisation failure (bad client creds or refresh token)."""


class SpotifyTransientError(RuntimeError):
    """A temporary failure (5xx, timeout, connection error) — safe to retry."""


class SpotifyClient:
    """
    Stateful client that caches a valid access token in memory and refreshes it
    on demand. One instance is shared for the lifetime of the daemon.
    """

    def __init__(
        self,
        client_id: str,
        client_secret: str,
        refresh_token: str,
    ) -> None:
        self._client_id = client_id
        self._client_secret = client_secret
        self._refresh_token = refresh_token

        # Cached access token and the wall-clock time (epoch seconds) at which
        # it should be considered expired.
        self._access_token: Optional[str] = None
        self._expires_at: float = 0.0

        # Reuse a single TCP session for keep-alive efficiency.
        self._session = requests.Session()

    # ── Token management ─────────────────────────────────────────────────────

    def _token_is_fresh(self) -> bool:
        """True if we hold a token that will still be valid after the skew."""
        return (
            self._access_token is not None
            and time.time() < self._expires_at - TOKEN_REFRESH_SKEW_SECONDS
        )

    def _refresh_access_token(self) -> None:
        """
        Exchange the stored refresh token for a fresh access token.

        Spotify *may* return a new refresh token in this response; if it does we
        adopt it for the rest of this process's lifetime.
        """
        try:
            resp = self._session.post(
                TOKEN_URL,
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": self._refresh_token,
                },
                auth=(self._client_id, self._client_secret),
                timeout=REQUEST_TIMEOUT,
            )
        except requests.RequestException as exc:
            # Network problem reaching the token endpoint — treat as transient.
            raise SpotifyTransientError(f"token refresh network error: {exc}") from exc

        if resp.status_code in (400, 401):
            # Bad/revoked credentials. Retrying won't help — surface clearly.
            raise SpotifyAuthError(
                f"token refresh rejected ({resp.status_code}): {resp.text}. "
                f"The refresh token may have been revoked; re-run auth_setup.py."
            )
        if resp.status_code >= 500:
            raise SpotifyTransientError(
                f"token endpoint server error ({resp.status_code})"
            )
        if resp.status_code != 200:
            raise SpotifyAuthError(
                f"unexpected token response ({resp.status_code}): {resp.text}"
            )

        payload = resp.json()
        self._access_token = payload["access_token"]
        # Default to Spotify's standard 3600s if the field is ever absent.
        expires_in = int(payload.get("expires_in", 3600))
        self._expires_at = time.time() + expires_in

        # Spotify occasionally rotates the refresh token.
        if payload.get("refresh_token"):
            self._refresh_token = payload["refresh_token"]

    def _ensure_token(self) -> str:
        """Return a valid access token, refreshing first if necessary."""
        if not self._token_is_fresh():
            self._refresh_access_token()
        assert self._access_token is not None  # guaranteed by refresh above
        return self._access_token

    # ── API calls ────────────────────────────────────────────────────────────

    def get_playback_state(self) -> Optional[dict[str, Any]]:
        """
        Fetch the current playback state from GET /v1/me/player.

        Returns:
            dict  — the playback state when something is active.
            None  — nothing is playing (HTTP 204: no active device).

        Raises:
            SpotifyAuthError      — unrecoverable auth failure.
            SpotifyTransientError — temporary failure; caller should back off.
        """
        token = self._ensure_token()

        try:
            resp = self._session.get(
                PLAYER_URL,
                headers={"Authorization": f"Bearer {token}"},
                timeout=REQUEST_TIMEOUT,
            )
        except requests.RequestException as exc:
            raise SpotifyTransientError(f"player request network error: {exc}") from exc

        # 204 = a valid "nothing is playing" answer, not an error.
        if resp.status_code == 204:
            return None

        if resp.status_code == 200:
            # An empty body can also mean "no active device".
            if not resp.content:
                return None
            return resp.json()

        # 401: token expired/invalid mid-flight. Force one refresh and retry once.
        if resp.status_code == 401:
            self._access_token = None
            token = self._ensure_token()
            retry = self._session.get(
                PLAYER_URL,
                headers={"Authorization": f"Bearer {token}"},
                timeout=REQUEST_TIMEOUT,
            )
            if retry.status_code == 204 or not retry.content:
                return None
            if retry.status_code == 200:
                return retry.json()
            if retry.status_code == 401:
                raise SpotifyAuthError("still unauthorised after token refresh")
            # fall through to shared handling below for the retry's status
            resp = retry

        # 429 = rate limited. Honour Retry-After but treat as transient.
        if resp.status_code == 429:
            retry_after = resp.headers.get("Retry-After", "?")
            raise SpotifyTransientError(f"rate limited (Retry-After={retry_after}s)")

        if resp.status_code >= 500:
            raise SpotifyTransientError(f"Spotify server error ({resp.status_code})")

        # Anything else is unexpected; treat as transient so we keep running.
        raise SpotifyTransientError(
            f"unexpected player response ({resp.status_code}): {resp.text[:200]}"
        )
