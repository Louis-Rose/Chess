#!/bin/bash
# Production startup script - loads .env.prod and starts gunicorn

set -a
source /home/azureuser/Chess/backend/.env.prod
set +a

exec /home/azureuser/Chess/backend/venv/bin/gunicorn \
    --bind 127.0.0.1:5001 \
    --worker-class gevent \
    --timeout 300 \
    app:app
