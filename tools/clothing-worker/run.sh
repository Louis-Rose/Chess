#!/usr/bin/env bash
# Launch the LUMNA clothing worker with .env loaded. Run this from your OWN
# Terminal (not from an editor/agent), so macOS grants the automation
# permission to Terminal and the worker survives after other tools close.
#
#   ./run.sh
#
# Leave it running whenever you want the /clothing search to work. The first
# time a store shows a bot check, solve it once in the Chrome window it opens;
# the cookie is cached in ./chrome-profile for next time.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "Missing .env — copy .env.example to .env and set CLOTHING_WORKER_SECRET." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

# Flush prints immediately so worker.log is live (useful under launchd).
export PYTHONUNBUFFERED=1

PY=./.venv/bin/python
[ -x "$PY" ] || PY=python3
exec "$PY" worker.py
