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
- Backend: http://localhost:5000
- Frontend: http://localhost:5173

Press `Ctrl+C` to stop both.

### Production (VM)

```bash
./scripts/start.sh --prod
```

Builds the frontend and starts gunicorn on port 5000.

Configure nginx to:
- Serve the built frontend from `frontend/dist/`
- Proxy `/api` requests to `localhost:5000`
