#!/usr/bin/env python3
"""
Sync video transcripts and summaries from local machine to production via API.

This script runs locally to:
1. Fetch all tickers from all users' portfolios and watchlists
2. Refresh video selections for each ticker (calls news-feed endpoint)
3. Get transcripts using local yt-dlp + faster-whisper (no YouTube API limits)
4. Generate summaries with Gemini
5. Upload transcripts + summaries to production API

Usage:
    python scripts/sync_video_summaries.py

Auto-run on Mac login:
    Configured via ~/Library/LaunchAgents/co.lumna.video-sync.plist
"""

import os
import sys
import time
import random
import requests
from datetime import datetime

# Add parent directory to path for imports
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(SCRIPT_DIR))

# Load environment from .env.sync
from dotenv import load_dotenv
load_dotenv(os.path.join(SCRIPT_DIR, '.env.sync'))

from google import genai
from transcriber import get_transcript, VideoUnavailableError, DownloadError

# Configuration
API_BASE_URL = os.environ.get('API_BASE_URL', 'https://lumna.co')
SYNC_API_KEY = os.environ.get('SYNC_API_KEY', 'lumna-sync-2024')
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')


def log(message):
    """Print timestamped log message."""
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {message}")


def get_tickers_to_sync():
    """Fetch all tickers that need video sync (from all users' portfolios + watchlists)."""
    response = requests.get(
        f"{API_BASE_URL}/api/investing/sync/tickers-to-sync",
        headers={'X-Sync-Key': SYNC_API_KEY},
        timeout=30
    )
    response.raise_for_status()
    data = response.json()
    return data.get('tickers', [])


def refresh_video_selection(ticker):
    """Call news-feed endpoint to refresh video selection for a ticker.

    This populates company_video_selections with the current videos for this ticker.
    """
    try:
        response = requests.get(
            f"{API_BASE_URL}/api/investing/news-feed",
            params={'ticker': ticker, 'limit': 10},
            headers={'X-Sync-Key': SYNC_API_KEY},
            timeout=60
        )
        response.raise_for_status()
        data = response.json()
        return data.get('videos', [])
    except Exception as e:
        log(f"  -> Warning: Could not refresh videos for {ticker}: {e}")
        return []


def get_videos_pending_sync():
    """Fetch videos that need transcripts/summaries from the API."""
    response = requests.get(
        f"{API_BASE_URL}/api/investing/video-summaries/pending",
        headers={'X-Sync-Key': SYNC_API_KEY},
        timeout=30
    )
    response.raise_for_status()
    return response.json().get('videos', [])


def upload_video_data(video_id, transcript=None, has_transcript=True, summary=None):
    """Upload transcript and/or summary to the API."""
    response = requests.post(
        f"{API_BASE_URL}/api/investing/video-summaries/upload",
        headers={'X-Sync-Key': SYNC_API_KEY, 'Content-Type': 'application/json'},
        json={
            'video_id': video_id,
            'transcript': transcript,
            'has_transcript': has_transcript,
            'summary': summary
        },
        timeout=30
    )
    response.raise_for_status()
    return response.json()


def fetch_transcript_local(video_id):
    """Fetch transcript using local yt-dlp + faster-whisper pipeline.

    Returns:
        str: Transcript text if successful
        None: If video is unavailable (private, deleted, etc.)
    Raises:
        DownloadError: If download fails for other reasons
    """
    return get_transcript(video_id, model_size="base")


def generate_summary(transcript_text):
    """Generate summary using Gemini."""
    client = genai.Client(api_key=GEMINI_API_KEY)

    # Truncate if too long
    max_chars = 30000
    if len(transcript_text) > max_chars:
        transcript_text = transcript_text[:max_chars] + '...'

    prompt = f"""Summarize this YouTube video transcript in 2-3 concise sentences.
Focus on the main points about the company/stock discussed.
Be factual and neutral. Write in the same language as the transcript.

Transcript:
{transcript_text}"""

    response = client.models.generate_content(
        model='gemini-2.0-flash',
        contents=prompt
    )
    return response.text.strip()


def main():
    log("=" * 60)
    log("Starting video transcript/summary sync...")
    log("=" * 60)

    if not GEMINI_API_KEY:
        log("ERROR: GEMINI_API_KEY environment variable required")
        sys.exit(1)

    # Step 1: Get all tickers to sync
    log("\n[Step 1] Fetching tickers from all portfolios and watchlists...")
    try:
        tickers = get_tickers_to_sync()
        log(f"Found {len(tickers)} unique tickers to sync")
    except Exception as e:
        log(f"ERROR fetching tickers: {e}")
        sys.exit(1)

    if not tickers:
        log("No tickers to sync, exiting")
        return

    # Step 2: Refresh video selections for each ticker
    log(f"\n[Step 2] Refreshing video selections for {len(tickers)} tickers...")
    total_videos_refreshed = 0
    for i, ticker in enumerate(tickers):
        log(f"  [{i+1}/{len(tickers)}] {ticker}")
        videos = refresh_video_selection(ticker)
        total_videos_refreshed += len(videos)
        # Small delay to avoid hammering the API
        time.sleep(0.5)
    log(f"Refreshed {total_videos_refreshed} total video selections")

    # Step 3: Get videos pending transcript sync
    log("\n[Step 3] Fetching videos pending transcript sync...")
    try:
        videos = get_videos_pending_sync()
        log(f"Found {len(videos)} videos pending sync")
    except Exception as e:
        log(f"ERROR fetching videos: {e}")
        sys.exit(1)

    if not videos:
        log("All videos already synced, nothing to do!")
        return

    # Step 4: Process each video
    log(f"\n[Step 4] Processing {len(videos)} videos...")
    log("(Using local yt-dlp + Whisper transcription)")
    log("-" * 40)

    transcript_fetched = 0
    summary_generated = 0
    no_transcript = 0
    error_count = 0

    for i, video in enumerate(videos):
        video_id = video['video_id']
        has_transcript = video.get('has_transcript', False)
        has_summary = video.get('has_summary', False)
        title = video['title'][:50] + '...' if len(video['title']) > 50 else video['title']

        log(f"\n[{i+1}/{len(videos)}] {title}")

        try:
            transcript = None
            summary = None

            # Get transcript (local transcription)
            if not has_transcript:
                log(f"  -> Downloading and transcribing locally...")
                start_time = time.time()

                try:
                    transcript = fetch_transcript_local(video_id)
                    elapsed = time.time() - start_time

                    if transcript:
                        log(f"  -> Transcript ready ({len(transcript)} chars) in {elapsed:.1f}s")
                        transcript_fetched += 1
                    else:
                        log(f"  -> Video unavailable, marking as no transcript")
                        upload_video_data(video_id, transcript=None, has_transcript=False)
                        no_transcript += 1
                        continue

                except (VideoUnavailableError, DownloadError) as e:
                    log(f"  -> Video unavailable: {str(e)[:60]}")
                    upload_video_data(video_id, transcript=None, has_transcript=False)
                    no_transcript += 1
                    continue

            else:
                log(f"  -> Transcript already cached")

            # Generate summary
            if transcript and not has_summary:
                log(f"  -> Generating summary with Gemini...")
                summary = generate_summary(transcript)
                log(f"  -> Summary generated ({len(summary)} chars)")
                summary_generated += 1

            # Upload to API
            if transcript or summary:
                upload_video_data(video_id, transcript=transcript, has_transcript=True, summary=summary)
                log(f"  -> Uploaded to API")

        except Exception as e:
            log(f"  -> ERROR: {str(e)[:100]}")
            error_count += 1
            continue

    # Summary
    log("\n" + "=" * 60)
    log("SYNC COMPLETE")
    log("=" * 60)
    log(f"Transcripts fetched: {transcript_fetched}")
    log(f"Summaries generated: {summary_generated}")
    log(f"Videos unavailable:  {no_transcript}")
    log(f"Errors:              {error_count}")
    log("=" * 60)


if __name__ == '__main__':
    main()
