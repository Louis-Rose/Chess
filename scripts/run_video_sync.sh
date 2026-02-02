#!/bin/bash
# Wrapper script to run video sync in a visible Terminal window
# Called by LaunchAgent on Mac login

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"

# Open Terminal and run the sync script
osascript <<EOF
tell application "Terminal"
    activate
    do script "cd '$APP_DIR' && echo '🎬 LUMNA Video Sync Starting...' && echo '' && python3 scripts/sync_video_summaries.py && echo '' && echo '✅ Sync complete! This window will close in 30 seconds...' && sleep 30"
end tell
EOF
