# Project Notes for Claude

> **Note to self**: Keep this file updated when significant changes are made (new features, deployment changes, architecture updates).

## Overview
LUMNA — web app for tracking investment portfolios and Chess.com statistics.

## Architecture
- **Frontend**: React + Vite + TypeScript + Tailwind (port 5173 dev, built to `frontend/dist/`)
- **Backend**: Flask + Gunicorn (port 5001)
- **Reverse proxy**: nginx

## Deployment
- **VM**: Azure Ubuntu at `20.86.130.108`
- **Domain**: lumna.co
- **User**: azureuser
- **Repo path on VM**: `/home/azureuser/Chess`

## Key Commands

### Local development
```bash
./scripts/setup.sh           # First-time setup
./scripts/start.sh --dev     # Run dev servers
```

### Production (VM)
```bash
./scripts/start.sh --prod           # Start services
./scripts/start.sh --prod stop      # Stop services
./scripts/start.sh --prod restart   # Restart services
./scripts/start.sh --prod status    # Check status
./scripts/start.sh --prod logs      # View backend logs
```

## Operations

### Video Transcript Sync
News feed videos need transcripts synced daily. The sync script:
1. Fetches all tickers from all users' portfolios + watchlists (auto-updated)
2. Refreshes video selections for each ticker
3. Downloads audio via yt-dlp and transcribes locally with Whisper
4. Generates summaries with Gemini
5. Uploads to production API

**Manual run:**
```bash
python3 scripts/sync_video_summaries.py
```

**Auto-run on Mac login:**
```bash
# Install LaunchAgent (one-time setup)
cp scripts/co.lumna.video-sync.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/co.lumna.video-sync.plist
```

Opens Terminal window on login, runs sync, closes after 30 seconds.

**Dependencies (local machine):**
- yt-dlp
- faster-whisper
- ffmpeg

**Logs:**
- `~/Library/Logs/lumna-video-sync.log`

## Pending
- None
