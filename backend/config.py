import os

IS_PRODUCTION = os.environ.get('FLASK_ENV') == 'prod'
APP_ORIGIN = 'https://lumna.co' if IS_PRODUCTION else 'http://localhost:5173'
