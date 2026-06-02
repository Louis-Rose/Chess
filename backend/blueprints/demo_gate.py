"""Demo gate — password check before accessing /app (chesscoaches)."""

import hmac
import logging
import os
import time
from collections import deque
from threading import Lock

from flask import Blueprint, jsonify, request

logger = logging.getLogger(__name__)

demo_gate_bp = Blueprint('demo_gate', __name__)

_RATE_WINDOW_S = 60
_RATE_MAX = 10
_rate_buckets: dict[str, deque[float]] = {}
_rate_lock = Lock()


def _rate_limited(ip: str) -> bool:
    now = time.monotonic()
    with _rate_lock:
        bucket = _rate_buckets.setdefault(ip, deque())
        while bucket and now - bucket[0] > _RATE_WINDOW_S:
            bucket.popleft()
        if len(bucket) >= _RATE_MAX:
            return True
        bucket.append(now)
        return False


@demo_gate_bp.route('/api/demo-gate', methods=['POST'])
def check_demo_password():
    ip = request.headers.get('X-Forwarded-For', request.remote_addr or '').split(',')[0].strip()
    if _rate_limited(ip):
        return jsonify({'error': 'Too many attempts, please wait a minute.'}), 429

    expected = os.environ.get('DEMO_GATE_PASSWORD', '')
    if not expected:
        logger.error('DEMO_GATE_PASSWORD is not configured')
        return jsonify({'error': 'Gate not configured'}), 503

    data = request.get_json(silent=True) or {}
    submitted = (data.get('password') or '').strip()

    if not submitted or not hmac.compare_digest(submitted, expected):
        return jsonify({'error': 'Incorrect password'}), 401

    return jsonify({'ok': True}), 200
