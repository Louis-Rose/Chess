"""Google Calendar integration — OAuth + Meet link generation."""

import os
import logging
from datetime import datetime, timedelta

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

logger = logging.getLogger(__name__)

from config import APP_ORIGIN

GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID')
GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET')
BASE_URL = APP_ORIGIN
REDIRECT_URI = f'{BASE_URL}/api/auth/google-calendar/callback'
SCOPES = ['https://www.googleapis.com/auth/calendar.events']


def get_auth_url(state: str) -> str:
    """Get the Google OAuth URL for Calendar consent."""
    flow = Flow.from_client_config(
        {'web': {
            'client_id': GOOGLE_CLIENT_ID,
            'client_secret': GOOGLE_CLIENT_SECRET,
            'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
            'token_uri': 'https://oauth2.googleapis.com/token',
        }},
        scopes=SCOPES,
        redirect_uri=REDIRECT_URI,
    )
    auth_url, _ = flow.authorization_url(
        access_type='offline',
        prompt='consent',
        state=state,
    )
    return auth_url


def exchange_code(code: str) -> dict:
    """Exchange authorization code for tokens. Returns {'refresh_token': ..., 'access_token': ...}."""
    flow = Flow.from_client_config(
        {'web': {
            'client_id': GOOGLE_CLIENT_ID,
            'client_secret': GOOGLE_CLIENT_SECRET,
            'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
            'token_uri': 'https://oauth2.googleapis.com/token',
        }},
        scopes=SCOPES,
        redirect_uri=REDIRECT_URI,
    )
    flow.fetch_token(code=code)
    creds = flow.credentials
    return {
        'refresh_token': creds.refresh_token,
        'access_token': creds.token,
    }


def _get_credentials(refresh_token: str) -> Credentials:
    """Build Credentials from a refresh token."""
    return Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri='https://oauth2.googleapis.com/token',
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        scopes=SCOPES,
    )


def create_meet_event(refresh_token: str, summary: str, scheduled_at: str, duration_minutes: int, attendee_email: str | None = None) -> str | None:
    """Create a Google Calendar event with Meet link. Returns the Meet link or None."""
    try:
        creds = _get_credentials(refresh_token)
        service = build('calendar', 'v3', credentials=creds)

        start = datetime.fromisoformat(scheduled_at)
        end = start + timedelta(minutes=duration_minutes)

        event = {
            'summary': summary,
            'start': {'dateTime': start.isoformat(), 'timeZone': 'UTC'},
            'end': {'dateTime': end.isoformat(), 'timeZone': 'UTC'},
            'conferenceData': {
                'createRequest': {
                    'requestId': f'lumna-{int(start.timestamp())}',
                    'conferenceSolutionKey': {'type': 'hangoutsMeet'},
                },
            },
        }

        if attendee_email:
            event['attendees'] = [{'email': attendee_email}]

        result = service.events().insert(
            calendarId='primary',
            body=event,
            conferenceDataVersion=1,
        ).execute()

        meet_link = result.get('hangoutLink')
        logger.info(f'[Calendar] Created event with Meet link: {meet_link}')
        return meet_link

    except Exception as e:
        logger.error(f'[Calendar] Failed to create event: {e}')
        return None
