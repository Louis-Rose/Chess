# Project Notes for Claude

> **Note to self**: Keep this file updated when significant changes are made (new features, deployment changes, architecture updates).

## Overview
LUMNA — web app for tracking investment portfolios and Chess.com statistics.

## Architecture
- **Frontend**: React + Vite + TypeScript + Tailwind (port 5173 dev, built to `frontend/dist/`)
- **Backend**: Flask + Gunicorn (port 5001)
- **Reverse proxy**: nginx

## Deployment
- **VM**: Azure Ubuntu at `20.86.130.108`
- **Domain**: lumna.co
- **User**: azureuser
- **Repo path on VM**: `/home/azureuser/Chess`

## Key Commands

### Local development
```bash
./scripts/setup.sh           # First-time setup
./scripts/start.sh --dev     # Run dev servers
```

### Production (VM)
```bash
./scripts/start.sh --prod           # Start services
./scripts/start.sh --prod stop      # Stop services
./scripts/start.sh --prod restart   # Restart services
./scripts/start.sh --prod status    # Check status
./scripts/start.sh --prod logs      # View backend logs
```

## Pending
- None
