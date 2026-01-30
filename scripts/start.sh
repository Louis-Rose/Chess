#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

usage() {
    echo "Usage: $0 <mode> [command]"
    echo ""
    echo "Modes:"
    echo "  --dev              Run development servers (Flask + Vite with hot reload)"
    echo "  --prod [command]   Manage production services (nginx + gunicorn)"
    echo ""
    echo "Production commands:"
    echo "  --prod             Start services (default)"
    echo "  --prod stop        Stop services"
    echo "  --prod restart     Restart services"
    echo "  --prod status      Check services status"
    echo "  --prod logs        View backend logs (Ctrl+C to exit)"
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
        FLASK_ENV=dev ./venv/bin/python app.py &
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
        COMMAND="${2:-start}"

        case "$COMMAND" in
            start)
                echo "=== Starting production services ==="
                START_TIME=$SECONDS

                # Install backend dependencies
                echo "Installing backend dependencies..."
                cd "$ROOT_DIR/backend"
                source venv/bin/activate
                pip install -r requirements.txt --quiet

                # Build frontend
                echo "Building frontend..."
                cd "$ROOT_DIR/frontend"
                npm install --silent
                npm run build

                echo "Starting services..."
                sudo systemctl start chess-backend
                sudo systemctl start nginx
                echo "Services started."
                sudo systemctl status chess-backend --no-pager

                ELAPSED=$((SECONDS - START_TIME))
                echo ""
                echo "✓ Completed in ${ELAPSED}s"
                ;;

            stop)
                echo "=== Stopping production services ==="
                sudo systemctl stop nginx
                sudo systemctl stop chess-backend
                echo "Services stopped."
                ;;

            restart)
                echo "=== Restarting production services ==="
                START_TIME=$SECONDS

                # Install backend dependencies
                echo "Installing backend dependencies..."
                cd "$ROOT_DIR/backend"
                source venv/bin/activate
                pip install -r requirements.txt --quiet

                # Build frontend
                echo "Building frontend..."
                cd "$ROOT_DIR/frontend"
                npm install --silent
                npm run build

                echo "Restarting services..."
                sudo systemctl restart chess-backend
                sudo systemctl restart nginx
                echo "Services restarted."
                sudo systemctl status chess-backend --no-pager

                ELAPSED=$((SECONDS - START_TIME))
                echo ""
                echo "✓ Completed in ${ELAPSED}s"
                echo ""
                echo "=== Tailing logs (Ctrl+C to exit) ==="
                sudo journalctl -u chess-backend -f
                ;;

            status)
                echo "=== Production services status ==="
                echo ""
                echo "--- chess-backend ---"
                sudo systemctl status chess-backend --no-pager || true
                echo ""
                echo "--- nginx ---"
                sudo systemctl status nginx --no-pager || true
                ;;

            logs)
                echo "=== Backend logs (Ctrl+C to exit) ==="
                sudo journalctl -u chess-backend -f
                ;;

            *)
                echo "Unknown command: $COMMAND"
                usage
                ;;
        esac
        ;;

    *)
        usage
        ;;
esac
