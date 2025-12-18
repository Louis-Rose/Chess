import math
import requests
import datetime
import pandas as pd
import numpy as np
import json
from scipy.optimize import minimize
from scipy.special import expit  # logistic function
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound

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
    headers = {'User-Agent': 'MyChessStatsApp/1.0 (contact@example.com)'}

    # Step 1: Get archives list
    archives = fetch_player_games_archives(USERNAME)

    # For incremental updates, filter to only new archives
    archives_to_fetch = archives
    if last_archive and last_archive in archives:
        last_idx = archives.index(last_archive)
        archives_to_fetch = archives[last_idx + 1:]  # Only archives after the last cached one

    total_archives = len(archives_to_fetch)
    is_incremental = cached_stats is not None and total_archives < len(archives)

    yield f"data: {json.dumps({'type': 'start', 'total_archives': total_archives, 'incremental': is_incremental})}\n\n"

    # Data structures for all stats - initialize from cache if available
    if cached_stats:
        # Rebuild dictionaries from cached data for merging
        games_by_week = {(d['year'], d['week']): d['games_played'] for d in cached_stats.get('history', [])}
        elo_by_week = {(d['year'], d['week']): {'elo': d['elo'], 'timestamp': 0} for d in cached_stats.get('elo_history', [])}
        games_by_day = {}  # Will be rebuilt - affects game_number_stats
        openings_white = []  # Will be rebuilt from last 12 months
        openings_black = []
        total_games = cached_stats.get('total_games', 0)
        total_rapid = cached_stats.get('total_rapid', 0)
        total_blitz = cached_stats.get('total_blitz', 0)
    else:
        games_by_week = {}
        elo_by_week = {}
        games_by_day = {}
        openings_white = []
        openings_black = []
        total_games = 0
        total_rapid = 0
        total_blitz = 0

    # Step 2: Process each archive (only new ones if incremental)
    for idx, archive_url in enumerate(archives_to_fetch):
        # Extract year/month from URL for progress display
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

                game_date = datetime.datetime.fromtimestamp(end_time)
                year, week, _ = game_date.isocalendar()

                # --- Games per week (filtered by time_class) ---
                if game_time_class == time_class:
                    total_games += 1
                    key = (year, week)
                    if key not in games_by_week:
                        games_by_week[key] = 0
                    games_by_week[key] += 1

                    # --- Elo per week ---
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

                    if rating:
                        if key not in elo_by_week or end_time > elo_by_week[key]['timestamp']:
                            elo_by_week[key] = {'elo': rating, 'timestamp': end_time}

                    # --- Game number stats ---
                    game_result = get_game_result(result_code)
                    date_key = game_date.strftime('%Y-%m-%d')
                    if date_key not in games_by_day:
                        games_by_day[date_key] = []
                    games_by_day[date_key].append((end_time, game_result))

                # --- Openings (last 12 months only, all time classes) ---
                if archive_url in archives[-12:] and 'eco' in game:
                    if game['white']['username'].lower() == USERNAME.lower():
                        side_played = 'white'
                        result_code = game['white'].get('result')
                    else:
                        side_played = 'black'
                        result_code = game['black'].get('result')

                    game_result = get_game_result(result_code)
                    opening_data = {'opening': game['eco'], 'result': game_result}

                    if side_played == 'white':
                        openings_white.append(opening_data)
                    else:
                        openings_black.append(opening_data)

        except requests.exceptions.RequestException as e:
            print(f"Error fetching {archive_url}: {e}")

    # Step 3: Process collected data
    yield f"data: {json.dumps({'type': 'processing', 'message': 'Processing collected data...'})}\n\n"

    # Games per week
    games_per_week_data = [
        {'year': year, 'week': week, 'games_played': count}
        for (year, week), count in games_by_week.items()
    ]
    games_per_week_data.sort(key=lambda x: (x['year'], x['week']))
    games_per_week_data = fill_missing_weeks(games_per_week_data)

    # Elo per week
    elo_per_week_data = [
        {'year': year, 'week': week, 'elo': data['elo']}
        for (year, week), data in elo_by_week.items()
    ]
    elo_per_week_data.sort(key=lambda x: (x['year'], x['week']))
    elo_per_week_data = fill_missing_weeks_elo(elo_per_week_data)

    # Game number stats
    game_number_stats = {}
    for date_key, games in games_by_day.items():
        games.sort(key=lambda x: x[0])
        for idx, (timestamp, result) in enumerate(games):
            game_number = idx + 1
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

    # Openings
    openings = {
        'white': group_opening_stats(openings_white),
        'black': group_opening_stats(openings_black)
    }
    processed_openings = process_openings_for_json(openings)

    # Step 4: Yield final result
    # Track the last archive for incremental updates
    last_archive_processed = archives[-1] if archives else None

    final_data = {
        'type': 'complete',
        'data': {
            'time_class': time_class,
            'history': games_per_week_data,
            'elo_history': elo_per_week_data,
            'total_games': total_games,
            'total_rapid': total_rapid,
            'total_blitz': total_blitz,
            'openings': processed_openings,
            'game_number_stats': game_number_result,
            'last_archive': last_archive_processed
        }
    }

    yield f"data: {json.dumps(final_data)}\n\n"


def fetch_games_played_per_week(USERNAME, time_class=None):
    """Fetch games played per week, optionally filtered by time class."""
    monthly_archives_urls_list = fetch_player_games_archives(USERNAME)
    games_by_week = {}
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

                game_date = datetime.datetime.fromtimestamp(end_time)
                year, week, _ = game_date.isocalendar()

                key = (year, week)
                if key not in games_by_week:
                    games_by_week[key] = 0
                games_by_week[key] += 1

            parts = archive_url.split('/')
            print(f"Processed {parts[-2]}-{parts[-1]}")

        except requests.exceptions.RequestException as e:
            print(f"Error fetching {archive_url}: {e}")

    games_per_week_data = [
        {'year': year, 'week': week, 'games_played': count}
        for (year, week), count in games_by_week.items()
    ]
    games_per_week_data.sort(key=lambda x: (x['year'], x['week']))

    return fill_missing_weeks(games_per_week_data)

def fetch_elo_per_week(USERNAME, time_class='rapid'):
    """Fetch the last Elo rating per week for a given time control.
    Returns: (elo_per_week_data, total_games_count)
    """
    monthly_archives_urls_list = fetch_player_games_archives(USERNAME)
    elo_by_week = {}  # {(year, week): {'elo': rating, 'timestamp': end_time}}
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

                game_date = datetime.datetime.fromtimestamp(end_time)
                year, week, _ = game_date.isocalendar()
                key = (year, week)

                # Keep the most recent game's rating for each week
                if key not in elo_by_week or end_time > elo_by_week[key]['timestamp']:
                    elo_by_week[key] = {'elo': rating, 'timestamp': end_time}

            parts = archive_url.split('/')
            print(f"Processed Elo {parts[-2]}-{parts[-1]}")

        except requests.exceptions.RequestException as e:
            print(f"Error fetching {archive_url}: {e}")

    elo_per_week_data = [
        {'year': year, 'week': week, 'elo': data['elo']}
        for (year, week), data in elo_by_week.items()
    ]
    elo_per_week_data.sort(key=lambda x: (x['year'], x['week']))

    return fill_missing_weeks_elo(elo_per_week_data), total_games

def fetch_win_rate_by_game_number(USERNAME, time_class='rapid'):
    """
    Calculate win rate by game number per day.
    E.g., what's the win rate for the 1st game of the day, 2nd game, etc.
    Returns: list of {game_number, win_rate, sample_size}
    """
    monthly_archives_urls_list = fetch_player_games_archives(USERNAME)
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

def fill_missing_weeks_elo(data):
    """Fill missing weeks by carrying forward the last known Elo."""
    if not data:
        return []

    data.sort(key=lambda x: (x['year'], x['week']))
    existing_data = {(d['year'], d['week']): d['elo'] for d in data}

    start_year, start_week = data[0]['year'], data[0]['week']
    end_year, end_week = data[-1]['year'], data[-1]['week']

    filled_data = []
    curr_year, curr_week = start_year, start_week
    last_elo = data[0]['elo']

    while (curr_year, curr_week) <= (end_year, end_week):
        if (curr_year, curr_week) in existing_data:
            last_elo = existing_data[(curr_year, curr_week)]
        filled_data.append({'year': curr_year, 'week': curr_week, 'elo': last_elo})

        max_week = datetime.date(curr_year, 12, 28).isocalendar()[1]
        if curr_week >= max_week:
            curr_week = 1
            curr_year += 1
        else:
            curr_week += 1

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

def fill_missing_weeks(data):
    if not data: return []
    data.sort(key=lambda x: (x['year'], x['week']))

    existing_data = {(d['year'], d['week']): d['games_played'] for d in data}

    start_year, start_week = data[0]['year'], data[0]['week']
    end_year, end_week = data[-1]['year'], data[-1]['week']

    filled_data = []
    curr_year, curr_week = start_year, start_week

    while (curr_year, curr_week) <= (end_year, end_week):
        count = existing_data.get((curr_year, curr_week), 0)
        filled_data.append({'year': curr_year, 'week': curr_week, 'games_played': count})

        # Get max weeks in current year (52 or 53)
        max_week = datetime.date(curr_year, 12, 28).isocalendar()[1]

        if curr_week >= max_week:
            curr_week = 1
            curr_year += 1
        else:
            curr_week += 1

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
        transcript_list = YouTubeTranscriptApi.get_transcript(video_id, languages=['en', 'en-US', 'en-GB'])
        full_text = ' '.join([entry['text'].lower() for entry in transcript_list])

        # Count keyword occurrences
        word_count = len(full_text.split())
        if word_count == 0:
            return 0

        keyword_count = sum(full_text.count(kw) for kw in IMPROVEMENT_KEYWORDS)

        # Normalize: keyword density per 100 words, capped at 1
        density = min(1.0, (keyword_count / word_count) * 100 * 2)

        return density

    except (TranscriptsDisabled, NoTranscriptFound):
        return 0  # No transcript available
    except Exception as e:
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


def compute_fatigue_analysis(USERNAME, time_class='rapid'):
    """
    Analyze how fatigue affects your chess performance.
    Uses logistic regression to understand the impact of:
    - Number of games played in a session
    - Time between games
    - Total time spent playing
    """
    monthly_archives_urls_list = fetch_player_games_archives(USERNAME)
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