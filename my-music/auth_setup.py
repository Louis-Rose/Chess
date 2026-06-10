"""
auth_setup.py — ONE-TIME interactive bootstrap to mint a refresh token.

Run this once on a machine with a browser (your laptop, not the headless VM):

    python auth_setup.py

It will:
  1. Open the Spotify authorisation page so you can approve the scopes.
  2. Catch the redirect on a tiny local web server.
  3. Exchange the authorisation code for tokens.
  4. Save the long-lived `refresh_token` into your `.env`.

Afterwards, copy the `.env` (or just the SPOTIFY_REFRESH_TOKEN line) to the VM
and the daemon runs fully headless — it never needs a browser again.
"""

from __future__ import annotations

import base64
import sys
import urllib.parse
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Optional

import requests

from config import PROJECT_ROOT, SPOTIFY_SCOPE, Config

AUTHORIZE_URL = "https://accounts.spotify.com/authorize"
TOKEN_URL = "https://accounts.spotify.com/api/token"

# Filled in by the request handler once Spotify redirects back to us.
_received_code: Optional[str] = None
_received_error: Optional[str] = None


class _CallbackHandler(BaseHTTPRequestHandler):
    """Single-purpose handler that captures the ?code= from the redirect."""

    def do_GET(self) -> None:  # noqa: N802 — name mandated by BaseHTTPRequestHandler
        global _received_code, _received_error

        query = urllib.parse.urlparse(self.path).query
        params = urllib.parse.parse_qs(query)
        _received_code = params.get("code", [None])[0]
        _received_error = params.get("error", [None])[0]

        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        body = (
            "<h2>My Music</h2><p>Authorisation complete. "
            "You can close this tab and return to the terminal.</p>"
            if _received_code
            else f"<h2>My Music</h2><p>Authorisation failed: {_received_error}</p>"
        )
        self.wfile.write(body.encode("utf-8"))

    def log_message(self, *_: object) -> None:
        """Silence the default per-request stderr logging."""


def _parse_host_port(redirect_uri: str) -> tuple[str, int]:
    """Extract the host and port the local callback server must bind to."""
    parsed = urllib.parse.urlparse(redirect_uri)
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port or 8888
    return host, port


def _build_authorize_url(config: Config) -> str:
    """Construct the Spotify consent URL for the Authorization Code Flow."""
    params = {
        "client_id": config.client_id,
        "response_type": "code",
        "redirect_uri": config.redirect_uri,
        "scope": SPOTIFY_SCOPE,
        # Force the consent screen so re-running always yields a fresh grant.
        "show_dialog": "true",
    }
    return f"{AUTHORIZE_URL}?{urllib.parse.urlencode(params)}"


def _exchange_code_for_tokens(config: Config, code: str) -> dict:
    """Trade the one-time authorisation code for access + refresh tokens."""
    basic = base64.b64encode(
        f"{config.client_id}:{config.client_secret}".encode()
    ).decode()

    resp = requests.post(
        TOKEN_URL,
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": config.redirect_uri,
        },
        headers={"Authorization": f"Basic {basic}"},
        timeout=(10, 15),
    )
    if resp.status_code != 200:
        raise RuntimeError(
            f"token exchange failed ({resp.status_code}): {resp.text}"
        )
    return resp.json()


def _save_refresh_token(refresh_token: str) -> None:
    """
    Persist the refresh token into the .env file, replacing any existing line.
    Creates .env from .env.example if it does not exist yet.
    """
    env_path = PROJECT_ROOT / ".env"
    if not env_path.exists():
        example = PROJECT_ROOT / ".env.example"
        env_path.write_text(example.read_text() if example.exists() else "")

    lines = env_path.read_text().splitlines()
    key = "SPOTIFY_REFRESH_TOKEN"
    replaced = False
    for i, line in enumerate(lines):
        if line.strip().startswith(f"{key}="):
            lines[i] = f"{key}={refresh_token}"
            replaced = True
            break
    if not replaced:
        lines.append(f"{key}={refresh_token}")

    env_path.write_text("\n".join(lines) + "\n")
    print(f"\n✓ Saved {key} to {env_path}")


def main() -> None:
    # The refresh token is what we're about to create, so don't require it yet.
    # This runs on a laptop without the VM's DB password, so skip that too.
    config = Config.load(require_refresh_token=False, require_database=False)
    host, port = _parse_host_port(config.redirect_uri)

    auth_url = _build_authorize_url(config)
    print("Opening your browser to authorise My Music...")
    print(f"If it doesn't open, paste this URL manually:\n\n{auth_url}\n")
    webbrowser.open(auth_url)

    # Serve exactly one request: the redirect from Spotify.
    print(f"Waiting for the Spotify redirect on http://{host}:{port} ...")
    server = HTTPServer((host, port), _CallbackHandler)
    server.handle_request()
    server.server_close()

    if _received_error:
        print(f"\n✗ Authorisation was denied: {_received_error}")
        sys.exit(1)
    if not _received_code:
        print("\n✗ No authorisation code received.")
        sys.exit(1)

    print("Exchanging authorisation code for tokens...")
    tokens = _exchange_code_for_tokens(config, _received_code)

    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        print("\n✗ Spotify did not return a refresh token. Try again.")
        sys.exit(1)

    _save_refresh_token(refresh_token)
    print("\nAll set. You can now run the daemon:  python tracker.py")


if __name__ == "__main__":
    main()
