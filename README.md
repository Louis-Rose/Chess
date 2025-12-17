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

Build the frontend:

```bash
cd frontend && npm run build
```

## Deployment

### 1. Nginx

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/chess
sudo ln -s /etc/nginx/sites-available/chess /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx
```

### 2. Backend service

```bash
sudo cp deploy/chess-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable chess-backend
sudo systemctl start chess-backend
```

Check status: `sudo systemctl status chess-backend`
