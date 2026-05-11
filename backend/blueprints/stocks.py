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
from functools import lru_cache, wraps

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


# Matches the FULL sentence: "For fiscal <year>, revenue was $<N> billion[, up X% from a year ago]."
# Only present in Q4 press releases (which report the full year).
_NVIDIA_FY_REVENUE_SENTENCE_RE = re.compile(
    r'For\s+fiscal\s+\d{4},\s+revenue\s+was\s+\$[\d.]+\s*billion[^.]*\.',
    re.IGNORECASE,
)
_NVIDIA_AMOUNT_RE = re.compile(r'\$([\d.]+)\s*billion', re.IGNORECASE)


@lru_cache(maxsize=64)
def _fetch_nvidia_ttm_evidence(quarter: int, fiscal_year: int) -> dict:
    """Returns {value, quote, url, label} for the TTM revenue point.

    For Q4 releases, TTM = full-year revenue stated in the press release.
    Raises on failure. Cached per-process — press releases never change.
    """
    if quarter != 4:
        # TODO: sum the 4 most recent quarterly figures (requires parsing
        # quarterly revenue across two fiscal years).
        raise NotImplementedError('TTM only implemented for Q4 releases so far')
    url = nvidia_press_url(quarter, fiscal_year)
    r = http_requests.get(url, timeout=15)
    r.raise_for_status()
    m = _NVIDIA_FY_REVENUE_SENTENCE_RE.search(r.text)
    if not m:
        raise ValueError(f'No full-year revenue sentence found at {url}')
    quote = re.sub(r'\s+', ' ', m.group(0)).strip()
    num = _NVIDIA_AMOUNT_RE.search(quote)
    if not num:
        raise ValueError(f'Could not extract amount from quote at {url}')
    return {
        'value': float(num.group(1)),
        'quote': quote,
        'url': url,
        'label': f'TTM FY{fiscal_year}',
    }


def _safe_nvidia_ttm(quarter: int, fiscal_year: int) -> dict | None:
    try:
        return _fetch_nvidia_ttm_evidence(quarter, fiscal_year)
    except Exception as e:
        logger.warning('Nvidia TTM revenue fetch failed (Q%d FY%d): %s', quarter, fiscal_year, e)
        return None


# ── Data endpoint ────────────────────────────────────────────────────────────
#
# Bump these when a newer quarter is released. (Future: auto-detect.)
CURRENT_QUARTER = 4
CURRENT_FY = 2026


@stocks_bp.route('/api/stocks/data', methods=['GET'])
@owner_required
def stocks_data():
    """Growth metrics for each (company, metric) cell.

    Returns: { period, data: { Company: { Metric: { oneY?, threeY? } } } }
    Only Nvidia/Revenue is wired up so far — other cells will be filled in
    as their press-release scrapers are added.
    """
    data: dict[str, dict[str, dict]] = {}

    cur = _safe_nvidia_ttm(CURRENT_QUARTER, CURRENT_FY)
    one = _safe_nvidia_ttm(CURRENT_QUARTER, CURRENT_FY - 1)
    three = _safe_nvidia_ttm(CURRENT_QUARTER, CURRENT_FY - 3)

    cell: dict = {}
    if cur and one:
        cell['oneY'] = (cur['value'] - one['value']) / one['value']
    if cur and three:
        cell['threeY'] = (cur['value'] - three['value']) / three['value']
    evidence = [e for e in (cur, one, three) if e]
    if cell and evidence:
        cell['evidence'] = evidence
        data['Nvidia'] = {'Revenue': cell}

    return jsonify({
        'period': f'TTM as of Q{CURRENT_QUARTER} FY{CURRENT_FY}',
        'data': data,
    })
