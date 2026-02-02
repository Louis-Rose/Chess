#!/usr/bin/env python3
"""
Sync video summaries from local machine to production via API.

This script runs locally (where YouTube isn't blocked) to:
1. Fetch videos without summaries from production API
2. Get transcripts via YouTube Transcript API
3. Generate summaries with Gemini
4. Upload summaries to production API

Usage:
    python scripts/sync_video_summaries.py

Cron example (daily at 6 AM):
    0 6 * * * cd /path/to/app && /path/to/python scripts/sync_video_summaries.py >> /tmp/video_summaries.log 2>&1
"""

import os
import sys
import time
import requests
from datetime import datetime

# Add parent directory to path for imports
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(SCRIPT_DIR))

# Load environment from .env.sync
from dotenv import load_dotenv
load_dotenv(os.path.join(SCRIPT_DIR, '.env.sync'))

from youtube_transcript_api import YouTubeTranscriptApi
import google.generativeai as genai

# Configuration
API_BASE_URL = os.environ.get('API_BASE_URL', 'https://lumna.co')
SYNC_API_KEY = os.environ.get('SYNC_API_KEY', 'lumna-sync-2024')
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')


def log(message):
    """Print timestamped log message."""
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {message}")


def get_videos_without_summaries():
    """Fetch videos that need summaries from the API."""
    response = requests.get(
        f"{API_BASE_URL}/api/investing/video-summaries/pending",
        headers={'X-Sync-Key': SYNC_API_KEY},
        timeout=30
    )
    response.raise_for_status()
    return response.json().get('videos', [])


def upload_summary(video_id, summary):
    """Upload a summary to the API."""
    response = requests.post(
        f"{API_BASE_URL}/api/investing/video-summaries/upload",
        headers={'X-Sync-Key': SYNC_API_KEY, 'Content-Type': 'application/json'},
        json={'video_id': video_id, 'summary': summary},
        timeout=30
    )
    response.raise_for_status()
    return response.json()


def fetch_transcript(video_id):
    """Fetch transcript for a video."""
    try:
        ytt_api = YouTubeTranscriptApi()
        transcript_list = ytt_api.fetch(video_id, languages=['en', 'fr', 'en-US', 'en-GB'])
        return ' '.join([snippet.text for snippet in transcript_list])
    except Exception as e:
        error_msg = str(e).lower()
        if 'disabled' in error_msg or 'no transcript' in error_msg or 'not found' in error_msg:
            return None  # No transcript available
        raise


def generate_summary(transcript_text):
    """Generate summary using Gemini."""
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel('gemini-2.0-flash')

    # Truncate if too long
    max_chars = 30000
    if len(transcript_text) > max_chars:
        transcript_text = transcript_text[:max_chars] + '...'

    prompt = f"""Summarize this YouTube video transcript in 2-3 concise sentences.
Focus on the main points about the company/stock discussed.
Be factual and neutral. Write in the same language as the transcript.

Transcript:
{transcript_text}"""

    response = model.generate_content(prompt)
    return response.text.strip()


def main():
    log("Starting video summary sync...")

    if not GEMINI_API_KEY:
        log("ERROR: GEMINI_API_KEY environment variable required")
        sys.exit(1)

    # Get videos without summaries
    try:
        videos = get_videos_without_summaries()
        log(f"Found {len(videos)} videos without summaries")
    except Exception as e:
        log(f"ERROR fetching videos: {e}")
        sys.exit(1)

    if not videos:
        log("Nothing to do, exiting")
        return

    success_count = 0
    skip_count = 0
    error_count = 0

    for video in videos:
        video_id = video['video_id']
        title = video['title'][:50] + '...' if len(video['title']) > 50 else video['title']

        log(f"Processing: {title}")

        try:
            # Fetch transcript
            transcript = fetch_transcript(video_id)

            if not transcript:
                log(f"  -> No transcript available, skipping")
                skip_count += 1
                continue

            # Generate summary
            summary = generate_summary(transcript)

            # Upload to API
            upload_summary(video_id, summary)
            log(f"  -> Summary uploaded ({len(summary)} chars)")
            success_count += 1

            # Rate limit: wait between requests
            time.sleep(1)

        except Exception as e:
            log(f"  -> ERROR: {str(e)[:100]}")
            error_count += 1
            continue

    log(f"Done! Success: {success_count}, Skipped: {skip_count}, Errors: {error_count}")


if __name__ == '__main__':
    main()
