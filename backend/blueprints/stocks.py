"""Stocks sub-app — private big-tech earnings table.

Gated to the site owner via GYM_OWNER_EMAIL (reused as the single owner email).

Each cell shows quarterly growth vs. the same quarter 1y and 3y ago, pulled
live from each company's investor-relations press releases. Press-release URLs
follow predictable per-company patterns keyed by (quarter, fiscal_year), so
adding future quarters is just bumping CURRENT_QUARTER / CURRENT_FY.
"""

import logging
import os
import re
from datetime import datetime
from functools import lru_cache, wraps
from zoneinfo import ZoneInfo

import requests as http_requests
from flask import Blueprint, jsonify

from auth import get_current_user
from database import get_db

logger = logging.getLogger(__name__)

stocks_bp = Blueprint('stocks', __name__)


# ── Owner gate ───────────────────────────────────────────────────────────────

def owner_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        owner_email = os.environ.get('GYM_OWNER_EMAIL', '').strip().lower()
        if not owner_email:
            return jsonify({'error': 'Owner not configured'}), 500
        user_id = get_current_user()
        if user_id is None:
            return jsonify({'error': 'Authentication required'}), 401
        with get_db() as conn:
            row = conn.execute('SELECT email FROM users WHERE id = ?', (user_id,)).fetchone()
        if not row or (row['email'] or '').strip().lower() != owner_email:
            return jsonify({'error': 'Forbidden'}), 403
        return f(*args, **kwargs)
    return wrapper


@stocks_bp.route('/api/stocks/access', methods=['GET'])
def stocks_access():
    owner_email = os.environ.get('GYM_OWNER_EMAIL', '').strip().lower()
    user_id = get_current_user()
    if not owner_email or user_id is None:
        return jsonify({'allowed': False})
    with get_db() as conn:
        row = conn.execute('SELECT email FROM users WHERE id = ?', (user_id,)).fetchone()
    return jsonify({'allowed': bool(row and (row['email'] or '').strip().lower() == owner_email)})


# ── Press-release sources ────────────────────────────────────────────────────

NVIDIA_QUARTER_SLUGS = {
    1: 'first-quarter-fiscal',
    2: 'second-quarter-fiscal',
    3: 'third-quarter-fiscal',
    4: 'fourth-quarter-and-fiscal',  # Q4 release also covers the full year
}


def nvidia_press_url(quarter: int, fiscal_year: int) -> str:
    slug = NVIDIA_QUARTER_SLUGS[quarter]
    return (
        'https://nvidianews.nvidia.com/news/'
        f'nvidia-announces-financial-results-for-{slug}-{fiscal_year}'
    )


# Sentence-level matchers for Nvidia revenue lines in Q4 press releases.
#   TTM:       "For fiscal 2026, revenue was $215.9 billion, up 65% from a year ago."
#   Quarterly: "revenue for the fourth quarter ended January 25, 2026, of $68.1 billion, up ..."
_NVIDIA_FY_SENTENCE_RE = re.compile(
    r'For\s+fiscal\s+\d{4},\s+revenue\s+was\s+\$[\d.]+\s*billion[^.]*\.',
    re.IGNORECASE,
)
_NVIDIA_Q_SENTENCE_RE = re.compile(
    r'revenue\s+for\s+the\s+\w+\s+quarter\s+ended[^.]*\$[\d.]+\s*billion[^.]*\.',
    re.IGNORECASE,
)
_NVIDIA_AMOUNT_RE = re.compile(r'\$([\d.]+)\s*billion', re.IGNORECASE)


@lru_cache(maxsize=64)
def _fetch_nvidia_page(quarter: int, fiscal_year: int) -> tuple[str, str]:
    """Fetch and cache the press-release HTML. Returns (text, url)."""
    url = nvidia_press_url(quarter, fiscal_year)
    r = http_requests.get(url, timeout=15)
    r.raise_for_status()
    return r.text, url


def _fetch_nvidia_evidence(quarter: int, fiscal_year: int, mode: str) -> dict:
    """Returns {value, quote, url, label}. mode = 'ttm' | 'quarterly'."""
    if mode == 'ttm' and quarter != 4:
        raise NotImplementedError('TTM only implemented for Q4 releases so far')
    text, url = _fetch_nvidia_page(quarter, fiscal_year)
    if mode == 'ttm':
        regex = _NVIDIA_FY_SENTENCE_RE
        label = f'TTM FY{fiscal_year}'
    elif mode == 'quarterly':
        regex = _NVIDIA_Q_SENTENCE_RE
        label = f'Q{quarter} FY{fiscal_year}'
    else:
        raise ValueError(f'Unknown mode: {mode}')
    m = regex.search(text)
    if not m:
        raise ValueError(f'No {mode} revenue sentence found at {url}')
    quote = re.sub(r'\s+', ' ', m.group(0)).strip()
    if quote and quote[0].islower():
        quote = quote[0].upper() + quote[1:]
    num = _NVIDIA_AMOUNT_RE.search(quote)
    if not num:
        raise ValueError(f'Could not extract amount from quote at {url}')
    return {
        'value': float(num.group(1)),
        'quote': quote,
        'url': url,
        'label': label,
    }


def _safe_nvidia(quarter: int, fiscal_year: int, mode: str) -> dict | None:
    try:
        return _fetch_nvidia_evidence(quarter, fiscal_year, mode)
    except Exception as e:
        logger.warning('Nvidia %s revenue fetch failed (Q%d FY%d): %s', mode, quarter, fiscal_year, e)
        return None


# ── Data endpoint ────────────────────────────────────────────────────────────
#
# Bump these when a newer quarter is released. (Future: auto-detect.)
CURRENT_QUARTER = 4
CURRENT_FY = 2026

# "as of" date — today in Paris time, formatted like "May 11th, 2026".
_PARIS = ZoneInfo('Europe/Paris')


def _ordinal(n: int) -> str:
    if 10 <= n % 100 <= 20:
        suffix = 'th'
    else:
        suffix = {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')
    return f'{n}{suffix}'


def _as_of_label() -> str:
    now = datetime.now(_PARIS)
    return f'{now.strftime("%B")} {_ordinal(now.day)}, {now.year}'


def _build_growth_cell(cur: dict | None, one: dict | None, three: dict | None) -> dict | None:
    cell: dict = {}
    if cur and one:
        cell['oneY'] = (cur['value'] - one['value']) / one['value']
    if cur and three:
        cell['threeY'] = (cur['value'] - three['value']) / three['value']
    evidence = [e for e in (cur, one, three) if e]
    if cell and evidence:
        cell['evidence'] = evidence
        return cell
    return None


@stocks_bp.route('/api/stocks/data', methods=['GET'])
@owner_required
def stocks_data():
    """Growth metrics for each (company, metric) cell, in both TTM and quarterly modes.

    Returns: { asOf, data: { Company: { Metric: { ttm?, quarterly? } } } }
    Each mode's payload is { oneY?, threeY?, evidence: [...] }.
    Only Nvidia/Revenue is wired up so far.
    """
    data: dict[str, dict[str, dict]] = {}

    for mode in ('ttm', 'quarterly'):
        cur = _safe_nvidia(CURRENT_QUARTER, CURRENT_FY, mode)
        one = _safe_nvidia(CURRENT_QUARTER, CURRENT_FY - 1, mode)
        three = _safe_nvidia(CURRENT_QUARTER, CURRENT_FY - 3, mode)
        cell = _build_growth_cell(cur, one, three)
        if cell:
            data.setdefault('Nvidia', {}).setdefault('Revenue', {})[mode] = cell

    return jsonify({
        'asOf': _as_of_label(),
        'data': data,
    })
