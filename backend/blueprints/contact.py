"""Public contact form endpoint — submissions email rose.louis.mail@gmail.com."""

import logging
import re
import time
from collections import deque
from threading import Lock

from flask import Blueprint, jsonify, request

from email_utils import send_contact_email

logger = logging.getLogger(__name__)

contact_bp = Blueprint('contact', __name__)

EMAIL_RE = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')

_RATE_WINDOW_S = 60
_RATE_MAX = 5
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


@contact_bp.route('/api/contact', methods=['POST'])
def submit_contact():
    ip = request.headers.get('X-Forwarded-For', request.remote_addr or '').split(',')[0].strip()
    if _rate_limited(ip):
        return jsonify({'error': 'Too many requests, please try again later.'}), 429

    data = request.get_json(silent=True) or {}

    if (data.get('website') or '').strip():
        return jsonify({'ok': True}), 200

    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip()
    company = (data.get('company') or '').strip()
    message = (data.get('message') or '').strip()

    if not name or len(name) > 100:
        return jsonify({'error': 'Invalid name'}), 400
    if not email or not EMAIL_RE.match(email) or len(email) > 200:
        return jsonify({'error': 'Invalid email'}), 400
    if len(company) > 100:
        return jsonify({'error': 'Invalid company'}), 400
    if len(message) < 5 or len(message) > 3000:
        return jsonify({'error': 'Message must be between 5 and 3000 characters'}), 400

    sent = send_contact_email(name=name, email=email, company=company, message=message)
    if not sent:
        return jsonify({'error': 'Email service unavailable'}), 503

    return jsonify({'ok': True}), 200
