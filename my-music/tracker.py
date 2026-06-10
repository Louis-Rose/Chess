"""
tracker.py — the background daemon and its playback state machine.

What it does, in one breath: every POLL_INTERVAL seconds it asks Spotify "what
am I playing right now?", tracks the in-progress track in memory, and the moment
the track changes (or playback stops) it decides whether the *previous* track
was listened to "for real" and, if so, writes exactly one row to the `plays`
log.

State machine
─────────────
We keep a single in-memory `Session` describing the track we are currently
observing. On each poll:

    ┌─ nothing playing ──────────────► finalize current session, clear it
    │
    ├─ same track as current ────────► extend session (update max progress)
    │
    └─ different track ──────────────► finalize current session,
                                       start a new session for the new track

"Finalize" runs the validation logic and commits the play if it qualifies. A
session is finalized exactly once, which is what guarantees there are no
duplicate log entries for a single continuous listen.
"""

from __future__ import annotations

import logging
import signal
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from config import Config
from db import (
    connect,
    insert_play,
    link_track_artist,
    schema_ready,
    upsert_album,
    upsert_artist,
    upsert_track,
)
from spotify_client import (
    SpotifyAuthError,
    SpotifyClient,
    SpotifyTransientError,
)

log = logging.getLogger("my-music")


def _utc_now_iso() -> str:
    """Current UTC time as a compact ISO8601 string, e.g. 2026-06-10T09:30:00Z."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


@dataclass
class Session:
    """
    In-memory record of the track we are currently observing.

    We do not write anything until the session is finalized, so a momentary
    glance at a track (skipped after two seconds) never reaches the database.
    """

    track: dict[str, Any]            # the full Spotify `item` object
    started_at: str                  # ISO8601 UTC when we first saw it
    start_progress_ms: int           # playback position at first sight
    max_progress_ms: int             # furthest position observed so far

    @property
    def track_id(self) -> str:
        return self.track["id"]

    @property
    def duration_ms(self) -> int:
        # Guard against the (rare) zero duration to avoid div-by-zero later.
        return max(int(self.track.get("duration_ms") or 0), 1)

    @property
    def ms_played(self) -> int:
        """
        How much of the track was actually listened to. Using the progress
        delta (rather than wall-clock) means a paused-and-resumed track is
        measured by real playback position, and skipping ahead doesn't
        over-count.
        """
        return max(self.max_progress_ms - self.start_progress_ms, 0)

    @property
    def completion(self) -> float:
        """Fraction of the track reached, clamped to [0, 1]."""
        return min(self.max_progress_ms / self.duration_ms, 1.0)

    def observe(self, progress_ms: int) -> None:
        """Update the furthest position we've seen for this session."""
        self.max_progress_ms = max(self.max_progress_ms, progress_ms)


class PlaybackTracker:
    """Owns the poll loop, the current Session, and the commit decision."""

    def __init__(self, config: Config, client: SpotifyClient) -> None:
        self._config = config
        self._client = client
        self._session: Optional[Session] = None
        self._running = True

    # ── Validation ───────────────────────────────────────────────────────────

    def _qualifies(self, session: Session) -> Optional[str]:
        """
        Decide whether a finished session deserves a row in `plays`.

        Returns the reason string if it qualifies, or None if it should be
        discarded (a skip / brief preview).
        """
        if session.ms_played >= self._config.min_play_ms:
            return "min_play_ms"
        if session.completion >= self._config.min_completion:
            return "min_completion"
        return None

    # ── Commit ───────────────────────────────────────────────────────────────

    def _finalize(self, session: Session) -> None:
        """Validate a finished session and, if it qualifies, persist it once."""
        reason = self._qualifies(session)
        track_name = session.track.get("name", "<unknown>")

        if reason is None:
            log.info(
                "skip   %-40s (%.0fs, %.0f%%) — below threshold",
                track_name[:40],
                session.ms_played / 1000,
                session.completion * 100,
            )
            return

        try:
            self._persist(session, reason)
            log.info(
                "logged %-40s (%.0fs, %.0f%%) [%s]",
                track_name[:40],
                session.ms_played / 1000,
                session.completion * 100,
                reason,
            )
        except Exception as exc:  # noqa: BLE001 — never let a DB hiccup crash us
            # Losing one play is acceptable; crashing the daemon is not.
            log.error("failed to persist play for '%s': %s", track_name, exc)

    def _persist(self, session: Session, reason: str) -> None:
        """
        Write the media metadata (idempotently) and append the play row, all in
        one transaction so the log never references a half-written track.
        """
        track = session.track

        # Spotify "local files" have no IDs and cannot be normalised — skip.
        if not track.get("id"):
            log.info("skip local/unidentified track '%s'", track.get("name"))
            return

        album = track.get("album") or {}
        album_id = album.get("id")
        artists = [a for a in track.get("artists", []) if a.get("id")]

        with connect(self._config.database) as conn:
            with conn.cursor() as cur:
                # 1) Album (a track references at most one album).
                if album_id:
                    images = album.get("images") or []
                    image_url = images[0]["url"] if images else None
                    upsert_album(
                        cur,
                        album_id,
                        album.get("name", "<unknown>"),
                        album.get("release_date"),
                        image_url,
                    )

                # 2) Track.
                upsert_track(
                    cur,
                    track["id"],
                    track.get("name", "<unknown>"),
                    album_id,
                    int(track.get("duration_ms") or 0),
                )

                # 3) Artists + the many-to-many links.
                for artist in artists:
                    upsert_artist(cur, artist["id"], artist.get("name", "<unknown>"))
                    link_track_artist(cur, track["id"], artist["id"])

                # 4) The interaction log entry itself.
                insert_play(
                    cur,
                    track_id=track["id"],
                    played_at=session.started_at,
                    ended_at=_utc_now_iso(),
                    ms_played=session.ms_played,
                    completion_pct=round(session.completion, 4),
                    committed_reason=reason,
                )

    # ── State transitions ────────────────────────────────────────────────────

    def _handle_state(self, state: Optional[dict[str, Any]]) -> None:
        """Apply one poll result to the state machine."""
        item = state.get("item") if state else None
        progress_ms = int(state.get("progress_ms") or 0) if state else 0

        # Case A: nothing playing (no device, or a non-track item like a
        # podcast episode we choose not to track). Finalize whatever we had.
        if not item or not item.get("id"):
            if self._session is not None:
                self._finalize(self._session)
                self._session = None
            return

        track_id = item["id"]

        # Case B: same track still playing — extend the current session.
        if self._session is not None and self._session.track_id == track_id:
            self._session.track = item  # refresh metadata (cheap, keeps it current)
            self._session.observe(progress_ms)
            return

        # Case C: the track changed (or we had nothing). Finalize the old one,
        # then begin observing the new one.
        if self._session is not None:
            self._finalize(self._session)

        self._session = Session(
            track=item,
            started_at=_utc_now_iso(),
            start_progress_ms=progress_ms,
            max_progress_ms=progress_ms,
        )
        log.debug("now observing '%s'", item.get("name"))

    # ── Startup ──────────────────────────────────────────────────────────────

    def _await_schema(self) -> None:
        """
        Block until the web backend has created the music_* tables. The backend
        owns the DDL, so on a fresh deploy the daemon may start first; we wait
        rather than racing it (or duplicating the schema definition).
        """
        while self._running:
            try:
                if schema_ready(self._config.database):
                    return
                log.warning(
                    "music tables not found yet — waiting for the LUMNA "
                    "backend to initialise the schema..."
                )
            except Exception as exc:  # noqa: BLE001 — DB may not be up yet
                log.warning("cannot reach database yet: %s", exc)
            self._sleep(self._config.backoff_max_seconds)

    # ── Main loop ────────────────────────────────────────────────────────────

    def run(self) -> None:
        """Poll forever (until SIGINT/SIGTERM), with graceful error backoff."""
        self._await_schema()
        log.info(
            "My Music tracker started — polling every %ss, db=%s/%s",
            self._config.poll_interval_seconds,
            self._config.database.host,
            self._config.database.name,
        )

        backoff = self._config.backoff_base_seconds

        while self._running:
            try:
                state = self._client.get_playback_state()
                self._handle_state(state)

                # A clean poll resets the backoff to its base value.
                backoff = self._config.backoff_base_seconds
                self._sleep(self._config.poll_interval_seconds)

            except SpotifyTransientError as exc:
                # 5xx / network / rate-limit: log, back off, keep going.
                log.warning("transient error: %s — backing off %.0fs", exc, backoff)
                self._sleep(backoff)
                backoff = min(backoff * 2, self._config.backoff_max_seconds)

            except SpotifyAuthError as exc:
                # Credentials problem: retrying tightly is pointless. Back off
                # hard but stay alive in case it's a temporary account blip.
                log.error("auth error: %s — backing off %.0fs", exc, self._config.backoff_max_seconds)
                self._sleep(self._config.backoff_max_seconds)

            except Exception as exc:  # noqa: BLE001 — last-resort safety net
                log.exception("unexpected error: %s — continuing", exc)
                self._sleep(backoff)
                backoff = min(backoff * 2, self._config.backoff_max_seconds)

        # On shutdown, finalize the in-progress track so we don't lose it.
        if self._session is not None:
            log.info("shutting down — finalizing current track")
            self._finalize(self._session)
            self._session = None

    def _sleep(self, seconds: float) -> None:
        """
        Sleep in short slices so a shutdown signal is honoured promptly instead
        of waiting out a full poll interval.
        """
        deadline = time.monotonic() + seconds
        while self._running and time.monotonic() < deadline:
            time.sleep(min(1.0, deadline - time.monotonic()))

    def stop(self, *_: Any) -> None:
        """Signal handler: ask the loop to exit at the next opportunity."""
        log.info("stop requested")
        self._running = False


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-7s %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    config = Config.load()
    client = SpotifyClient(
        client_id=config.client_id,
        client_secret=config.client_secret,
        refresh_token=config.refresh_token,
    )
    tracker = PlaybackTracker(config, client)

    # Wire up clean shutdown for both Ctrl-C and `systemctl stop`.
    signal.signal(signal.SIGINT, tracker.stop)
    signal.signal(signal.SIGTERM, tracker.stop)

    tracker.run()


if __name__ == "__main__":
    main()
