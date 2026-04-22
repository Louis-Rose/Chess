"""Migrate the Notion gym table → a row-per-set Notion database.

Reads the existing table block on the GYM page, parses it with the live
parser from blueprints/gym.py, then either previews or creates a new Notion
database under the same parent page and inserts every historical set.

Usage (from backend/ with venv active):
    python3 scripts/gym_migrate_to_database.py --dry-run
    python3 scripts/gym_migrate_to_database.py --go

The script is idempotent: it writes the resulting database_id to
`scripts/.gym_database_id` after success so you can't accidentally create
two. Delete that file to force a new migration.

After a successful `--go`, add this line to backend/.env.dev and .env.prod:
    NOTION_GYM_DATABASE_ID=<id printed by this script>
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import pathlib
import sys
import time

import requests

# Allow `from blueprints.gym import ...`
HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from dotenv import load_dotenv
load_dotenv(HERE.parent / '.env.dev')

from blueprints.gym import _fetch_children, _parse_table, _cell_text  # noqa: E402

NOTION_API = 'https://api.notion.com/v1'
NOTION_VERSION = '2022-06-28'

STATE_FILE = HERE / '.gym_database_id'

DB_TITLE = 'Gym Sets (managed by LUMNA)'

SCHEMA = {
    'Exercise':      {'title': {}},
    'Date':          {'date': {}},
    'Muscle Group':  {'select': {'options': [
        {'name': 'SHOULDERS', 'color': 'orange'},
        {'name': 'CHEST',     'color': 'red'},
        {'name': 'BACK',      'color': 'blue'},
        {'name': 'BICEPS',    'color': 'yellow'},
        {'name': 'TRICEPS',   'color': 'purple'},
        {'name': 'ABS',       'color': 'green'},
        {'name': 'LEGS',      'color': 'pink'},
        {'name': 'OTHER',     'color': 'gray'},
    ]}},
    'Reps':          {'number': {'format': 'number'}},
    'Weight (kg)':   {'number': {'format': 'number'}},
    'Warmup':        {'checkbox': {}},
    'Session Note':  {'rich_text': {}},
    'Rating':        {'select': {'options': [
        {'name': '+', 'color': 'green'},
        {'name': '=', 'color': 'gray'},
        {'name': '-', 'color': 'red'},
    ]}},
}


def headers():
    token = os.environ.get('NOTION_GYM_TOKEN')
    if not token:
        sys.exit('NOTION_GYM_TOKEN missing from env')
    return {
        'Authorization': f'Bearer {token}',
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
    }


def fetch_page_table_rows() -> list[list[str]]:
    page_id = os.environ.get('NOTION_GYM_PAGE_ID')
    if not page_id:
        sys.exit('NOTION_GYM_PAGE_ID missing from env')
    blocks = _fetch_children(page_id)
    tables = [b for b in blocks if b['type'] == 'table']
    if not tables:
        sys.exit('No table block found on gym page')
    main = max(tables, key=lambda b: b['table']['table_width'])
    rows = _fetch_children(main['id'])
    return [[_cell_text(c) for c in r['table_row']['cells']] for r in rows]


def create_database(parent_page_id: str) -> str:
    payload = {
        'parent': {'type': 'page_id', 'page_id': parent_page_id},
        'title': [{'type': 'text', 'text': {'content': DB_TITLE}}],
        'properties': SCHEMA,
    }
    r = requests.post(f'{NOTION_API}/databases', headers=headers(), json=payload, timeout=30)
    if not r.ok:
        sys.exit(f'Failed to create database: {r.status_code} {r.text}')
    return r.json()['id']


def insert_page(database_id: str, record: dict) -> None:
    props = {
        'Exercise': {'title': [{'type': 'text', 'text': {'content': record['exercise']}}]},
        'Date':     {'date': {'start': record['session_date'].isoformat()}},
        'Muscle Group': {'select': {'name': record['muscle_group']}},
        'Reps':     {'number': record['reps']},
        'Weight (kg)': {'number': record['weight_kg']},
        'Warmup':   {'checkbox': bool(record['is_warmup'])},
    }
    payload = {
        'parent': {'database_id': database_id},
        'properties': props,
    }
    r = requests.post(f'{NOTION_API}/pages', headers=headers(), json=payload, timeout=30)
    if not r.ok:
        raise RuntimeError(f'Insert failed for {record}: {r.status_code} {r.text}')


def main():
    logging.basicConfig(level=logging.INFO, format='%(message)s')
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true', help='Preview only, no writes')
    ap.add_argument('--go', action='store_true', help='Actually create DB + insert rows')
    ap.add_argument('--force-new-db', action='store_true', help='Ignore the saved database_id state file')
    args = ap.parse_args()

    if not (args.dry_run or args.go):
        ap.error('Pass --dry-run to preview or --go to migrate')

    print('Fetching existing gym table from Notion…')
    rows = fetch_page_table_rows()
    records = _parse_table(rows)
    exercises = sorted({r['exercise'] for r in records})
    date_min = min(r['session_date'] for r in records)
    date_max = max(r['session_date'] for r in records)
    warmups = sum(1 for r in records if r['is_warmup'])

    print('\n── Preview ──')
    print(f'  Rows to insert : {len(records)}')
    print(f'    working sets : {len(records) - warmups}')
    print(f'    warmups      : {warmups}')
    print(f'  Date range     : {date_min} → {date_max}')
    print(f'  Exercises      : {len(exercises)}')
    for ex in exercises:
        count = sum(1 for r in records if r['exercise'] == ex)
        print(f'    - {ex} ({count} sets)')

    if args.dry_run:
        print('\nDry run complete. Re-run with --go to create the DB and insert rows.')
        return

    if STATE_FILE.exists() and not args.force_new_db:
        existing = STATE_FILE.read_text().strip()
        sys.exit(
            f'State file exists: database_id={existing}\n'
            f'Refusing to create a second DB. Delete {STATE_FILE} or pass --force-new-db.'
        )

    parent_page_id = os.environ['NOTION_GYM_PAGE_ID']
    print(f'\nCreating database under parent page {parent_page_id}…')
    db_id = create_database(parent_page_id)
    print(f'Database created: {db_id}')
    STATE_FILE.write_text(db_id)

    print(f'Inserting {len(records)} rows (rate-limited to ~3/sec)…')
    failed = []
    for i, rec in enumerate(records, 1):
        try:
            insert_page(db_id, rec)
        except Exception as e:
            failed.append((rec, str(e)))
            print(f'  [{i}/{len(records)}] FAIL: {e}')
            continue
        if i % 50 == 0:
            print(f'  [{i}/{len(records)}]')
        time.sleep(0.34)  # stay under Notion's 3 req/s average

    print('\nDone.')
    print(f'  inserted: {len(records) - len(failed)}')
    print(f'  failed  : {len(failed)}')
    if failed:
        print('\nFirst 5 failures:')
        for rec, err in failed[:5]:
            print(f'  {rec}: {err}')
    print(f'\nNext step — add to backend/.env.dev and .env.prod:')
    print(f'  NOTION_GYM_DATABASE_ID={db_id}')


if __name__ == '__main__':
    main()
