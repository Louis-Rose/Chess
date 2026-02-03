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
        "--progress",
        "--newline",  # Progress on new lines for cleaner output
        url
    ]

    try:
        # Run with output visible for progress tracking
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True
        )

        # Stream output to terminal (filter verbose download progress)
        output_lines = []
        last_download_line = None
        try:
            for line in process.stdout:
                line = line.strip()
                if line:
                    output_lines.append(line)
                    # Filter download progress lines - only show first and last
                    if '[download]' in line and '% of' in line:
                        last_download_line = line
                        # Only print 0.0% or 100%
                        if '0.0%' in line or '100%' in line or '100.0%' in line:
                            print(f"     {line}")
                    else:
                        # Print completion line if we had progress
                        if last_download_line and '100%' not in last_download_line:
                            pass  # Skip, we'll see it in the next 100% line
                        print(f"     {line}")
            process.wait(timeout=120)
        except subprocess.TimeoutExpired:
            process.kill()
            raise DownloadError(f"Download timed out for {video_id}")

        if process.returncode != 0:
            error = " ".join(output_lines).lower()
            if "private video" in error or "video unavailable" in error or "not available" in error:
                raise VideoUnavailableError(f"Video {video_id} is unavailable")
            if "sign in" in error:
                raise VideoUnavailableError(f"Video {video_id} requires sign-in")
            raise DownloadError(f"yt-dlp failed: {error[:200]}")

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


def format_timestamp(seconds: float) -> str:
    """Format seconds as [MM:SS] or [HH:MM:SS] for longer videos."""
    total_seconds = int(seconds)
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    secs = total_seconds % 60
    if hours > 0:
        return f"[{hours}:{minutes:02d}:{secs:02d}]"
    return f"[{minutes:02d}:{secs:02d}]"


def transcribe_audio(file_path: str, model_size: str = "base") -> str:
    """
    Transcribe audio file using faster-whisper.

    Args:
        file_path: Path to audio file
        model_size: Whisper model size (tiny, base, small, medium, large)

    Returns:
        Transcription text with timestamps every ~10 seconds
    """
    from faster_whisper import WhisperModel
    import sys

    print(f"     [Whisper] Loading {model_size} model...")
    # Use int8 quantization for speed on CPU
    model = WhisperModel(model_size, device="cpu", compute_type="int8")

    print(f"     [Whisper] Transcribing audio...")
    segments, info = model.transcribe(
        file_path,
        beam_size=5,
        language=None,  # Auto-detect
        vad_filter=True,  # Filter out silence
    )

    # Combine segments with timestamps every ~10 seconds
    duration = info.duration
    texts = []
    last_progress = -1
    last_timestamp = -10  # Force first timestamp

    for segment in segments:
        # Add timestamp marker every ~10 seconds
        if segment.start >= last_timestamp + 10:
            texts.append(f"\n{format_timestamp(segment.start)}")
            last_timestamp = segment.start

        texts.append(segment.text.strip())

        # Show progress every 10%
        if duration > 0:
            progress = int((segment.end / duration) * 100)
            if progress >= last_progress + 10:
                print(f"     [Whisper] {progress}% transcribed ({int(segment.end)}s / {int(duration)}s)")
                last_progress = progress

    transcript = " ".join(texts).strip()
    if info.language:
        print(f"     [Whisper] Done - detected language: {info.language}")

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
