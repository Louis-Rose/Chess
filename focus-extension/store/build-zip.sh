#!/usr/bin/env bash
# Build the Chrome Web Store upload package: only the runtime files, with
# manifest.json at the zip root (no README or store docs).
set -euo pipefail

EXT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # focus-extension/
ROOT_DIR="$(cd "$EXT_DIR/.." && pwd)"                         # repo root
OUT="$ROOT_DIR/focus-extension.zip"

rm -f "$OUT"
cd "$EXT_DIR"
zip -r "$OUT" \
  manifest.json background.js bridge.js \
  popup.html popup.js \
  icons \
  -x '*.DS_Store' >/dev/null

echo "Built $OUT"
unzip -l "$OUT"
