"""
Local video transcription using yt-dlp and faster-whisper.

Downloads audio from YouTube and transcribes locally using Whisper.
Avoids YouTube's transcript API rate limiting.
"""

import os
import tempfile
import subprocess
from pathlib import Path


def get_audio(video_id: str, output_dir: str = None) -> str | None:
    """
    Download audio from a YouTube video using yt-dlp.

    Args:
        video_id: YouTube video ID
        output_dir: Directory for temp file (defaults to system temp)

    Returns:
        Path to downloaded audio file, or None if failed

    Raises:
        VideoUnavailableError: If video is private, deleted, or unavailable
    """
    if output_dir is None:
        output_dir = tempfile.gettempdir()

    url = f"https://www.youtube.com/watch?v={video_id}"
    output_template = os.path.join(output_dir, f"{video_id}.%(ext)s")

    cmd = [
        "yt-dlp",
        "--extract-audio",
        "--audio-format", "m4a",
        "--audio-quality", "0",  # Best quality
        "--output", output_template,
        "--no-playlist",
        "--quiet",
        "--no-warnings",
        url
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120  # 2 minute timeout
        )

        if result.returncode != 0:
            error = result.stderr.lower()
            if "private video" in error or "video unavailable" in error or "not available" in error:
                raise VideoUnavailableError(f"Video {video_id} is unavailable")
            if "sign in" in error:
                raise VideoUnavailableError(f"Video {video_id} requires sign-in")
            raise DownloadError(f"yt-dlp failed: {result.stderr[:200]}")

        # Find the downloaded file
        audio_path = os.path.join(output_dir, f"{video_id}.m4a")
        if os.path.exists(audio_path):
            return audio_path

        # Try other extensions in case format changed
        for ext in ["m4a", "webm", "mp3", "opus"]:
            path = os.path.join(output_dir, f"{video_id}.{ext}")
            if os.path.exists(path):
                return path

        raise DownloadError(f"Audio file not found after download")

    except subprocess.TimeoutExpired:
        raise DownloadError(f"Download timed out for {video_id}")


def transcribe_audio(file_path: str, model_size: str = "base") -> str:
    """
    Transcribe audio file using faster-whisper.

    Args:
        file_path: Path to audio file
        model_size: Whisper model size (tiny, base, small, medium, large)

    Returns:
        Transcription text
    """
    from faster_whisper import WhisperModel

    # Use int8 quantization for speed on CPU
    model = WhisperModel(model_size, device="cpu", compute_type="int8")

    segments, info = model.transcribe(
        file_path,
        beam_size=5,
        language=None,  # Auto-detect
        vad_filter=True,  # Filter out silence
    )

    # Combine all segments
    transcript = " ".join(segment.text.strip() for segment in segments)

    return transcript


def get_transcript(video_id: str, model_size: str = "base") -> str | None:
    """
    Get transcript for a YouTube video using local transcription.

    Downloads audio, transcribes with Whisper, cleans up temp files.

    Args:
        video_id: YouTube video ID
        model_size: Whisper model size

    Returns:
        Transcript text, or None if video unavailable

    Raises:
        DownloadError: If download fails (not due to video unavailability)
        TranscriptionError: If transcription fails
    """
    audio_path = None

    try:
        # Download audio
        audio_path = get_audio(video_id)

        if not audio_path:
            return None

        # Transcribe
        transcript = transcribe_audio(audio_path, model_size)

        return transcript

    except VideoUnavailableError:
        return None

    finally:
        # Cleanup temp file
        if audio_path and os.path.exists(audio_path):
            try:
                os.remove(audio_path)
            except OSError:
                pass


class VideoUnavailableError(Exception):
    """Video is private, deleted, or otherwise unavailable."""
    pass


class DownloadError(Exception):
    """Failed to download video audio."""
    pass


class TranscriptionError(Exception):
    """Failed to transcribe audio."""
    pass


# For testing
if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python transcriber.py <video_id>")
        sys.exit(1)

    video_id = sys.argv[1]
    print(f"Transcribing video: {video_id}")

    try:
        transcript = get_transcript(video_id)
        if transcript:
            print(f"\nTranscript ({len(transcript)} chars):")
            print(transcript[:500] + "..." if len(transcript) > 500 else transcript)
        else:
            print("Video unavailable or no audio")
    except Exception as e:
        print(f"Error: {e}")
