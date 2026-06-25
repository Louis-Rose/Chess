# LUMNA clothing agent — worker

The `/clothing` page on LUMNA lets you type what you're shopping for and have an
agent browse stores for it. Bot-protected stores (Octobre is behind DataDome)
refuse requests from the server, so the actual browsing runs **here, on your own
machine**: a real Chrome window on your home connection, which the stores treat
as a normal visitor.

```
browser ─▶ lumna.co  ─▶  job queue
                              │  (this worker polls it)
                    your laptop ─▶ real Chrome ─▶ searches each store ─▶ posts results back
```

## One-time setup

```bash
cd tools/clothing-worker
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
playwright install chrome        # uses your installed Google Chrome

cp .env.example .env             # then edit it (see below)
```

In `.env`, set `CLOTHING_WORKER_SECRET` to a random string and put the **same**
value in the backend environment on the VM (`CLOTHING_WORKER_SECRET=…`), then
restart the backend. Generate one with:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

## Run

```bash
source .venv/bin/activate
set -a; source .env; set +a       # load .env into the shell
python worker.py
```

A Chrome window opens and the worker starts polling. Leave it running whenever
you want `/clothing` search to work — if it's off, the page just says your agent
is offline.

**Bot checks:** the first time a store challenges you, solve it once in the
Chrome window. The cookie is saved in `./chrome-profile/`, so later runs skip it.

## Adding a store

Each store needs a small "recipe" (how to search it, how to read its product
tiles). Octobre is built in. For a new store, add a function like
`search_octobre` in `worker.py` and register it in the `RECIPES` dict by domain.
Unknown domains fall back to a generic `?q=` search + best-effort scrape, which
works on some sites and not others.
```
