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
import json
import random
import requests
import threading
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

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
            params={'ticker': ticker, 'limit': 3},
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


def start_sync_run(tickers_count):
    """Start a new sync run and return its ID."""
    try:
        response = requests.post(
            f"{API_BASE_URL}/api/investing/sync/start",
            headers={'X-Sync-Key': SYNC_API_KEY, 'Content-Type': 'application/json'},
            json={'tickers_count': tickers_count},
            timeout=10
        )
        response.raise_for_status()
        return response.json().get('run_id')
    except Exception as e:
        log(f"Warning: Could not start sync tracking: {e}")
        return None


def update_sync_run(run_id, **kwargs):
    """Update sync run progress."""
    if not run_id:
        return
    try:
        requests.post(
            f"{API_BASE_URL}/api/investing/sync/update/{run_id}",
            headers={'X-Sync-Key': SYNC_API_KEY, 'Content-Type': 'application/json'},
            json=kwargs,
            timeout=10
        )
    except Exception:
        pass  # Don't fail sync if tracking fails


def end_sync_run(run_id, status, transcripts_fetched, summaries_generated, errors, error_message=None):
    """Mark sync run as complete. Retries up to 3 times if the request fails."""
    if not run_id:
        return
    for attempt in range(3):
        try:
            requests.post(
                f"{API_BASE_URL}/api/investing/sync/end/{run_id}",
                headers={'X-Sync-Key': SYNC_API_KEY, 'Content-Type': 'application/json'},
                json={
                    'status': status,
                    'transcripts_fetched': transcripts_fetched,
                    'summaries_generated': summaries_generated,
                    'errors': errors,
                    'error_message': error_message
                },
                timeout=10
            )
            return  # Success
        except Exception as e:
            if attempt < 2:
                log(f"Failed to update sync status (attempt {attempt + 1}/3), retrying in 5s...")
                time.sleep(5)
            else:
                log(f"Failed to update sync status after 3 attempts: {e}")


class Heartbeat:
    """Background thread that sends heartbeats to the server every 30 seconds."""

    def __init__(self, run_id):
        self.run_id = run_id
        self._stop_event = threading.Event()
        self._thread = None

    def start(self):
        """Start the heartbeat thread."""
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self):
        """Stop the heartbeat thread."""
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=2)

    def _run(self):
        """Send heartbeats every 30 seconds until stopped."""
        while not self._stop_event.is_set():
            # Wait 30 seconds, but check for stop every second
            for _ in range(30):
                if self._stop_event.is_set():
                    return
                time.sleep(1)
            # Send heartbeat
            update_sync_run(self.run_id)


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

    prompt = f"""Summarize this YouTube video transcript in 3-5 sentences.
Each sentence should be on its own line.
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

    run_id = None
    heartbeat = None
    transcript_fetched = 0
    summary_generated = 0
    error_count = 0

    try:
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

        # Start tracking sync run
        run_id = start_sync_run(len(tickers))
        heartbeat = Heartbeat(run_id)
        heartbeat.start()
        update_sync_run(run_id, current_step='refreshing')

        # Step 2: Refresh video selections for each ticker (parallel)
        log(f"\n[Step 2] Refreshing video selections for {len(tickers)} tickers (parallel)...")
        total_videos_refreshed = 0
        completed = 0

        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = {executor.submit(refresh_video_selection, ticker): ticker for ticker in tickers}
            for future in as_completed(futures):
                ticker = futures[future]
                completed += 1
                try:
                    videos = future.result()
                    total_videos_refreshed += len(videos)
                    log(f"  [{completed}/{len(tickers)}] {ticker} ({len(videos)} videos)")
                except Exception as e:
                    log(f"  [{completed}/{len(tickers)}] {ticker} - ERROR: {e}")

        log(f"Refreshed {total_videos_refreshed} total video selections")

        # Step 3: Get videos pending transcript sync
        log("\n[Step 3] Fetching videos pending transcript sync...")
        update_sync_run(run_id, current_step='fetching')
        try:
            videos = get_videos_pending_sync()
            log(f"Found {len(videos)} videos pending sync")
        except Exception as e:
            log(f"ERROR fetching videos: {e}")
            end_sync_run(run_id, 'failed', 0, 0, 1, str(e))
            sys.exit(1)

        if not videos:
            log("All videos already synced, nothing to do!")
            end_sync_run(run_id, 'completed', 0, 0, 0)
            return

        videos_list = [
            {'title': v['title'], 'status': 'pending'}
            for v in videos
        ]
        update_sync_run(run_id, videos_total=len(videos), videos_list=json.dumps(videos_list))

        # Step 4: Process each video
        log(f"\n[Step 4] Processing {len(videos)} videos...")
        log("(Using local yt-dlp + Whisper transcription)")
        log("-" * 40)

        no_transcript = 0

        for i, video in enumerate(videos):
            video_id = video['video_id']
            has_transcript = video.get('has_transcript', False)
            has_summary = video.get('has_summary', False)
            title = video['title'][:50] + '...' if len(video['title']) > 50 else video['title']

            log(f"\n[{i+1}/{len(videos)}] {title}")

            # Update progress
            update_sync_run(run_id, videos_processed=i, current_video=title, current_step='downloading')

            try:
                transcript = None
                summary = None

                # Get transcript (local transcription)
                if not has_transcript:
                    log(f"  -> Downloading and transcribing locally...")
                    update_sync_run(run_id, current_step='downloading')
                    start_time = time.time()

                    try:
                        update_sync_run(run_id, current_step='transcribing')
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
                    update_sync_run(run_id, current_step='summarizing')
                    summary = generate_summary(transcript)
                    log(f"  -> Summary generated ({len(summary)} chars)")
                    summary_generated += 1

                # Upload to API
                if transcript or summary:
                    update_sync_run(run_id, current_step='uploading')
                    upload_video_data(video_id, transcript=transcript, has_transcript=True, summary=summary)
                    log(f"  -> Uploaded to API")

            except Exception as e:
                log(f"  -> ERROR: {str(e)[:100]}")
                error_count += 1
                continue

        # Mark sync as complete
        end_sync_run(run_id, 'completed', transcript_fetched, summary_generated, error_count)

        # Summary
        log("\n" + "=" * 60)
        log("SYNC COMPLETE")
        log("=" * 60)
        log(f"Transcripts fetched: {transcript_fetched}")
        log(f"Summaries generated: {summary_generated}")
        log(f"Videos unavailable:  {no_transcript}")
        log(f"Errors:              {error_count}")
        log("=" * 60)

    except KeyboardInterrupt:
        log("\n\nInterrupted by user")
        end_sync_run(run_id, 'interrupted', transcript_fetched, summary_generated, error_count, 'Interrupted by user')
        sys.exit(0)

    except Exception as e:
        log(f"FATAL ERROR: {e}")
        end_sync_run(run_id, 'failed', transcript_fetched, summary_generated, error_count, str(e))
        raise

    finally:
        if heartbeat:
            heartbeat.stop()


if __name__ == '__main__':
    main()
