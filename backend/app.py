# backend/app.py
from flask import Flask, jsonify, request
from flask_cors import CORS
import utils

app = Flask(__name__)
# Allow React (running on localhost:5173) to talk to this API
CORS(app) 

@app.route('/api/stats', methods=['GET'])
def get_chess_stats():
    username = request.args.get('username')
    if not username:
        return jsonify({"error": "Username required"}), 400

    try:
        # 1. Fetch History
        history = utils.fetch_games_played_per_month(username)
        
        # 2. Fetch Openings (This can be slow, might want to split endpoints later)
        archives = utils.fetch_player_games_archives(username)
        raw_openings = utils.fetch_all_openings(username, archives)
        processed_openings = utils.process_openings_for_json(raw_openings)

        return jsonify({
            "history": history,
            "openings": processed_openings
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)