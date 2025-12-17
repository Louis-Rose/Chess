#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

usage() {
    echo "Usage: $0 [--dev|--prod]"
    echo "  --dev   Run development servers (Flask + Vite with hot reload)"
    echo "  --prod  Run production server (Gunicorn + built frontend)"
    exit 1
}

if [ $# -eq 0 ]; then
    usage
fi

case "$1" in
    --dev)
        echo "=== Starting in DEV mode ==="

        # Start backend in background
        echo "Starting Flask dev server on port 5001..."
        cd "$ROOT_DIR/backend"
        source venv/bin/activate
        python app.py &
        BACKEND_PID=$!

        # Start frontend
        echo "Starting Vite dev server on port 5173..."
        cd "$ROOT_DIR/frontend"
        npm run dev &
        FRONTEND_PID=$!

        # Handle shutdown
        trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT

        echo "Dev servers running. Press Ctrl+C to stop."
        wait
        ;;

    --prod)
        echo "=== Starting in PROD mode ==="

        # Build frontend
        echo "Building frontend..."
        cd "$ROOT_DIR/frontend"
        npm run build

        # Start backend with gunicorn
        echo "Starting Gunicorn on port 5001..."
        cd "$ROOT_DIR/backend"
        source venv/bin/activate
        exec gunicorn --bind 0.0.0.0:5001 app:app
        ;;

    *)
        usage
        ;;
esac
