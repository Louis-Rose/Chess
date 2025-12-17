#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Setting up Chess Stats App ==="

# Backend setup
echo "Setting up backend..."
cd "$ROOT_DIR/backend"
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install gunicorn
deactivate

# Frontend setup
echo "Setting up frontend..."
cd "$ROOT_DIR/frontend"
npm install

echo "=== Setup complete ==="
