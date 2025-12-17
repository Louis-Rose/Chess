import math
import requests
import datetime
import pandas as pd

# --- Data Fetching Functions ---

def fetch_player_data_and_stats(USERNAME):
    headers = {'User-Agent': 'MyPythonScript/1.0 (contact@example.com)'}
    data_url = f"https://api.chess.com/pub/player/{USERNAME}"
    stats_url = f"https://api.chess.com/pub/player/{USERNAME}/stats"

    data_response = requests.get(data_url, headers=headers)
    data_response.raise_for_status()
    stats_response = requests.get(stats_url, headers=headers)
    stats_response.raise_for_status()

    return data_response.json() | stats_response.json()

def fetch_player_games_archives(USERNAME):
    url = f"https://api.chess.com/pub/player/{USERNAME}/games/archives"
    headers = {'User-Agent': 'MyPythonScript/1.0 (contact@example.com)'}
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    data = response.json()
    return data["archives"]

def fetch_games_played_per_week(USERNAME):
    monthly_archives_urls_list = fetch_player_games_archives(USERNAME)
    games_by_week = {}
    headers = {'User-Agent': 'MyChessStatsApp/1.0 (contact@example.com)'}

    for archive_url in monthly_archives_urls_list:
        try:
            response = requests.get(archive_url, headers=headers)
            response.raise_for_status()
            data = response.json()

            for game in data.get('games', []):
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