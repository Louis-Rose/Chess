#!/usr/bin/env python3
"""
Test script to fetch transcripts for 3 NVIDIA videos and upload to production.
Run this locally where YouTube isn't blocked.

Usage:
    python scripts/test_transcripts.py
"""

import os
import sys
import requests

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(SCRIPT_DIR))

from dotenv import load_dotenv
load_dotenv(os.path.join(SCRIPT_DIR, '.env.sync'))

from youtube_transcript_api import YouTubeTranscriptApi

# Optional: path to cookies.txt file exported from browser
# Export using browser extension "Get cookies.txt LOCALLY" or similar
COOKIES_PATH = os.path.join(SCRIPT_DIR, 'youtube_cookies.txt')

API_BASE_URL = os.environ.get('API_BASE_URL', 'https://lumna.co')
SYNC_API_KEY = os.environ.get('SYNC_API_KEY', 'lumna-sync-2024')

# 3 most recent NVIDIA videos
TEST_VIDEOS = [
    ('48CBnk5G3J4', 'Nvidia CEO is waiting on China to rule on H200 AI chips'),
    ('F_a-nTU8jHY', 'Fed decision looms, China reportedly approves Nvidia H200 sales'),
    ('6JZEH1wpeBY', 'Microsoft aims at Nvidia, Google, and Amazon'),
]


class IPBlockedError(Exception):
    """YouTube is blocking our IP."""
    pass


def get_youtube_api():
    """Create YouTubeTranscriptApi with cookies if available."""
    if os.path.exists(COOKIES_PATH):
        print(f"  (Using cookies from {COOKIES_PATH})")
        import http.cookiejar
        cookie_jar = http.cookiejar.MozillaCookieJar(COOKIES_PATH)
        cookie_jar.load()

        session = requests.Session()
        session.cookies = cookie_jar
        return YouTubeTranscriptApi(http_client=session)
    return YouTubeTranscriptApi()


def fetch_transcript(video_id):
    """Fetch transcript from YouTube."""
    try:
        ytt_api = get_youtube_api()
        transcript = ytt_api.fetch(video_id, languages=['en', 'fr', 'en-US', 'en-GB'])
        return ' '.join([s.text for s in transcript])
    except Exception as e:
        error_msg = str(e).lower()
        # Check if it's an IP block vs no transcript
        if 'blocking' in error_msg or 'ip' in error_msg or 'cloud provider' in error_msg:
            raise IPBlockedError("YouTube is blocking this IP")
        if 'disabled' in error_msg or 'no transcript' in error_msg or 'not found' in error_msg:
            return None  # Video genuinely has no transcript
        # Unknown error - re-raise
        raise


def upload_transcript(video_id, transcript):
    """Upload transcript to production API."""
    response = requests.post(
        f"{API_BASE_URL}/api/investing/video-summaries/upload",
        headers={'X-Sync-Key': SYNC_API_KEY, 'Content-Type': 'application/json'},
        json={
            'video_id': video_id,
            'transcript': transcript,
            'has_transcript': transcript is not None,
            'summary': None  # No summary for now
        },
        timeout=30
    )
    response.raise_for_status()
    return response.json()


def main():
    print("Testing transcript fetch for 3 NVIDIA videos\n")

    for video_id, title in TEST_VIDEOS:
        print(f"Video: {title}")
        print(f"ID: {video_id}")

        # Fetch transcript
        print("  Fetching transcript from YouTube...")
        try:
            transcript = fetch_transcript(video_id)

            if transcript:
                print(f"  ✓ Got transcript ({len(transcript)} chars)")
                print(f"  Preview: {transcript[:100]}...")

                # Upload to production
                print("  Uploading to production...")
                try:
                    upload_transcript(video_id, transcript)
                    print("  ✓ Uploaded!")
                except Exception as e:
                    print(f"  ✗ Upload failed: {e}")
            else:
                print("  ✗ No transcript available for this video")
                # Mark as no transcript
                try:
                    upload_transcript(video_id, None)
                    print("  Marked as no transcript available")
                except Exception as e:
                    print(f"  ✗ Failed to update: {e}")
        except IPBlockedError:
            print("  ✗ YouTube is blocking this IP - run script from a residential IP")
            print("  (NOT uploading - don't want to mark as 'no transcript')")

        print()


if __name__ == '__main__':
    main()
