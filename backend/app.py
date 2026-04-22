# backend/app.py — Flask application factory
import os
import sys
import logging
from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv

# Load environment-specific .env file BEFORE importing modules that read env vars at import time
env = os.environ.get('FLASK_ENV', 'dev')
env_file = f'.env.{env}'
load_dotenv(env_file)

from database import init_db

# Configure logging for gunicorn
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, supports_credentials=True)

# Initialize database on startup
init_db()

# Register blueprints
from blueprints.auth_routes import auth_bp
from blueprints.chesscoaches import coaches_bp, migrate_upload_filenames
from blueprints.admin import admin_bp
from blueprints.knowledge import knowledge_bp
from blueprints.gym import gym_bp
app.register_blueprint(auth_bp)
app.register_blueprint(coaches_bp)
app.register_blueprint(admin_bp)
app.register_blueprint(knowledge_bp)
app.register_blueprint(gym_bp)

migrate_upload_filenames()


if __name__ == '__main__':
    app.run(debug=True, port=5001)
