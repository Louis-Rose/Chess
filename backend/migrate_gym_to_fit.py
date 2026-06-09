#!/usr/bin/env python3
"""One-off CLI: migrate historical gym_sets into the fit tables.

Run on the VM AFTER resync_gym.py, from the backend dir:

    cd ~/Chess/backend && FLASK_ENV=prod ./venv/bin/python migrate_gym_to_fit.py            # dry-run
    cd ~/Chess/backend && FLASK_ENV=prod ./venv/bin/python migrate_gym_to_fit.py --commit   # write

Groups gym_sets by session_date into one fit_sessions row per day for the
owner's account (GYM_OWNER_EMAIL), maps each old exercise name to a catalogue
leaf, and inserts fit_session_sets. Bodyweight (0 kg) becomes weight NULL.
Idempotent: a date that already has a fit_session for the user is skipped, so
re-running can't duplicate. Dry-run by default — it writes nothing without
--commit and prints a per-exercise summary to eyeball first.
"""
import os
import sys
from datetime import datetime, time

from dotenv import load_dotenv

load_dotenv(f".env.{os.environ.get('FLASK_ENV', 'prod')}")

from database import get_db  # noqa: E402  (env must load first)

# Old gym_sets.exercise  ->  new catalogue leaf  (None = skip, do not import).
# Names "Overhead Bar" / "Bar Pressdown" are the two halves produced by the
# parser split of the old "Overhead Bar → Bar Pressdown" superset row.
MAPPING = {
    'Cable crunch': 'Crunch',
    'Leg raises (roman chair)': 'Relevés de jambes',
    'Diverging Seated row Prise neutre': 'Rowing assis — Prise neutre',
    'Tractions': 'Tractions — Prise neutre',
    'Preacher Curl': 'Curl pupitre — Machine',
    'Bench press Prise + large Down & forward': 'Développé couché barre',
    'Dips': 'Dips',
    'Inclined bench press': 'Développé incliné barre',
    'Pec Deck': 'Pec Deck — Poignées',
    'Hack squat FULL ROM': 'Hack squat',
    'Horizontal leg press': 'Presse à cuisses horizontale',
    'Leg Extensions': 'Leg extension',
    'Prone leg curls': 'Leg curl allongé',
    'Seated leg curls': 'Leg curl assis',
    'Trap bar deadlift': 'Soulevé de terre barre hex',
    'Lateral raises': 'Élévations latérales — Haltères',
    'Shoulder Press': 'Développé épaules — Machine',
    'Overhead Bar': 'Extension poulie basse (overhead) — Barre',
    'Bar Pressdown': 'Extension poulie haute — Barre',
    'Seated Triceps Press': None,
}

# The "Overhead Bar → Bar Pressdown" superset only splits reliably on lines
# that used the comma (e.g. "12,7 x 24.8,18" → 12@24.8 overhead, 7@18
# pressdown). Non-comma days can't be attributed to one movement or the other,
# so for these two we import only comma-derived rows and drop the rest.
COMMA_ONLY = {'Overhead Bar', 'Bar Pressdown'}


def main(commit: bool):
    owner_email = (os.environ.get('GYM_OWNER_EMAIL') or '').strip().lower()
    if not owner_email:
        sys.exit('GYM_OWNER_EMAIL not set in the environment.')

    with get_db() as conn:
        urow = conn.execute('SELECT id FROM users WHERE lower(email) = ?', (owner_email,)).fetchone()
        if not urow:
            sys.exit(f'No user found with email {owner_email}.')
        user_id = urow['id']

        # Every distinct exercise must be mapped; otherwise we'd silently drop
        # data. An unmapped "A → B" name means the re-sync hasn't run yet.
        distinct = [r['exercise'] for r in conn.execute('SELECT DISTINCT exercise FROM gym_sets').fetchall()]
        unknown = sorted(e for e in distinct if e not in MAPPING)
        if unknown:
            sys.exit('Unmapped exercises in gym_sets (run resync_gym.py first?):\n  ' + '\n  '.join(unknown))

        rows = conn.execute(
            'SELECT session_date, exercise, reps, weight_kg, is_warmup, raw_line '
            'FROM gym_sets ORDER BY session_date, id'
        ).fetchall()

        by_date = {}
        for r in rows:
            by_date.setdefault(r['session_date'], []).append(r)

        already = {r['d'] for r in conn.execute(
            'SELECT DISTINCT started_at::date AS d FROM fit_sessions WHERE user_id = ?', (user_id,)
        ).fetchall()}

        sessions_created = sets_inserted = skipped_sets = skipped_dates = 0
        per_exercise = {}

        for d in sorted(by_date):
            if d in already:
                skipped_dates += 1
                continue
            mapped = []
            for r in by_date[d]:
                leaf = MAPPING[r['exercise']]
                if leaf is None:
                    skipped_sets += 1
                    continue
                # Split-pair exercises: keep only reliably-attributed comma rows.
                if r['exercise'] in COMMA_ONLY and ',' not in (r['raw_line'] or ''):
                    skipped_sets += 1
                    continue
                weight = None if not r['weight_kg'] else float(r['weight_kg'])
                mapped.append((leaf, weight, int(r['reps']), bool(r['is_warmup'])))
            if not mapped:
                continue

            started = datetime.combine(d, time(12, 0))
            if commit:
                sid = conn.execute(
                    'INSERT INTO fit_sessions (user_id, started_at, ended_at) VALUES (?, ?, ?) RETURNING id',
                    (user_id, started, started)
                ).fetchone()['id']
                for leaf, weight, reps, warmup in mapped:
                    conn.execute(
                        'INSERT INTO fit_session_sets (session_id, exercise, weight, reps, warmup) '
                        'VALUES (?, ?, ?, ?, ?)',
                        (sid, leaf, weight, reps, warmup)
                    )
            sessions_created += 1
            sets_inserted += len(mapped)
            for leaf, *_ in mapped:
                per_exercise[leaf] = per_exercise.get(leaf, 0) + 1

    print('COMMITTED' if commit else 'DRY-RUN (nothing written)')
    print(f'User: {owner_email} (id {user_id})')
    print(f'Sessions created : {sessions_created}')
    print(f'Sets inserted    : {sets_inserted}')
    print(f'Sets skipped     : {skipped_sets}  (mapped to None)')
    print(f'Dates skipped    : {skipped_dates}  (already had a fit_session)')
    print('Per exercise:')
    for leaf in sorted(per_exercise):
        print(f'   {per_exercise[leaf]:>4}  {leaf}')
    if not commit:
        print('\nLooks right? Re-run with --commit to write.')


if __name__ == '__main__':
    main('--commit' in sys.argv)
