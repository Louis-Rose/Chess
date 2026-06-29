#!/bin/bash
# Production startup script - loads .env.prod and starts gunicorn

set -a
source /home/azureuser/Chess/backend/.env.prod
set +a

# Threaded workers (not gevent): the Gemini SDK makes blocking network calls,
# and gevent without monkey-patching wouldn't yield on them, serializing
# requests. Threads release the GIL during that I/O, so the Notice.ai
# "classify all pages" pool actually runs concurrently. 2 workers x 8 threads
# = 16 in-flight requests. DB connections are per-request, so this is safe.
exec /home/azureuser/Chess/backend/venv/bin/gunicorn \
    --bind 127.0.0.1:5001 \
    --workers 2 \
    --worker-class gthread \
    --threads 8 \
    --timeout 300 \
    app:app
