"""YC Advisor sub-app — PUBLIC, read-only.

Serves the latest videos from the Y Combinator YouTube channel
(https://www.youtube.com/@ycombinator). YouTube exposes a per-channel Atom
feed at /feeds/videos.xml that lists the ~15 most recent uploads with no API
key required, so this blueprint just fetches and parses that feed server-side
(the browser can't read it directly — YouTube sends no CORS headers).

One endpoint, GET /api/yc/videos, returns the parsed video list. Results are
cached in-process for a while so we don't re-hit YouTube on every page load.
"""

import logging
import time
import xml.etree.ElementTree as ET

import requests as http_requests
from flask import Blueprint, jsonify

logger = logging.getLogger(__name__)

yc_bp = Blueprint('yc', __name__)

# Y Combinator's channel id (the @ycombinator handle resolves to this UC… id).
YC_CHANNEL_ID = 'UCcefcZRL2oaA_uBNeo5UOWg'
FEED_URL = f'https://www.youtube.com/feeds/videos.xml?channel_id={YC_CHANNEL_ID}'

# Atom + YouTube + Media RSS namespaces used in the feed.
NS = {
    'atom': 'http://www.w3.org/2005/Atom',
    'yt': 'http://www.youtube.com/xml/schemas/2015',
    'media': 'http://search.yahoo.com/mrss/',
}

CACHE_TTL_SECONDS = 30 * 60  # refresh at most twice an hour
_cache: dict = {'fetched_at': 0.0, 'videos': []}


def _parse_feed(xml_text: str) -> list:
    """Turn the Atom feed XML into a small list of video dicts."""
    root = ET.fromstring(xml_text)
    videos = []
    for entry in root.findall('atom:entry', NS):
        video_id = entry.findtext('yt:videoId', namespaces=NS)
        title = entry.findtext('atom:title', namespaces=NS)
        published = entry.findtext('atom:published', namespaces=NS)
        if not video_id:
            continue
        group = entry.find('media:group', NS)
        description = ''
        views = None
        if group is not None:
            description = group.findtext('media:description', default='', namespaces=NS) or ''
            community = group.find('media:community', NS)
            if community is not None:
                stats = community.find('media:statistics', NS)
                if stats is not None:
                    views = stats.get('views')
        videos.append({
            'id': video_id,
            'title': title or 'Untitled',
            'published': published,
            'description': description,
            'views': int(views) if views and views.isdigit() else None,
            'thumbnail': f'https://i.ytimg.com/vi/{video_id}/hqdefault.jpg',
            'url': f'https://www.youtube.com/watch?v={video_id}',
        })
    return videos


@yc_bp.route('/api/yc/videos', methods=['GET'])
def yc_videos():
    """Return the latest Y Combinator uploads (cached)."""
    now = time.time()
    if _cache['videos'] and (now - _cache['fetched_at']) < CACHE_TTL_SECONDS:
        return jsonify({'videos': _cache['videos']})

    try:
        resp = http_requests.get(FEED_URL, timeout=10)
        resp.raise_for_status()
        videos = _parse_feed(resp.text)
        _cache['videos'] = videos
        _cache['fetched_at'] = now
        return jsonify({'videos': videos})
    except Exception as exc:  # noqa: BLE001 — degrade gracefully on any fetch/parse error
        logger.warning('YC feed fetch failed: %s', exc)
        # Serve a stale cache if we have one rather than failing the page.
        if _cache['videos']:
            return jsonify({'videos': _cache['videos']})
        return jsonify({'videos': [], 'error': 'feed_unavailable'}), 502
