#!/usr/bin/env python3
"""One-off CLI: recompute every exercise's working weight under the current rule.

Run on the VM from the backend dir, with the prod env:

    cd ~/Chess/backend && FLASK_ENV=prod ./venv/bin/python backfill_work_weights.py

The work-weight rule changed (heaviest working set over the 3 most recent
finished sessions). Stored values are normally refreshed only when a session is
finished, so already-stored values keep the old rule until the exercise is done
again. This backfills every existing (user, exercise) pair in one pass. It is
idempotent — safe to run more than once.
"""
import os

from dotenv import load_dotenv

load_dotenv(f".env.{os.environ.get('FLASK_ENV', 'prod')}")

from database import get_db                        # noqa: E402  (env must load first)
from blueprints.fit import _recompute_work_weight  # noqa: E402


def backfill():
    with get_db() as conn:
        pairs = conn.execute(
            """SELECT DISTINCT s.user_id, ss.exercise
               FROM fit_sessions s
               JOIN fit_session_sets ss ON ss.session_id = s.id
               WHERE s.ended_at IS NOT NULL"""
        ).fetchall()
        for r in pairs:
            _recompute_work_weight(conn, r['user_id'], r['exercise'])
    return len(pairs)


if __name__ == '__main__':
    n = backfill()
    print(f"Recomputed working weight for {n} (user, exercise) pairs.")
