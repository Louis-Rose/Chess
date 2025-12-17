# Chess Stats App

Web app for visualizing Chess.com player statistics.

## Prerequisites

- Python 3.x
- Node.js & npm
- For production: nginx

## Setup

```bash
./scripts/setup.sh
```

## Running the App

### Development (local)

```bash
./scripts/start.sh --dev
```

Opens two dev servers:
- Backend: http://localhost:5001
- Frontend: http://localhost:5173

Press `Ctrl+C` to stop both.

### Production (VM)

```bash
./scripts/start.sh --prod           # Start services
./scripts/start.sh --prod stop      # Stop services
./scripts/start.sh --prod restart   # Restart services
./scripts/start.sh --prod status    # Check status
./scripts/start.sh --prod logs      # View backend logs
```

## Deployment (first time)

### 1. Nginx

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/chess
sudo ln -s /etc/nginx/sites-available/chess /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

### 2. Backend service

```bash
sudo cp deploy/chess-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable chess-backend
```

Then start with `./scripts/start.sh --prod`
