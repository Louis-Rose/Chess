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
./scripts/start.sh --prod
```

Builds the frontend and starts gunicorn on port 5001.

## Deployment (nginx)

Copy the nginx config:

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/chess
sudo ln -s /etc/nginx/sites-available/chess /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx
```
