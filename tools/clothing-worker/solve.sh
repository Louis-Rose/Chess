#!/usr/bin/env bash
# Clear a store's bot check (DataDome) once, by hand.
#
# When /clothing search returns "… is showing a bot check", run this. It pauses
# the background worker, opens its Chrome profile on Octobre so you can solve the
# challenge, caches the cookie, and resumes the worker. Run it from your OWN
# Terminal (it needs to show a window and read your Enter).
#
#   ./solve.sh
set -euo pipefail

LABEL="co.lumna.clothing-worker"
UID_="$(id -u)"
DST="$HOME/Library/Application Support/lumna-clothing-worker"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

if [ ! -x "$DST/.venv/bin/python" ]; then
  echo "Worker not installed at $DST — run ./install-service.sh first." >&2
  exit 1
fi

echo "→ pausing the background worker (frees the browser profile)…"
launchctl bootout "gui/$UID_/$LABEL" 2>/dev/null || true
for _ in $(seq 1 15); do launchctl print "gui/$UID_/$LABEL" >/dev/null 2>&1 || break; sleep 1; done

echo "→ opening Chrome on Octobre — solve the challenge, then come back here."
cd "$DST"
./.venv/bin/python - <<'PY'
import os
from playwright.sync_api import sync_playwright
profile = os.path.join(os.getcwd(), 'chrome-profile')
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(
        profile, channel='chrome', headless=False,
        viewport={'width': 1280, 'height': 900})
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.goto('https://www.octobre-editions.com/fr-fr/search')
    try:
        input('\n>>> Solve any captcha in the Chrome window, then press Enter here… ')
    except EOFError:
        pass
    ctx.close()
PY

echo "→ resuming the background worker…"
launchctl bootstrap "gui/$UID_" "$PLIST"
launchctl enable "gui/$UID_/$LABEL"
echo "✓ done — searches should work again."
