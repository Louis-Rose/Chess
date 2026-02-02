#!/usr/bin/env python3
"""
Sync video summaries from local machine to production database.

This script runs locally (where YouTube isn't blocked) to:
1. Fetch videos from production DB that don't have summaries
2. Get transcripts via YouTube Transcript API
3. Generate summaries with Gemini
4. Upload summaries to production DB

Usage:
    python scripts/sync_video_summaries.py

Cron example (daily at 6 AM):
    0 6 * * * cd /path/to/app && /path/to/python scripts/sync_video_summaries.py >> /tmp/video_summaries.log 2>&1
"""

import os
import sys
import time
from datetime import datetime

# Add parent directory to path for imports
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(SCRIPT_DIR))

# Load environment from .env.sync
from dotenv import load_dotenv
load_dotenv(os.path.join(SCRIPT_DIR, '.env.sync'))

import psycopg2
from psycopg2.extras import RealDictCursor
from youtube_transcript_api import YouTubeTranscriptApi
import google.generativeai as genai


def log(message):
    """Print timestamped log message."""
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {message}")


def get_db_connection():
    """Get PostgreSQL connection."""
    return psycopg2.connect(
        host=os.environ.get('DB_HOST', 'localhost'),
        port=os.environ.get('DB_PORT', '5432'),
        dbname=os.environ.get('DB_NAME', 'lumna'),
        user=os.environ.get('DB_USER', 'lumna'),
        password=os.environ['DB_PASSWORD'],
        cursor_factory=RealDictCursor
    )


def get_videos_without_summaries(conn):
    """Get all videos that don't have summaries yet."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT v.video_id, v.title, v.channel_name
            FROM youtube_videos_cache v
            LEFT JOIN video_summaries s ON v.video_id = s.video_id
            WHERE s.video_id IS NULL
            ORDER BY v.published_at DESC
        """)
        return cur.fetchall()


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


def generate_summary(transcript_text, api_key):
    """Generate summary using Gemini."""
    genai.configure(api_key=api_key)
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


def save_summary(conn, video_id, summary):
    """Save summary to database."""
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO video_summaries (video_id, summary, created_at)
               VALUES (%s, %s, NOW())
               ON CONFLICT (video_id) DO UPDATE SET summary = EXCLUDED.summary""",
            (video_id, summary)
        )
    conn.commit()


def main():
    log("Starting video summary sync...")

    # Check required environment variables
    if not os.environ.get('DB_PASSWORD'):
        log("ERROR: DB_PASSWORD environment variable required")
        sys.exit(1)

    gemini_key = os.environ.get('GEMINI_API_KEY')
    if not gemini_key:
        log("ERROR: GEMINI_API_KEY environment variable required")
        sys.exit(1)

    conn = get_db_connection()
    log(f"Connected to database")

    # Get videos without summaries
    videos = get_videos_without_summaries(conn)
    log(f"Found {len(videos)} videos without summaries")

    if not videos:
        log("Nothing to do, exiting")
        conn.close()
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
            summary = generate_summary(transcript, gemini_key)

            # Save to database
            save_summary(conn, video_id, summary)
            log(f"  -> Summary saved ({len(summary)} chars)")
            success_count += 1

            # Rate limit: wait between requests
            time.sleep(1)

        except Exception as e:
            log(f"  -> ERROR: {str(e)[:100]}")
            error_count += 1
            continue

    conn.close()
    log(f"Done! Success: {success_count}, Skipped: {skip_count}, Errors: {error_count}")


if __name__ == '__main__':
    main()
