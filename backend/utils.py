import math
import requests
import datetime
import pandas as pd
import numpy as np
import json
from scipy.optimize import minimize
from scipy.special import expit  # logistic function
from youtube_transcript_api import YouTubeTranscriptApi

# --- Data Fetching Functions ---

def fetch_player_data_and_stats(USERNAME):
    headers = {'User-Agent': 'MyPythonScript/1.0 (contact@example.com)'}
    data_url = f"https://api.chess.com/pub/player/{USERNAME}"
    stats_url = f"https://api.chess.com/pub/player/{USERNAME}/stats"

    data_response = requests.get(data_url, headers=headers)
    if data_response.status_code == 404:
        raise ValueError(f"Player '{USERNAME}' not found on Chess.com")
    data_response.raise_for_status()

    stats_response = requests.get(stats_url, headers=headers)
    stats_response.raise_for_status()

    return data_response.json() | stats_response.json()

def fetch_player_games_archives(USERNAME):
    url = f"https://api.chess.com/pub/player/{USERNAME}/games/archives"
    headers = {'User-Agent': 'MyPythonScript/1.0 (contact@example.com)'}
    response = requests.get(url, headers=headers)
    if response.status_code == 404:
        raise ValueError(f"Player '{USERNAME}' not found on Chess.com")
    response.raise_for_status()
    data = response.json()
    return data["archives"]


def fetch_stats_streaming(USERNAME, time_class='rapid', cached_stats=None, last_archive=None):
    """
    Generator that fetches all stats in a single pass through archives.
    Yields SSE-formatted progress events and final data.

    If cached_stats and last_archive are provided, performs incremental update:
    - Only fetches archives newer than last_archive
    - Merges new data with cached_stats
    """
    # Delegate to multi-time-class function
    for chunk in fetch_all_time_classes_streaming(USERNAME, time_class, cached_stats, last_archive):
        yield chunk


def fetch_all_time_classes_streaming(USERNAME, requested_time_class='rapid', cached_stats_map=None, last_archive=None, archives=None):
    """
    Generator that fetches stats for ALL time classes (rapid, blitz) in a single pass.
    Yields SSE-formatted progress events and final data for the requested time class.

    Also returns all_time_classes_data in the final message for caching.

    cached_stats_map: dict of {time_class: stats_data} for incremental updates
    archives: optional pre-fetched archives list to avoid redundant API calls
    """
    TIME_CLASSES = ['rapid', 'blitz']
    headers = {'User-Agent': 'MyChessStatsApp/1.0 (contact@example.com)'}

    # Step 1: Get archives list (use provided or fetch)
    if archives is None:
        archives = fetch_player_games_archives(USERNAME)

    # For incremental updates, filter to only new archives
    archives_to_fetch = archives
    if last_archive and last_archive in archives:
        last_idx = archives.index(last_archive)
        archives_to_fetch = archives[last_idx + 1:]

    total_archives = len(archives_to_fetch)
    is_incremental = cached_stats_map is not None and total_archives < len(archives)

    yield f"data: {json.dumps({'type': 'start', 'total_archives': total_archives, 'incremental': is_incremental})}\n\n"

    # Initialize data structures for EACH time class
    tc_data = {}
    for tc in TIME_CLASSES:
        cached = cached_stats_map.get(tc) if cached_stats_map else None
        if cached:
            tc_data[tc] = {
                'games_by_week': {d['date']: d['games_played'] for d in cached.get('history', [])},
                'elo_by_week': {d['date']: {'elo': d['elo'], 'timestamp': 0} for d in cached.get('elo_history', [])},
                'games_by_day': {},
                'games_by_hour': {},  # Track win rate by hour of day
                'openings_white': [],
                'openings_black': [],
                'total_games': cached.get('total_games', 0),
                'cached_game_number_stats': cached.get('game_number_stats', []),  # Preserve for incremental updates
                'cached_daily_volume_stats': cached.get('daily_volume_stats', []),  # Preserve for incremental updates
                'cached_streak_stats': cached.get('streak_stats', []),  # Preserve for incremental updates
                'cached_hourly_stats': cached.get('hourly_stats', []),  # Preserve for incremental updates
                'cached_win_prediction': cached.get('win_prediction'),  # Preserve for incremental updates
            }
        else:
            tc_data[tc] = {
                'games_by_week': {},
                'elo_by_week': {},
                'games_by_day': {},
                'games_by_hour': {},  # Track win rate by hour of day
                'openings_white': [],
                'openings_black': [],
                'total_games': 0,
                'cached_game_number_stats': [],
                'cached_daily_volume_stats': [],
                'cached_streak_stats': [],
                'cached_hourly_stats': [],
                'cached_win_prediction': None,
            }

    # Track totals across all time classes
    total_rapid = 0
    total_blitz = 0
    if cached_stats_map:
        # Get totals from any cached data (they're the same across time classes)
        for tc, cached in cached_stats_map.items():
            if cached:
                total_rapid = cached.get('total_rapid', 0)
                total_blitz = cached.get('total_blitz', 0)
                break

    # Step 2: Process each archive (only new ones if incremental)
    for idx, archive_url in enumerate(archives_to_fetch):
        parts = archive_url.split('/')
        year_month = f"{parts[-2]}-{parts[-1]}"

        yield f"data: {json.dumps({'type': 'progress', 'current': idx + 1, 'total': total_archives, 'month': year_month})}\n\n"

        try:
            response = requests.get(archive_url, headers=headers)
            response.raise_for_status()
            data = response.json()

            for game in data.get('games', []):
                game_time_class = game.get('time_class')
                end_time = game.get('end_time')
                if not end_time:
                    continue

                # Count all rapid and blitz games
                if game_time_class == 'rapid':
                    total_rapid += 1
                elif game_time_class == 'blitz':
                    total_blitz += 1

                # Skip if not a time class we track
                if game_time_class not in TIME_CLASSES:
                    continue

                game_date = datetime.datetime.fromtimestamp(end_time)
                date_str = game_date.strftime('%Y-%m-%d')

                # Get data structure for this time class
                tcd = tc_data[game_time_class]
                tcd['total_games'] += 1

                if date_str not in tcd['games_by_week']:
                    tcd['games_by_week'][date_str] = 0
                tcd['games_by_week'][date_str] += 1

                # Determine user's side and rating
                if game['white']['username'].lower() == USERNAME.lower():
                    rating = game['white'].get('rating')
                    result_code = game['white'].get('result')
                    side = 'white'
                elif game['black']['username'].lower() == USERNAME.lower():
                    rating = game['black'].get('rating')
                    result_code = game['black'].get('result')
                    side = 'black'
                else:
                    continue

                # Elo per day
                if rating:
                    if date_str not in tcd['elo_by_week'] or end_time > tcd['elo_by_week'][date_str]['timestamp']:
                        tcd['elo_by_week'][date_str] = {'elo': rating, 'timestamp': end_time}

                # Game number stats
                game_result = get_game_result(result_code)
                date_key = game_date.strftime('%Y-%m-%d')
                if date_key not in tcd['games_by_day']:
                    tcd['games_by_day'][date_key] = []
                tcd['games_by_day'][date_key].append((end_time, game_result))

                # Hourly stats (win rate by 2-hour groups for better statistical significance)
                hour_group = game_date.hour // 2  # 0-1 -> 0, 2-3 -> 1, etc.
                if hour_group not in tcd['games_by_hour']:
                    tcd['games_by_hour'][hour_group] = {'wins': 0, 'draws': 0, 'total': 0}
                tcd['games_by_hour'][hour_group]['total'] += 1
                if game_result == 'win':
                    tcd['games_by_hour'][hour_group]['wins'] += 1
                elif game_result == 'draw':
                    tcd['games_by_hour'][hour_group]['draws'] += 1

                # Openings (last 12 months only)
                if archive_url in archives[-12:] and 'eco' in game:
                    opening_data = {'opening': game['eco'], 'result': game_result}
                    if side == 'white':
                        tcd['openings_white'].append(opening_data)
                    else:
                        tcd['openings_black'].append(opening_data)

        except requests.exceptions.RequestException as e:
            print(f"Error fetching {archive_url}: {e}")

    # Step 3: Process collected data for ALL time classes
    yield f"data: {json.dumps({'type': 'processing', 'message': 'Processing collected data...'})}\n\n"

    last_archive_processed = archives[-1] if archives else None
    all_time_classes_data = {}

    for tc in TIME_CLASSES:
        tcd = tc_data[tc]

        # Games per day
        games_per_day_data = [
            {'date': date_str, 'games_played': count}
            for date_str, count in tcd['games_by_week'].items()
        ]
        games_per_day_data.sort(key=lambda x: x['date'])
        games_per_day_data = fill_missing_days(games_per_day_data)

        # Elo per day
        elo_per_day_data = [
            {'date': date_str, 'elo': data['elo']}
            for date_str, data in tcd['elo_by_week'].items()
        ]
        elo_per_day_data.sort(key=lambda x: x['date'])
        elo_per_day_data = fill_missing_days_elo(elo_per_day_data)

        # Game number stats
        game_number_stats = {}
        for date_key, games in tcd['games_by_day'].items():
            games.sort(key=lambda x: x[0])
            for i, (timestamp, result) in enumerate(games):
                game_number = i + 1
                if game_number not in game_number_stats:
                    game_number_stats[game_number] = {'wins': 0, 'draws': 0, 'total': 0}
                game_number_stats[game_number]['total'] += 1
                if result == 'win':
                    game_number_stats[game_number]['wins'] += 1
                elif result == 'draw':
                    game_number_stats[game_number]['draws'] += 1

        game_number_result = []
        for game_number in sorted(game_number_stats.keys()):
            stats = game_number_stats[game_number]
            if stats['total'] > 0:
                win_rate = ((stats['wins'] + 0.5 * stats['draws']) / stats['total']) * 100
            else:
                win_rate = 0
            game_number_result.append({
                'game_number': game_number,
                'win_rate': round(win_rate, 1),
                'sample_size': stats['total']
            })
        game_number_result = [d for d in game_number_result if d['game_number'] <= 15 and d['sample_size'] >= 5]

        # For incremental updates, games_by_day only has new games, so use cached stats if new is empty
        if not game_number_result and tcd.get('cached_game_number_stats'):
            game_number_result = tcd['cached_game_number_stats']

        # Daily volume stats: win/draw/loss breakdown grouped by number of games per day
        daily_volume_stats_map = {}
        for date_key, games in tcd['games_by_day'].items():
            n_games = len(games)
            if n_games not in daily_volume_stats_map:
                daily_volume_stats_map[n_games] = {'days': 0, 'wins': 0, 'draws': 0, 'losses': 0, 'total': 0}
            bucket = daily_volume_stats_map[n_games]
            bucket['days'] += 1
            for _ts, result in games:
                bucket['total'] += 1
                if result == 'win':
                    bucket['wins'] += 1
                elif result == 'draw':
                    bucket['draws'] += 1
                else:
                    bucket['losses'] += 1
        daily_volume_stats = []
        for n_games in sorted(daily_volume_stats_map.keys()):
            b = daily_volume_stats_map[n_games]
            t = b['total'] or 1
            daily_volume_stats.append({
                'games_per_day': n_games,
                'days': b['days'],
                'win_pct': round(b['wins'] / t * 100, 1),
                'draw_pct': round(b['draws'] / t * 100, 1),
                'loss_pct': round(b['losses'] / t * 100, 1),
                'total_games': b['total'],
            })

        if not daily_volume_stats and tcd.get('cached_daily_volume_stats'):
            daily_volume_stats = tcd['cached_daily_volume_stats']

        # Streak stats: win rate after EXACTLY N consecutive wins/losses
        all_games_chrono = []
        for date_key, games in tcd['games_by_day'].items():
            for ts, result in games:
                all_games_chrono.append((ts, result))
        all_games_chrono.sort(key=lambda x: x[0])

        # Find max consecutive streak lengths in the data
        max_streak = {'win': 0, 'loss': 0}
        cur_len, cur_type = 0, None
        for _, result in all_games_chrono:
            if result == cur_type:
                cur_len += 1
            else:
                cur_len = 1
                cur_type = result
            if result in max_streak:
                max_streak[result] = max(max_streak[result], cur_len)
        max_len = max(max_streak.get('win', 1), max_streak.get('loss', 1))
        streak_range = list(range(1, max_len + 1))

        streak_buckets = {}
        for streak_len in streak_range:
            for streak_type in ['win', 'loss']:
                streak_buckets[(streak_len, streak_type)] = {'wins': 0, 'draws': 0, 'total': 0}

        for i in range(1, len(all_games_chrono)):
            for streak_len in streak_range:
                if i < streak_len:
                    continue
                for streak_type in ['win', 'loss']:
                    # Check that the previous streak_len games are all the same type
                    is_streak = all(all_games_chrono[i - j - 1][1] == streak_type for j in range(streak_len))
                    if not is_streak:
                        continue
                    # Check EXACT: the game before the streak must NOT be the same type (or not exist)
                    before_idx = i - streak_len - 1
                    is_exact = before_idx < 0 or all_games_chrono[before_idx][1] != streak_type
                    if is_exact:
                        b = streak_buckets[(streak_len, streak_type)]
                        b['total'] += 1
                        if all_games_chrono[i][1] == 'win':
                            b['wins'] += 1
                        elif all_games_chrono[i][1] == 'draw':
                            b['draws'] += 1

        streak_stats = []
        for streak_len in streak_range:
            for streak_type in ['win', 'loss']:
                b = streak_buckets[(streak_len, streak_type)]
                if b['total'] == 0:
                    continue  # Skip streak lengths with no occurrences
                win_rate = round(((b['wins'] + 0.5 * b['draws']) / b['total']) * 100, 1)
                streak_stats.append({
                    'streak_type': streak_type,
                    'streak_length': streak_len,
                    'win_rate': win_rate,
                    'sample_size': b['total'],
                })

        if not streak_stats and tcd.get('cached_streak_stats'):
            streak_stats = tcd['cached_streak_stats']

        # Hourly stats (win rate by 2-hour groups)
        hourly_result = []
        for hour_group in range(12):  # 12 groups of 2 hours each
            if hour_group in tcd['games_by_hour']:
                stats = tcd['games_by_hour'][hour_group]
                if stats['total'] > 0:
                    win_rate = ((stats['wins'] + 0.5 * stats['draws']) / stats['total']) * 100
                else:
                    win_rate = 0
                start_hour = hour_group * 2
                hourly_result.append({
                    'hour_group': hour_group,
                    'start_hour': start_hour,
                    'end_hour': start_hour + 1,
                    'win_rate': round(win_rate, 1),
                    'sample_size': stats['total']
                })

        # For incremental updates, use cached stats if new is empty
        if not hourly_result and tcd.get('cached_hourly_stats'):
            hourly_result = tcd['cached_hourly_stats']

        # Openings
        openings = {
            'white': group_opening_stats(tcd['openings_white']),
            'black': group_opening_stats(tcd['openings_black'])
        }
        processed_openings = process_openings_for_json(openings)

        # Win prediction analysis (use cached if no new games processed)
        if tcd['games_by_day']:
            win_prediction = compute_win_prediction_from_games(tcd['games_by_day'])
        elif tcd.get('cached_win_prediction'):
            win_prediction = tcd['cached_win_prediction']
        else:
            win_prediction = {'error': 'No game data available', 'sample_size': 0}

        all_time_classes_data[tc] = {
            'time_class': tc,
            'history': games_per_day_data,
            'elo_history': elo_per_day_data,
            'total_games': tcd['total_games'],
            'total_rapid': total_rapid,
            'total_blitz': total_blitz,
            'openings': processed_openings,
            'game_number_stats': game_number_result,
            'daily_volume_stats': daily_volume_stats,
            'streak_stats': streak_stats,
            'hourly_stats': hourly_result,
            'win_prediction': win_prediction,
            'last_archive': last_archive_processed
        }

    # Step 4: Yield final result with requested time class data
    # Also include all_time_classes_data for caching
    requested_data = all_time_classes_data.get(requested_time_class, all_time_classes_data.get('rapid'))

    final_data = {
        'type': 'complete',
        'data': requested_data,
        'all_time_classes': all_time_classes_data  # For caching
    }

    yield f"data: {json.dumps(final_data)}\n\n"


def fetch_games_played_per_day(USERNAME, time_class=None, archives=None):
    """Fetch games played per day, optionally filtered by time class."""
    monthly_archives_urls_list = archives if archives is not None else fetch_player_games_archives(USERNAME)
    games_by_day = {}
    headers = {'User-Agent': 'MyChessStatsApp/1.0 (contact@example.com)'}

    for archive_url in monthly_archives_urls_list:
        try:
            response = requests.get(archive_url, headers=headers)
            response.raise_for_status()
            data = response.json()

            for game in data.get('games', []):
                # Filter by time class if specified
                if time_class and game.get('time_class') != time_class:
                    continue

                end_time = game.get('end_time')
                if not end_time:
                    continue

                date_str = datetime.datetime.fromtimestamp(end_time).strftime('%Y-%m-%d')

                if date_str not in games_by_day:
                    games_by_day[date_str] = 0
                games_by_day[date_str] += 1

            parts = archive_url.split('/')
            print(f"Processed {parts[-2]}-{parts[-1]}")

        except requests.exceptions.RequestException as e:
            print(f"Error fetching {archive_url}: {e}")

    games_per_day_data = [
        {'date': date_str, 'games_played': count}
        for date_str, count in games_by_day.items()
    ]
    games_per_day_data.sort(key=lambda x: x['date'])

    return fill_missing_days(games_per_day_data)

def fetch_elo_per_day(USERNAME, time_class='rapid', archives=None):
    """Fetch the last Elo rating per day for a given time control.
    Returns: (elo_per_day_data, total_games_count)
    """
    monthly_archives_urls_list = archives if archives is not None else fetch_player_games_archives(USERNAME)
    elo_by_day = {}  # {date_str: {'elo': rating, 'timestamp': end_time}}
    total_games = 0
    headers = {'User-Agent': 'MyChessStatsApp/1.0 (contact@example.com)'}

    for archive_url in monthly_archives_urls_list:
        try:
            response = requests.get(archive_url, headers=headers)
            response.raise_for_status()
            data = response.json()

            for game in data.get('games', []):
                # Filter by time class
                if game.get('time_class') != time_class:
                    continue

                total_games += 1

                end_time = game.get('end_time')
                if not end_time:
                    continue

                # Determine which color the user played
                if game['white']['username'].lower() == USERNAME.lower():
                    rating = game['white'].get('rating')
                elif game['black']['username'].lower() == USERNAME.lower():
                    rating = game['black'].get('rating')
                else:
                    continue

                if not rating:
                    continue

                date_str = datetime.datetime.fromtimestamp(end_time).strftime('%Y-%m-%d')

                # Keep the most recent game's rating for each day
                if date_str not in elo_by_day or end_time > elo_by_day[date_str]['timestamp']:
                    elo_by_day[date_str] = {'elo': rating, 'timestamp': end_time}

            parts = archive_url.split('/')
            print(f"Processed Elo {parts[-2]}-{parts[-1]}")

        except requests.exceptions.RequestException as e:
            print(f"Error fetching {archive_url}: {e}")

    elo_per_day_data = [
        {'date': date_str, 'elo': data['elo']}
        for date_str, data in elo_by_day.items()
    ]
    elo_per_day_data.sort(key=lambda x: x['date'])

    return fill_missing_days_elo(elo_per_day_data), total_games

def fetch_win_rate_by_game_number(USERNAME, time_class='rapid', archives=None):
    """
    Calculate win rate by game number per day.
    E.g., what's the win rate for the 1st game of the day, 2nd game, etc.
    Returns: list of {game_number, win_rate, sample_size}
    """
    monthly_archives_urls_list = archives if archives is not None else fetch_player_games_archives(USERNAME)
    headers = {'User-Agent': 'MyChessStatsApp/1.0 (contact@example.com)'}

    # Collect all games with their date and timestamp
    games_by_day = {}  # {date_string: [(timestamp, result), ...]}

    for archive_url in monthly_archives_urls_list:
        try:
            response = requests.get(archive_url, headers=headers)
            response.raise_for_status()
            data = response.json()

            for game in data.get('games', []):
                # Filter by time class
                if game.get('time_class') != time_class:
                    continue

                end_time = game.get('end_time')
                if not end_time:
                    continue

                # Determine which color the user played and the result
                if game['white']['username'].lower() == USERNAME.lower():
                    result = game['white'].get('result')
                elif game['black']['username'].lower() == USERNAME.lower():
                    result = game['black'].get('result')
                else:
                    continue

                # Convert result to win/loss/draw
                game_result = get_game_result(result)

                # Group by day
                game_date = datetime.datetime.fromtimestamp(end_time)
                date_key = game_date.strftime('%Y-%m-%d')

                if date_key not in games_by_day:
                    games_by_day[date_key] = []
                games_by_day[date_key].append((end_time, game_result))

            parts = archive_url.split('/')
            print(f"Processed game numbers {parts[-2]}-{parts[-1]}")

        except requests.exceptions.RequestException as e:
            print(f"Error fetching {archive_url}: {e}")

    # For each day, sort games by timestamp and assign game numbers
    game_number_stats = {}  # {game_number: {'wins': 0, 'total': 0}}

    for date_key, games in games_by_day.items():
        # Sort by timestamp
        games.sort(key=lambda x: x[0])

        for idx, (timestamp, result) in enumerate(games):
            game_number = idx + 1  # 1-indexed

            if game_number not in game_number_stats:
                game_number_stats[game_number] = {'wins': 0, 'draws': 0, 'total': 0}

            game_number_stats[game_number]['total'] += 1
            if result == 'win':
                game_number_stats[game_number]['wins'] += 1
            elif result == 'draw':
                game_number_stats[game_number]['draws'] += 1

    # Convert to output format
    result_data = []
    for game_number in sorted(game_number_stats.keys()):
        stats = game_number_stats[game_number]
        # Adjusted win rate (wins + 0.5 * draws)
        if stats['total'] > 0:
            win_rate = ((stats['wins'] + 0.5 * stats['draws']) / stats['total']) * 100
        else:
            win_rate = 0

        result_data.append({
            'game_number': game_number,
            'win_rate': round(win_rate, 1),
            'sample_size': stats['total']
        })

    # Only return up to game 10 or where sample_size >= 5
    filtered_data = [d for d in result_data if d['game_number'] <= 15 and d['sample_size'] >= 5]

    return filtered_data

def fill_missing_days_elo(data):
    """Fill missing days by carrying forward the last known Elo."""
    if not data:
        return []

    data.sort(key=lambda x: x['date'])
    existing_data = {d['date']: d['elo'] for d in data}

    start_date = datetime.date.fromisoformat(data[0]['date'])
    end_date = datetime.date.fromisoformat(data[-1]['date'])

    filled_data = []
    curr_date = start_date
    last_elo = data[0]['elo']
    one_day = datetime.timedelta(days=1)

    while curr_date <= end_date:
        date_str = curr_date.isoformat()
        if date_str in existing_data:
            last_elo = existing_data[date_str]
        filled_data.append({'date': date_str, 'elo': last_elo})
        curr_date += one_day

    return filled_data

def fetch_all_openings(USERNAME, monthly_games_archives_urls_list):
    chess_openings_played_dict = {"white" : [], "black" : []}
    headers = {'User-Agent': 'MyPythonScript/1.0 (contact@example.com)'}
    
    print(f"Fetching detailed games for {USERNAME}...")
    
    # Limit to last 12 months to avoid API timeouts if history is huge
    # Remove the slice [:-12] if you want absolutely everything
    recent_archives = monthly_games_archives_urls_list[-12:] 

    for archive_url in recent_archives:
        try:
            response = requests.get(archive_url, headers=headers)
            response.raise_for_status()
            data = response.json()
            for game in data["games"]:
                # Some games might not have an ECO code (rare)
                if "eco" in game:
                    chess_opening_played = game["eco"]
                    side_played = "white" if game["white"]["username"].lower() == USERNAME.lower() else "black"
                    game_result = get_game_result(game[side_played]["result"])
                    chess_openings_played_dict[side_played].append({"opening" : chess_opening_played, "result" : game_result})
        except Exception as e:
            print(f"Skipping archive {archive_url} due to error: {e}")
            
    return {
        "white": group_opening_stats(chess_openings_played_dict["white"]), 
        "black": group_opening_stats(chess_openings_played_dict["black"])
    }

# --- Helper Functions ---

def fill_missing_days(data):
    if not data: return []
    data.sort(key=lambda x: x['date'])

    existing_data = {d['date']: d['games_played'] for d in data}

    start_date = datetime.date.fromisoformat(data[0]['date'])
    end_date = datetime.date.fromisoformat(data[-1]['date'])

    filled_data = []
    curr_date = start_date
    one_day = datetime.timedelta(days=1)

    while curr_date <= end_date:
        date_str = curr_date.isoformat()
        count = existing_data.get(date_str, 0)
        filled_data.append({'date': date_str, 'games_played': count})
        curr_date += one_day

    return filled_data

def get_game_result(result_code):
    if result_code == 'win': return 'win'
    if result_code in ['checkmated', 'resigned', 'timeout', 'abandoned', 'kingofthehill', 'threecheck']: return 'loss'
    return 'draw'

def wilson_interval(games, win_rate):
    # Modified to return a dictionary for JSON serialization
    if games == 0: return {"lower": 0, "upper": 0}
    n = games
    p = win_rate / 100.0
    z = 1.96 
    numerator = p + z**2 / (2*n)
    denominator = 1 + z**2 / n
    term2 = z * math.sqrt((p*(1-p)/n) + z**2/(4*n**2))
    lower = (numerator - term2) / denominator
    upper = (numerator + term2) / denominator
    return {"lower": max(0, lower*100), "upper": min(100, upper*100)}

def group_opening_stats(games_list):
    MINIMUM_GAMES = 5 # Lowered slightly for testing
    grouped_data = {}

    # Simplified mapping for brevity - ensure you include your full list here if needed
    categories = [
        ("Sicilian", "Sicilian Defense"), ("French", "French Defense"), ("Ruy-Lopez", "Ruy Lopez"),
        ("Caro-Kann", "Caro-Kann"), ("Italian", "Italian Game"), ("Queens-Gambit", "Queen's Gambit"),
        ("London", "London System"), ("Kings-Indian", "King's Indian"), ("English", "English Opening")
    ]

    for game in games_list:
        url = game.get('opening')
        result = game.get('result')
        if not url: continue

        slug = url.split('/')[-1]
        clean_name = "Other"
        
        # Try to match categories
        for prefix, name in categories:
            if slug.startswith(prefix):
                clean_name = name
                break
        
        if clean_name == "Other":
             # Fallback: just take the first word of the slug
             clean_name = slug.split('-')[0]

        if clean_name not in grouped_data:
            grouped_data[clean_name] = {'games': 0, 'wins': 0, 'losses': 0, 'draws': 0}

        stats = grouped_data[clean_name]
        stats['games'] += 1
        if result == 'win': stats['wins'] += 1
        elif result == 'loss': stats['losses'] += 1
        else: stats['draws'] += 1

    results_list = []
    for name, data in grouped_data.items():
        win_rate = (data['wins'] / data['games']) * 100 if data['games'] > 0 else 0
        draw_rate = (data['draws'] / data['games']) * 100 if data['games'] > 0 else 0
        # Adjusted win rate (Win + 0.5 * Draw)
        adj_win_rate = win_rate + (draw_rate / 2)
        
        results_list.append({
            'opening': name,
            'games': data['games'],
            'win_rate': round(adj_win_rate, 1)
        })

    filtered = [g for g in results_list if g["games"] >= MINIMUM_GAMES]
    return sorted(filtered, key=lambda x: x['games'], reverse=True)

def compute_win_prediction_from_games(games_by_day):
    """
    Compute win prediction analysis from already-collected games_by_day data.
    Uses logistic regression with four predictors:
    1. Previous game result (momentum/tilt)
    2. Hour of day (2-hour spans)
    3. Day balance (cumulative wins - losses so far that day)
    4. Minutes since last game
    """
    # Build pairs of (previous_result, current_result, hour, day_balance, minutes_gap) for same-day consecutive games
    pairs = []
    for date_key, games in games_by_day.items():
        # Sort games by timestamp within each day
        sorted_games = sorted(games, key=lambda x: x[0])

        # Track cumulative day balance (wins - losses)
        day_balance = 0

        for i in range(1, len(sorted_games)):
            prev_result = sorted_games[i - 1][1]  # 'win', 'draw', 'loss'
            curr_result = sorted_games[i][1]
            prev_timestamp = sorted_games[i - 1][0]
            curr_timestamp = sorted_games[i][0]

            # Update day balance based on previous game
            if prev_result == 'win':
                day_balance += 1
            elif prev_result == 'loss':
                day_balance -= 1
            # draws don't change balance

            # Extract hour group (2-hour spans: 0-1, 2-3, etc.)
            game_hour = datetime.datetime.fromtimestamp(curr_timestamp).hour
            hour_group = game_hour // 2  # 0-11 representing 2-hour blocks

            # Calculate minutes since last game
            minutes_since_last = (curr_timestamp - prev_timestamp) / 60.0

            # Convert results to numeric
            prev_win = 1 if prev_result == 'win' else (0.5 if prev_result == 'draw' else 0)
            curr_win = 1 if curr_result == 'win' else (0.5 if curr_result == 'draw' else 0)

            pairs.append({
                'prev_win': prev_win,
                'curr_win': curr_win,
                'hour_group': hour_group,
                'day_balance': day_balance,
                'minutes_since_last': minutes_since_last,
            })

    if len(pairs) < 50:
        return {
            'error': 'Not enough consecutive same-day games for analysis (need at least 50 pairs)',
            'sample_size': len(pairs)
        }

    # Calculate conditional win rates by previous result
    after_win = [p['curr_win'] for p in pairs if p['prev_win'] == 1]
    after_loss = [p['curr_win'] for p in pairs if p['prev_win'] == 0]
    after_draw = [p['curr_win'] for p in pairs if p['prev_win'] == 0.5]

    win_rate_after_win = (sum(after_win) / len(after_win) * 100) if after_win else None
    win_rate_after_loss = (sum(after_loss) / len(after_loss) * 100) if after_loss else None
    win_rate_after_draw = (sum(after_draw) / len(after_draw) * 100) if after_draw else None

    games_after_win = len(after_win)
    games_after_loss = len(after_loss)
    games_after_draw = len(after_draw)

    # Calculate win rates by hour group
    hourly_stats = {}
    for p in pairs:
        hg = p['hour_group']
        if hg not in hourly_stats:
            hourly_stats[hg] = {'wins': 0, 'total': 0}
        hourly_stats[hg]['total'] += 1
        if p['curr_win'] == 1:
            hourly_stats[hg]['wins'] += 1

    # Find best and worst hours
    hourly_win_rates = {}
    for hg, stats in hourly_stats.items():
        if stats['total'] >= 10:  # Minimum sample size
            hourly_win_rates[hg] = (stats['wins'] / stats['total']) * 100

    best_hour_group = max(hourly_win_rates, key=hourly_win_rates.get) if hourly_win_rates else None
    worst_hour_group = min(hourly_win_rates, key=hourly_win_rates.get) if hourly_win_rates else None

    # Logistic Regression with four predictors
    prev_won = np.array([1 if p['prev_win'] == 1 else 0 for p in pairs])
    curr_won = np.array([1 if p['curr_win'] == 1 else 0 for p in pairs])
    hour_groups = np.array([p['hour_group'] for p in pairs])
    day_balances = np.array([p['day_balance'] for p in pairs])
    minutes_gaps = np.array([p['minutes_since_last'] for p in pairs])

    # Normalize variables for regression stability
    hour_normalized = (hour_groups - 6) / 12.0  # Center around noon

    # Normalize day_balance (typically ranges from -10 to +10)
    day_balance_std = np.std(day_balances) if np.std(day_balances) > 0 else 1
    day_balance_normalized = day_balances / day_balance_std

    # Normalize minutes (log transform to handle skewness, then normalize)
    minutes_log = np.log1p(minutes_gaps)  # log(1 + x) to handle 0s
    minutes_std = np.std(minutes_log) if np.std(minutes_log) > 0 else 1
    minutes_normalized = (minutes_log - np.mean(minutes_log)) / minutes_std

    # Compute autocorrelation for each predictor variable
    def compute_autocorr(x, lag=1):
        """Compute autocorrelation at given lag."""
        n = len(x)
        if n <= lag:
            return 0.0
        mean_x = np.mean(x)
        var_x = np.var(x)
        if var_x == 0:
            return 0.0
        autocov = np.mean((x[:-lag] - mean_x) * (x[lag:] - mean_x))
        return autocov / var_x

    autocorr_prev_win = compute_autocorr(prev_won)
    autocorr_hour = compute_autocorr(hour_groups)
    autocorr_day_balance = compute_autocorr(day_balances)
    autocorr_minutes = compute_autocorr(minutes_gaps)

    # Build autocorrelation info for display
    autocorrelations = {
        'prev_result': {'value': round(float(autocorr_prev_win), 3), 'name': 'Previous Result'},
        'hour': {'value': round(float(autocorr_hour), 3), 'name': 'Hour of Day'},
        'day_balance': {'value': round(float(autocorr_day_balance), 3), 'name': 'Day Balance'},
        'minutes_gap': {'value': round(float(autocorr_minutes), 3), 'name': 'Minutes Since Last'}
    }

    def logistic_loss(params, X, y):
        z = X @ params
        p = expit(z)
        p = np.clip(p, 1e-10, 1 - 1e-10)
        return -np.mean(y * np.log(p) + (1 - y) * np.log(1 - p))

    # Full model: intercept + prev_win + hour + day_balance + minutes
    X_full = np.column_stack([np.ones(len(pairs)), prev_won, hour_normalized, day_balance_normalized, minutes_normalized])
    y = curr_won

    result_full = minimize(logistic_loss, x0=np.zeros(5), args=(X_full, y), method='BFGS')
    intercept = result_full.x[0]
    coef_prev_win = result_full.x[1]
    coef_hour = result_full.x[2]
    coef_day_balance = result_full.x[3]
    coef_minutes = result_full.x[4]

    # Odds ratios
    odds_ratio_prev = np.exp(coef_prev_win)
    odds_ratio_hour = np.exp(coef_hour)
    odds_ratio_day_balance = np.exp(coef_day_balance)
    odds_ratio_minutes = np.exp(coef_minutes)

    baseline_prob = expit(intercept) * 100

    # Significance tests using likelihood ratio for each predictor
    # Null model (intercept only)
    X_null = np.ones((len(pairs), 1))
    result_null = minimize(logistic_loss, x0=np.zeros(1), args=(X_null, y), method='BFGS')

    # Model with only prev_win
    X_prev_only = np.column_stack([np.ones(len(pairs)), prev_won])
    result_prev_only = minimize(logistic_loss, x0=np.zeros(2), args=(X_prev_only, y), method='BFGS')

    # Model with only hour
    X_hour_only = np.column_stack([np.ones(len(pairs)), hour_normalized])
    result_hour_only = minimize(logistic_loss, x0=np.zeros(2), args=(X_hour_only, y), method='BFGS')

    # Model with only day_balance
    X_balance_only = np.column_stack([np.ones(len(pairs)), day_balance_normalized])
    result_balance_only = minimize(logistic_loss, x0=np.zeros(2), args=(X_balance_only, y), method='BFGS')

    # Model with only minutes
    X_minutes_only = np.column_stack([np.ones(len(pairs)), minutes_normalized])
    result_minutes_only = minimize(logistic_loss, x0=np.zeros(2), args=(X_minutes_only, y), method='BFGS')

    # Log-likelihoods
    ll_null = -logistic_loss(result_null.x, X_null, y) * len(pairs)
    ll_prev_only = -logistic_loss(result_prev_only.x, X_prev_only, y) * len(pairs)
    ll_hour_only = -logistic_loss(result_hour_only.x, X_hour_only, y) * len(pairs)
    ll_balance_only = -logistic_loss(result_balance_only.x, X_balance_only, y) * len(pairs)
    ll_minutes_only = -logistic_loss(result_minutes_only.x, X_minutes_only, y) * len(pairs)
    ll_full = -logistic_loss(result_full.x, X_full, y) * len(pairs)

    # Test significance of each predictor (chi-squared critical value at p=0.05, df=1 is 3.84)
    lr_stat_prev = 2 * (ll_prev_only - ll_null)
    lr_stat_hour = 2 * (ll_hour_only - ll_null)
    lr_stat_balance = 2 * (ll_balance_only - ll_null)
    lr_stat_minutes = 2 * (ll_minutes_only - ll_null)
    is_prev_significant = bool(lr_stat_prev > 3.84)
    is_hour_significant = bool(lr_stat_hour > 3.84)
    is_balance_significant = bool(lr_stat_balance > 3.84)
    is_minutes_significant = bool(lr_stat_minutes > 3.84)

    # Generate insights
    insights = []

    # Previous result insights
    if coef_prev_win > 0.1 and is_prev_significant:
        insights.append({
            'type': 'positive',
            'title': 'You have positive momentum',
            'message': f'After a win, your win rate is {win_rate_after_win:.1f}% compared to {win_rate_after_loss:.1f}% after a loss.',
            'recommendation': 'Ride your winning streaks - your mental state improves after victories.'
        })
    elif coef_prev_win < -0.1 and is_prev_significant:
        insights.append({
            'type': 'warning',
            'title': 'Watch out for overconfidence',
            'message': f'Your win rate drops to {win_rate_after_win:.1f}% after a win, compared to {win_rate_after_loss:.1f}% after a loss.',
            'recommendation': 'Stay focused after wins. Treat each game fresh.'
        })
    else:
        insights.append({
            'type': 'info',
            'title': 'Your results are independent',
            'message': f'Previous game result doesn\'t significantly predict next game. Win rate after win: {win_rate_after_win:.1f}%, after loss: {win_rate_after_loss:.1f}%.',
            'recommendation': 'Good mental resilience! You don\'t seem affected by tilt or overconfidence.'
        })

    # Hour-of-day insights
    if best_hour_group is not None and worst_hour_group is not None:
        best_start = best_hour_group * 2
        worst_start = worst_hour_group * 2
        best_rate = hourly_win_rates[best_hour_group]
        worst_rate = hourly_win_rates[worst_hour_group]

        if is_hour_significant and abs(best_rate - worst_rate) > 5:
            insights.append({
                'type': 'positive' if best_rate > 55 else 'info',
                'title': 'Time of day matters',
                'message': f'You perform best at {best_start}:00-{best_start+2}:00 ({best_rate:.1f}% win rate) and worst at {worst_start}:00-{worst_start+2}:00 ({worst_rate:.1f}%).',
                'recommendation': f'Try to schedule your games around {best_start}:00-{best_start+2}:00 when possible.'
            })
        else:
            insights.append({
                'type': 'info',
                'title': 'Time of day has minimal impact',
                'message': f'Your performance is relatively consistent across different times. Best: {best_start}:00-{best_start+2}:00 ({best_rate:.1f}%), Worst: {worst_start}:00-{worst_start+2}:00 ({worst_rate:.1f}%).',
                'recommendation': 'Play whenever suits your schedule - time doesn\'t significantly affect your results.'
            })

    # Loss recovery insight
    if win_rate_after_loss and win_rate_after_loss >= 50:
        insights.append({
            'type': 'positive',
            'title': 'Strong loss recovery',
            'message': f'You maintain a {win_rate_after_loss:.1f}% win rate even after a loss.',
            'recommendation': 'You handle losses well mentally. Keep it up!'
        })
    elif win_rate_after_loss and win_rate_after_loss < 45:
        insights.append({
            'type': 'warning',
            'title': 'Tilt detected after losses',
            'message': f'Your win rate drops to {win_rate_after_loss:.1f}% after a loss.',
            'recommendation': 'Consider taking a short break after a loss to reset mentally.'
        })

    # Day balance insights
    balance_effect = round((odds_ratio_day_balance - 1) * 100)
    if is_balance_significant:
        if coef_day_balance > 0.05:
            insights.append({
                'type': 'positive',
                'title': 'Winning days boost performance',
                'message': f'When you\'re ahead for the day (more wins than losses), your win probability increases by ~{abs(balance_effect)}%.',
                'recommendation': 'Your confidence builds throughout winning sessions. Use this momentum!'
            })
        elif coef_day_balance < -0.05:
            insights.append({
                'type': 'warning',
                'title': 'Winning streaks may cause complacency',
                'message': f'When you\'re ahead for the day, your win probability decreases by ~{abs(balance_effect)}%.',
                'recommendation': 'Stay focused even when having a good day. Don\'t get overconfident.'
            })
    else:
        insights.append({
            'type': 'info',
            'title': 'Day balance has no impact',
            'message': f'Whether you\'re ahead or behind for the day doesn\'t significantly affect your next game.',
            'recommendation': 'Good mental stability! Your performance doesn\'t depend on your session\'s running tally.'
        })

    # Minutes gap insights
    minutes_effect = round((odds_ratio_minutes - 1) * 100)
    if is_minutes_significant:
        if coef_minutes > 0.05:
            insights.append({
                'type': 'info',
                'title': 'Longer breaks help',
                'message': f'Taking more time between games increases your win probability by ~{abs(minutes_effect)}%.',
                'recommendation': 'Don\'t rush into the next game. A short break helps you reset.'
            })
        elif coef_minutes < -0.05:
            insights.append({
                'type': 'info',
                'title': 'You play better when warmed up',
                'message': f'Playing games in quick succession increases your win probability by ~{abs(minutes_effect)}%.',
                'recommendation': 'You benefit from staying "in the zone". Keep the momentum going!'
            })
    else:
        insights.append({
            'type': 'info',
            'title': 'Time between games doesn\'t matter',
            'message': f'The gap between your games doesn\'t significantly affect your performance.',
            'recommendation': 'Play at your own pace - quick succession or with breaks, it doesn\'t impact your results.'
        })

    # Build hourly data for frontend display
    hourly_data = []
    for hg in range(12):
        if hg in hourly_stats:
            stats = hourly_stats[hg]
            win_rate = (stats['wins'] / stats['total'] * 100) if stats['total'] > 0 else 0
            hourly_data.append({
                'hour_group': hg,
                'start_hour': hg * 2,
                'end_hour': hg * 2 + 2,
                'win_rate': round(win_rate, 1),
                'sample_size': stats['total']
            })

    return {
        'sample_size': len(pairs),
        'games_after_win': games_after_win,
        'games_after_loss': games_after_loss,
        'games_after_draw': games_after_draw,
        'win_rate_after_win': round(win_rate_after_win, 1) if win_rate_after_win else None,
        'win_rate_after_loss': round(win_rate_after_loss, 1) if win_rate_after_loss else None,
        'win_rate_after_draw': round(win_rate_after_draw, 1) if win_rate_after_draw else None,
        'odds_ratio': round(float(odds_ratio_prev), 2),
        'odds_ratio_hour': round(float(odds_ratio_hour), 2),
        'odds_ratio_day_balance': round(float(odds_ratio_day_balance), 2),
        'odds_ratio_minutes': round(float(odds_ratio_minutes), 2),
        'coefficient': round(float(coef_prev_win), 3),
        'coefficient_hour': round(float(coef_hour), 3),
        'coefficient_day_balance': round(float(coef_day_balance), 3),
        'coefficient_minutes': round(float(coef_minutes), 3),
        'is_significant': is_prev_significant,
        'is_hour_significant': is_hour_significant,
        'is_balance_significant': is_balance_significant,
        'is_minutes_significant': is_minutes_significant,
        'baseline_win_rate': round(float(baseline_prob), 1),
        'best_hour': best_hour_group * 2 if best_hour_group is not None else None,
        'worst_hour': worst_hour_group * 2 if worst_hour_group is not None else None,
        'hourly_data': hourly_data,
        'autocorrelations': autocorrelations,
        'insights': insights
    }


def process_openings_for_json(openings_dict):
    """
    Takes the raw openings dict and adds confidence intervals
    so the frontend doesn't have to do math.
    """
    processed = {}
    for color in ['white', 'black']:
        data = openings_dict[color]
        results = []
        for entry in data:
            interval = wilson_interval(entry['games'], entry['win_rate'])
            entry['ci_lower'] = interval['lower']
            entry['ci_upper'] = interval['upper']
            results.append(entry)
        processed[color] = results
    return processed

def score_transcript_for_tips(video_id):
    """
    Fetch transcript and score based on improvement-related keywords.
    Returns a score from 0 to 1 based on keyword density.
    """
    # Keywords that indicate helpful improvement content
    IMPROVEMENT_KEYWORDS = [
        'improve', 'improvement', 'better', 'tip', 'tips', 'advice',
        'mistake', 'mistakes', 'avoid', 'learn', 'learning', 'study',
        'practice', 'training', 'beginner', 'intermediate', 'advanced',
        'strategy', 'tactic', 'tactics', 'opening', 'endgame', 'middlegame',
        'calculate', 'calculation', 'think', 'thinking', 'plan', 'planning',
        'analyze', 'analysis', 'principle', 'fundamental', 'basic', 'basics',
        'important', 'key', 'crucial', 'essential', 'must', 'should',
        'win', 'winning', 'rating', 'elo', 'stronger', 'weakness',
        'blunder', 'blunders', 'error', 'errors', 'common'
    ]

    try:
        ytt_api = YouTubeTranscriptApi()
        transcript_list = ytt_api.fetch(video_id, languages=['en', 'en-US', 'en-GB'])
        full_text = ' '.join([snippet.text.lower() for snippet in transcript_list])

        # Count keyword occurrences
        word_count = len(full_text.split())
        if word_count == 0:
            return 0

        keyword_count = sum(full_text.count(kw) for kw in IMPROVEMENT_KEYWORDS)

        # Normalize: keyword density per 100 words, capped at 1
        density = min(1.0, (keyword_count / word_count) * 100 * 2)

        return density

    except Exception as e:
        error_msg = str(e).lower()
        if 'disabled' in error_msg or 'no transcript' in error_msg or 'not found' in error_msg:
            return 0  # No transcript available
        print(f"Error fetching transcript for {video_id}: {e}")
        return 0


def fetch_youtube_videos(opening, side, api_key, max_results=3, use_transcript_scoring=False):
    """
    Fetch YouTube videos about a chess opening from different channels.
    Ranks by: subscriber count, view count, and recency.
    If use_transcript_scoring=True, also analyzes transcripts for improvement content.
    """
    headers = {'User-Agent': 'ChessStatsApp/1.0'}

    # Build search query
    query = f"chess {opening}"
    if side:
        query += f" {side.lower()}"

    # Step 1: Search for videos
    search_url = "https://www.googleapis.com/youtube/v3/search"
    search_params = {
        'part': 'snippet',
        'q': query,
        'type': 'video',
        'maxResults': 50,  # Get more to filter down to 5 different channels
        'order': 'relevance',
        'key': api_key
    }

    response = requests.get(search_url, params=search_params, headers=headers)
    response.raise_for_status()
    search_data = response.json()

    if not search_data.get('items'):
        return []

    # Collect video IDs and channel IDs
    video_ids = []
    channel_ids = set()
    video_channel_map = {}

    for item in search_data['items']:
        video_id = item['id']['videoId']
        channel_id = item['snippet']['channelId']
        video_ids.append(video_id)
        channel_ids.add(channel_id)
        video_channel_map[video_id] = {
            'channel_id': channel_id,
            'title': item['snippet']['title'],
            'channel_title': item['snippet']['channelTitle'],
            'published_at': item['snippet']['publishedAt'],
            'thumbnail': item['snippet']['thumbnails'].get('high', {}).get('url') or
                        item['snippet']['thumbnails'].get('medium', {}).get('url')
        }

    # Step 2: Get video statistics (view count)
    videos_url = "https://www.googleapis.com/youtube/v3/videos"
    videos_params = {
        'part': 'statistics',
        'id': ','.join(video_ids[:50]),
        'key': api_key
    }

    response = requests.get(videos_url, params=videos_params, headers=headers)
    response.raise_for_status()
    videos_data = response.json()

    video_stats = {}
    for item in videos_data.get('items', []):
        video_stats[item['id']] = {
            'view_count': int(item['statistics'].get('viewCount', 0))
        }

    # Step 3: Get channel statistics (subscriber count) and thumbnails
    channels_url = "https://www.googleapis.com/youtube/v3/channels"
    channels_params = {
        'part': 'statistics,snippet',
        'id': ','.join(list(channel_ids)[:50]),
        'key': api_key
    }

    response = requests.get(channels_url, params=channels_params, headers=headers)
    response.raise_for_status()
    channels_data = response.json()

    channel_stats = {}
    for item in channels_data.get('items', []):
        channel_stats[item['id']] = {
            'subscriber_count': int(item['statistics'].get('subscriberCount', 0)),
            'channel_thumbnail': item['snippet']['thumbnails'].get('default', {}).get('url', '')
        }

    # Step 4: Combine and score videos
    scored_videos = []
    for video_id, info in video_channel_map.items():
        channel_id = info['channel_id']

        # Get stats
        views = video_stats.get(video_id, {}).get('view_count', 0)
        subs = channel_stats.get(channel_id, {}).get('subscriber_count', 0)
        channel_thumb = channel_stats.get(channel_id, {}).get('channel_thumbnail', '')

        # Calculate recency score (days since published)
        published = datetime.datetime.fromisoformat(info['published_at'].replace('Z', '+00:00'))
        days_old = (datetime.datetime.now(datetime.timezone.utc) - published).days

        # Base scoring: Higher subs, higher views, more recent = better
        base_score = (subs / 1000000) * 0.3 + (views / 100000) * 0.2 + (max(0, 365 - days_old) / 365) * 0.2

        # Transcript scoring (only if enabled)
        if use_transcript_scoring:
            transcript_score = score_transcript_for_tips(video_id)
            # Transcript score has 30% weight
            score = base_score + transcript_score * 0.3
        else:
            score = base_score

        scored_videos.append({
            'video_id': video_id,
            'title': info['title'],
            'channel_title': info['channel_title'],
            'channel_id': channel_id,
            'thumbnail': info['thumbnail'],
            'channel_thumbnail': channel_thumb,
            'published_at': info['published_at'],
            'view_count': views,
            'subscriber_count': subs,
            'score': score
        })

    # Step 5: Select top 5 from different channels
    scored_videos.sort(key=lambda x: x['score'], reverse=True)

    selected_videos = []
    seen_channels = set()

    for video in scored_videos:
        if video['channel_id'] not in seen_channels:
            selected_videos.append({
                'video_id': video['video_id'],
                'title': video['title'],
                'channel_title': video['channel_title'],
                'thumbnail': video['thumbnail'],
                'channel_thumbnail': video['channel_thumbnail'],
                'published_at': video['published_at'],
                'view_count': video['view_count'],
                'subscriber_count': video['subscriber_count'],
                'url': f"https://www.youtube.com/watch?v={video['video_id']}"
            })
            seen_channels.add(video['channel_id'])

            if len(selected_videos) >= max_results:
                break

    return selected_videos


def compute_fatigue_analysis(USERNAME, time_class='rapid', archives=None):
    """
    Analyze how fatigue affects your chess performance.
    Uses logistic regression to understand the impact of:
    - Number of games played in a session
    - Time between games
    - Total time spent playing
    """
    monthly_archives_urls_list = archives if archives is not None else fetch_player_games_archives(USERNAME)
    headers = {'User-Agent': 'MyChessStatsApp/1.0 (contact@example.com)'}

    # Collect all games with timestamps
    games_by_day = {}

    for archive_url in monthly_archives_urls_list:
        try:
            response = requests.get(archive_url, headers=headers)
            response.raise_for_status()
            data = response.json()

            for game in data.get('games', []):
                if game.get('time_class') != time_class:
                    continue

                end_time = game.get('end_time')
                if not end_time:
                    continue

                if game['white']['username'].lower() == USERNAME.lower():
                    result = game['white'].get('result')
                elif game['black']['username'].lower() == USERNAME.lower():
                    result = game['black'].get('result')
                else:
                    continue

                game_result = get_game_result(result)
                win = 1 if game_result == 'win' else (0.5 if game_result == 'draw' else 0)

                time_control = game.get('time_control', '600')
                try:
                    base_time = int(time_control.split('+')[0])
                    duration_estimate = base_time / 60
                except:
                    duration_estimate = 10

                game_date = datetime.datetime.fromtimestamp(end_time)
                date_key = game_date.strftime('%Y-%m-%d')

                if date_key not in games_by_day:
                    games_by_day[date_key] = []
                games_by_day[date_key].append((end_time, win, duration_estimate))

        except requests.exceptions.RequestException as e:
            print(f"Error fetching {archive_url}: {e}")

    # Build feature matrix
    features = []

    for date_key, games in games_by_day.items():
        games.sort(key=lambda x: x[0])

        cumulative_time = 0
        for idx, (timestamp, win, duration) in enumerate(games):
            game_number = idx + 1

            if idx == 0:
                time_since_last = 60
            else:
                prev_timestamp = games[idx - 1][0]
                time_since_last = (timestamp - prev_timestamp) / 60

            features.append({
                'game_number': game_number,
                'time_since_last': min(time_since_last, 120),
                'cumulative_time': cumulative_time,
                'win': win
            })

            cumulative_time += duration

    if len(features) < 50:
        return {
            'error': 'Not enough data for analysis (need at least 50 games)',
            'sample_size': len(features)
        }

    df = pd.DataFrame(features)

    # Calculate baseline win rate
    baseline_win_rate = df['win'].mean() * 100

    # Calculate win rate by game number (for insights)
    win_by_game_num = df.groupby('game_number')['win'].agg(['mean', 'count'])
    win_by_game_num = win_by_game_num[win_by_game_num['count'] >= 10]  # At least 10 samples

    # Find optimal game number (peak performance)
    if len(win_by_game_num) > 0:
        best_game_num = win_by_game_num['mean'].idxmax()
        best_win_rate = win_by_game_num.loc[best_game_num, 'mean'] * 100
        worst_game_num = win_by_game_num['mean'].idxmin()
        worst_win_rate = win_by_game_num.loc[worst_game_num, 'mean'] * 100
    else:
        best_game_num = 1
        best_win_rate = baseline_win_rate
        worst_game_num = 1
        worst_win_rate = baseline_win_rate

    # Logistic Regression for deeper analysis
    def logistic_loss(params, X, y):
        beta = params
        z = X @ beta
        p = expit(z)
        p = np.clip(p, 1e-10, 1 - 1e-10)
        return -np.mean(y * np.log(p) + (1 - y) * np.log(1 - p))

    X_logistic = np.column_stack([
        np.ones(len(df)),
        (df['game_number'] - df['game_number'].mean()) / max(df['game_number'].std(), 1),
        (df['time_since_last'] - df['time_since_last'].mean()) / max(df['time_since_last'].std(), 1),
        (df['cumulative_time'] - df['cumulative_time'].mean()) / max(df['cumulative_time'].std(), 1)
    ])
    y = df['win'].values

    result_logistic = minimize(
        logistic_loss,
        x0=np.zeros(4),
        args=(X_logistic, y),
        method='BFGS'
    )

    coef_game_num = result_logistic.x[1]
    coef_time_gap = result_logistic.x[2]
    coef_cumulative = result_logistic.x[3]

    # Generate user-friendly insights
    insights = []

    # Game number insight
    if coef_game_num < -0.05:
        if best_game_num <= 3:
            insights.append({
                'type': 'warning',
                'title': 'You play best early in your session',
                'message': f'Your peak performance is around game #{best_game_num} ({best_win_rate:.0f}% win rate). After that, fatigue seems to set in.',
                'recommendation': f'Consider limiting sessions to {min(best_game_num + 2, 5)} games for optimal results.'
            })
        else:
            insights.append({
                'type': 'info',
                'title': 'Performance drops over time',
                'message': f'Your win rate tends to decrease as you play more games in a session.',
                'recommendation': 'Take breaks between games or limit your daily sessions.'
            })
    elif coef_game_num > 0.05:
        insights.append({
            'type': 'positive',
            'title': 'You warm up as you play',
            'message': f'You perform better after a few games. Your peak is around game #{best_game_num} ({best_win_rate:.0f}% win rate).',
            'recommendation': 'Playing a warm-up game or two before important matches could help.'
        })
    else:
        insights.append({
            'type': 'info',
            'title': 'Consistent performance',
            'message': 'Your win rate stays relatively stable regardless of how many games you play.',
            'recommendation': 'You handle longer sessions well. Keep doing what works!'
        })

    # Break time insight
    if coef_time_gap > 0.05:
        insights.append({
            'type': 'positive',
            'title': 'Breaks help your performance',
            'message': 'Taking time between games improves your results.',
            'recommendation': 'After a loss or intense game, take a 5-10 minute break before playing again.'
        })
    elif coef_time_gap < -0.05:
        insights.append({
            'type': 'info',
            'title': 'You play better with momentum',
            'message': 'You perform better when playing games back-to-back.',
            'recommendation': 'Stay "in the zone" by not taking long breaks between games.'
        })

    # Session length insight
    if coef_cumulative < -0.05:
        insights.append({
            'type': 'warning',
            'title': 'Long sessions hurt your game',
            'message': 'Your performance declines the longer you play in a single session.',
            'recommendation': 'Keep sessions under 1-2 hours for best results.'
        })

    # If no specific insights, give general feedback
    if len(insights) == 0:
        insights.append({
            'type': 'info',
            'title': 'No strong patterns detected',
            'message': f'Your baseline win rate is {baseline_win_rate:.0f}%. We couldn\'t find strong fatigue patterns in your data.',
            'recommendation': 'This could mean you manage your energy well, or that other factors affect your performance more.'
        })

    return {
        'sample_size': len(features),
        'baseline_win_rate': round(baseline_win_rate, 1),
        'best_game_number': int(best_game_num),
        'best_win_rate': round(best_win_rate, 1),
        'worst_game_number': int(worst_game_num),
        'worst_win_rate': round(worst_win_rate, 1),
        'insights': insights
    }


def compute_win_prediction_analysis_streaming(USERNAME, time_class='rapid', archives=None):
    """
    Streaming version: Analyze if the result of the immediately preceding game (from the same day)
    predicts the outcome of the current game using logistic regression.

    Yields SSE-formatted progress events and final data.
    """
    monthly_archives_urls_list = archives if archives is not None else fetch_player_games_archives(USERNAME)
    headers = {'User-Agent': 'MyChessStatsApp/1.0 (contact@example.com)'}
    total_archives = len(monthly_archives_urls_list)

    yield f"data: {json.dumps({'type': 'start', 'total_archives': total_archives})}\n\n"

    # Collect all games with timestamps grouped by day
    games_by_day = {}

    for idx, archive_url in enumerate(monthly_archives_urls_list):
        parts = archive_url.split('/')
        year_month = f"{parts[-2]}-{parts[-1]}"

        yield f"data: {json.dumps({'type': 'progress', 'current': idx + 1, 'total': total_archives, 'month': year_month})}\n\n"

        try:
            response = requests.get(archive_url, headers=headers)
            response.raise_for_status()
            data = response.json()

            for game in data.get('games', []):
                if game.get('time_class') != time_class:
                    continue

                end_time = game.get('end_time')
                if not end_time:
                    continue

                if game['white']['username'].lower() == USERNAME.lower():
                    result = game['white'].get('result')
                elif game['black']['username'].lower() == USERNAME.lower():
                    result = game['black'].get('result')
                else:
                    continue

                game_result = get_game_result(result)
                # Convert to numeric: win=1, draw=0.5, loss=0
                win_value = 1 if game_result == 'win' else (0.5 if game_result == 'draw' else 0)

                game_date = datetime.datetime.fromtimestamp(end_time)
                date_key = game_date.strftime('%Y-%m-%d')

                if date_key not in games_by_day:
                    games_by_day[date_key] = []
                games_by_day[date_key].append((end_time, win_value, game_result))

        except requests.exceptions.RequestException as e:
            print(f"Error fetching {archive_url}: {e}")

    yield f"data: {json.dumps({'type': 'processing', 'message': 'Running logistic regression...'})}\n\n"

    # Build pairs of (previous_result, current_result) for same-day consecutive games
    pairs = []
    for date_key, games in games_by_day.items():
        # Sort games by timestamp within each day
        games.sort(key=lambda x: x[0])

        for i in range(1, len(games)):
            prev_result = games[i - 1][1]  # Previous game result (0, 0.5, or 1)
            curr_result = games[i][1]      # Current game result
            pairs.append({
                'prev_win': prev_result,
                'curr_win': curr_result,
                'prev_outcome': games[i - 1][2],  # 'win', 'draw', 'loss'
                'curr_outcome': games[i][2]
            })

    if len(pairs) < 50:
        yield f"data: {json.dumps({'type': 'complete', 'data': {'error': 'Not enough consecutive same-day games for analysis (need at least 50 pairs)', 'sample_size': len(pairs)}})}\n\n"
        return

    df = pd.DataFrame(pairs)

    # Calculate conditional win rates
    after_win = df[df['prev_win'] == 1]['curr_win']
    after_loss = df[df['prev_win'] == 0]['curr_win']
    after_draw = df[df['prev_win'] == 0.5]['curr_win']

    win_rate_after_win = (after_win.mean() * 100) if len(after_win) > 0 else None
    win_rate_after_loss = (after_loss.mean() * 100) if len(after_loss) > 0 else None
    win_rate_after_draw = (after_draw.mean() * 100) if len(after_draw) > 0 else None

    # Count samples for each category
    games_after_win = len(after_win)
    games_after_loss = len(after_loss)
    games_after_draw = len(after_draw)

    # Logistic Regression: Does previous result predict current result?
    # We'll use binary outcomes for cleaner interpretation (win vs not-win)
    df['prev_won'] = (df['prev_win'] == 1).astype(int)
    df['curr_won'] = (df['curr_win'] == 1).astype(int)

    def logistic_loss(params, X, y):
        beta = params
        z = X @ beta
        p = expit(z)
        p = np.clip(p, 1e-10, 1 - 1e-10)
        return -np.mean(y * np.log(p) + (1 - y) * np.log(1 - p))

    # Simple model: intercept + previous_win coefficient
    X = np.column_stack([
        np.ones(len(df)),
        df['prev_won'].values
    ])
    y = df['curr_won'].values

    result_logistic = minimize(
        logistic_loss,
        x0=np.zeros(2),
        args=(X, y),
        method='BFGS'
    )

    intercept = result_logistic.x[0]
    coef_prev_win = result_logistic.x[1]

    # Calculate odds ratio: exp(coefficient)
    odds_ratio = np.exp(coef_prev_win)

    # Calculate baseline win probability and probability after win
    baseline_prob = expit(intercept) * 100
    prob_after_win = expit(intercept + coef_prev_win) * 100

    # Determine statistical significance using likelihood ratio test
    # Null model (intercept only)
    X_null = np.ones((len(df), 1))
    result_null = minimize(
        logistic_loss,
        x0=np.zeros(1),
        args=(X_null, y),
        method='BFGS'
    )

    # Calculate log-likelihoods
    ll_null = -logistic_loss(result_null.x, X_null, y) * len(df)
    ll_full = -logistic_loss(result_logistic.x, X, y) * len(df)

    # Likelihood ratio test statistic (chi-squared with 1 df)
    lr_stat = 2 * (ll_full - ll_null)
    # Using chi-squared approximation: p < 0.05 roughly when lr_stat > 3.84
    is_significant = bool(lr_stat > 3.84)

    # Generate insights based on the analysis
    insights = []

    # Main finding about momentum/tilt
    effect_size = abs(win_rate_after_win - win_rate_after_loss) if win_rate_after_win and win_rate_after_loss else 0

    if coef_prev_win > 0.1 and is_significant:
        # Positive momentum effect
        insights.append({
            'type': 'positive',
            'title': 'You have positive momentum',
            'message': f'After a win, your win rate is {win_rate_after_win:.1f}% compared to {win_rate_after_loss:.1f}% after a loss. Winning seems to boost your confidence!',
            'recommendation': 'Ride your winning streaks - your mental state improves after victories.'
        })
    elif coef_prev_win < -0.1 and is_significant:
        # Negative effect (tilt after winning, or overconfidence)
        insights.append({
            'type': 'warning',
            'title': 'Watch out for overconfidence',
            'message': f'Surprisingly, your win rate drops to {win_rate_after_win:.1f}% after a win, compared to {win_rate_after_loss:.1f}% after a loss.',
            'recommendation': 'You may be getting overconfident after wins. Stay focused and treat each game fresh.'
        })
    else:
        insights.append({
            'type': 'info',
            'title': 'Your results are independent',
            'message': f'Your previous game result doesn\'t significantly predict your next game outcome. Win rate after win: {win_rate_after_win:.1f}%, after loss: {win_rate_after_loss:.1f}%.',
            'recommendation': 'Good mental resilience! You don\'t seem affected by tilt or overconfidence.'
        })

    # Additional insight about loss recovery
    if win_rate_after_loss and win_rate_after_loss >= 50:
        insights.append({
            'type': 'positive',
            'title': 'Strong loss recovery',
            'message': f'You maintain a {win_rate_after_loss:.1f}% win rate even after a loss.',
            'recommendation': 'You handle losses well mentally. Keep up the resilience!'
        })
    elif win_rate_after_loss and win_rate_after_loss < 45:
        insights.append({
            'type': 'warning',
            'title': 'Tilt detected after losses',
            'message': f'Your win rate drops to {win_rate_after_loss:.1f}% after a loss.',
            'recommendation': 'Consider taking a short break after a loss to reset mentally before the next game.'
        })

    result_data = {
        'sample_size': len(pairs),
        'games_after_win': games_after_win,
        'games_after_loss': games_after_loss,
        'games_after_draw': games_after_draw,
        'win_rate_after_win': round(win_rate_after_win, 1) if win_rate_after_win else None,
        'win_rate_after_loss': round(win_rate_after_loss, 1) if win_rate_after_loss else None,
        'win_rate_after_draw': round(win_rate_after_draw, 1) if win_rate_after_draw else None,
        'odds_ratio': round(float(odds_ratio), 2),
        'coefficient': round(float(coef_prev_win), 3),
        'is_significant': is_significant,
        'baseline_win_rate': round(float(baseline_prob), 1),
        'insights': insights
    }

    yield f"data: {json.dumps({'type': 'complete', 'data': result_data})}\n\n"