#!/usr/bin/env bash
# Install (or update) the clothing worker as an always-on macOS LaunchAgent.
#
# Why a copy: this repo lives under ~/Desktop, which macOS TCC protects — a
# launchd agent can't read it. So we run a self-contained copy from
# ~/Library/Application Support (not protected) and point the agent there.
#
# Run this once to install, and again after changing worker.py/run.sh to update.
#   ./install-service.sh
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
DST="$HOME/Library/Application Support/lumna-clothing-worker"
LABEL="co.lumna.clothing-worker"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
UID_="$(id -u)"

if [ ! -f "$SRC/.env" ]; then
  echo "Missing $SRC/.env — copy .env.example to .env and set CLOTHING_WORKER_SECRET first." >&2
  exit 1
fi

echo "→ syncing worker into $DST"
mkdir -p "$DST"
cp "$SRC/worker.py" "$SRC/run.sh" "$SRC/solve.sh" "$SRC/requirements.txt" "$SRC/.env" "$DST/"
chmod +x "$DST/run.sh" "$DST/solve.sh"

if [ ! -x "$DST/.venv/bin/python" ]; then
  echo "→ creating venv"
  python3 -m venv "$DST/.venv"
fi
echo "→ installing deps"
"$DST/.venv/bin/pip" install --quiet --upgrade pip
"$DST/.venv/bin/pip" install --quiet -r "$DST/requirements.txt"

echo "→ writing LaunchAgent"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>$LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$DST/run.sh</string>
    </array>
    <key>WorkingDirectory</key><string>$DST</string>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>ThrottleInterval</key><integer>15</integer>
    <key>ProcessType</key><string>Interactive</string>
    <key>StandardOutPath</key><string>$DST/worker.log</string>
    <key>StandardErrorPath</key><string>$DST/worker.log</string>
</dict>
</plist>
PLIST_EOF

echo "→ (re)loading service"
# Boot out any existing instance and WAIT until it's fully gone — bootstrapping
# too soon races and fails with "Input/output error".
launchctl bootout "gui/$UID_/$LABEL" 2>/dev/null || true
for _ in $(seq 1 15); do
  launchctl print "gui/$UID_/$LABEL" >/dev/null 2>&1 || break
  sleep 1
done
launchctl bootstrap "gui/$UID_" "$PLIST"
launchctl enable "gui/$UID_/$LABEL"

echo "✓ installed. Logs: tail -f \"$DST/worker.log\""
echo "  Stop:  launchctl bootout gui/$UID_/$LABEL"
echo "  Start: launchctl bootstrap gui/$UID_ \"$PLIST\""
