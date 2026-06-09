#!/usr/bin/env python3
"""One-off CLI: re-sync gym_sets from Notion using the current parser.

Run on the VM from the backend dir, with the prod env:

    cd ~/Chess/backend && FLASK_ENV=prod ./venv/bin/python resync_gym.py

Loads .env.prod for the DB + NOTION_GYM_* credentials, re-fetches the Notion
page, re-parses it, and replaces all gym_sets rows. Run this before
migrate_gym_to_fit.py so the "Overhead Bar → Bar Pressdown" superset row gets
split into its two exercises by the updated parser.
"""
import os

from dotenv import load_dotenv

load_dotenv(f".env.{os.environ.get('FLASK_ENV', 'prod')}")

from blueprints.gym import resync_gym_sets  # noqa: E402  (env must load first)

if __name__ == '__main__':
    set_count, exercise_count = resync_gym_sets()
    print(f"Re-synced gym_sets: {set_count} sets across {exercise_count} exercises.")
