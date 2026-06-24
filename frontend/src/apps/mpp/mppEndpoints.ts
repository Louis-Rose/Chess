// Reverse-engineered catalog of the Mon Petit Prono (MPP) "community" API.
// Source: the production web bundle at mpp.football (Expo/React Native Web),
// config key API_URL = https://api.mpp.football. Extracted 2026-06-25.
//
// This object is the single source of truth: MppDocs renders it for humans and
// exposes it verbatim as downloadable JSON. Keep paths as the app builds them,
// with {id} standing in for path params.
//
// Methods are INFERRED from naming (fetch -> GET, join/leave/hide/apply -> POST)
// except where `verified: true`, which means confirmed from live traffic.

export interface MppEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | '?';
  path: string;
  summary: string;
  verified?: boolean;
}

export interface MppEndpointGroup {
  title: string;
  description: string;
  endpoints: MppEndpoint[];
}

export interface MppApiDoc {
  baseUrl: string;
  auth: {
    scheme: string;
    tokenEndpoint: string;
    auth0Domain: string;
    audience: string;
    webClientId: string;
  };
  siblingHosts: Record<string, string>;
  methodsNote: string;
  source: string;
  extractedAt: string;
  groups: MppEndpointGroup[];
}

export const MPP_API: MppApiDoc = {
  baseUrl: 'https://api.mpp.football',
  auth: {
    scheme: 'Authorization: Bearer <access_token>',
    tokenEndpoint: 'POST https://connect.ligue1.fr/oauth/token',
    auth0Domain: 'connect.ligue1.fr',
    audience: 'https://mpp.ligue1.fr',
    webClientId: 'grX5jWGWWQ4Uq91oe7KPNDZ96FS3jr0X',
  },
  siblingHosts: {
    mpg: 'https://api.mpg.football',
    chat: 'https://chat.api.mpg.football',
    tracking: 'https://europe-west1-mpg-workers.cloudfunctions.net',
    fanbase: 'https://is-fans-prod-fanbase-api.azurewebsites.net',
  },
  methodsNote:
    'Methods are inferred from endpoint naming except those marked verified, ' +
    'which were confirmed from live network traffic.',
  source: 'mpp.football production web bundle (_expo/static/js/web/entry-*.js)',
  extractedAt: '2026-06-25',
  groups: [
    {
      title: 'Contests',
      description: 'Your competitions, the "Mes compétitions" view.',
      endpoints: [
        { method: 'GET', path: '/user-contests', summary: 'Your contest cards (rank, points, league meta)', verified: true },
        { method: 'POST', path: '/user-contests/{id}/hide', summary: 'Hide a contest from your list' },
        { method: 'POST', path: '/user-contests/{id}/unhide', summary: 'Un-hide a contest' },
        { method: 'GET', path: '/contest/{id}/type', summary: 'Contest type metadata' },
        { method: 'GET', path: '/contest/mpg/list-leagues', summary: 'List MPG-linked leagues' },
        { method: '?', path: '/contest-invitation', summary: 'Contest invitation handling' },
      ],
    },
    {
      title: 'Leagues (private)',
      description: 'Private leagues you create or join, the "Mes ligues" view.',
      endpoints: [
        { method: 'GET', path: '/league/{id}', summary: 'League detail' },
        { method: 'GET', path: '/leagues/{id}', summary: 'Leagues collection' },
        { method: 'GET', path: '/mpp/league/{id}', summary: 'MPP league detail' },
        { method: 'POST', path: '/league/{id}/join', summary: 'Join a league' },
        { method: 'POST', path: '/league/{id}/leave', summary: 'Leave a league' },
        { method: 'POST', path: '/league/{id}/launch', summary: 'Launch a league' },
        { method: 'PUT', path: '/league/{id}/name', summary: 'Rename a league' },
        { method: 'PUT', path: '/league/{id}/image', summary: 'Set league image' },
        { method: 'GET', path: '/league/{id}/entrance', summary: 'League entrance / join info' },
        { method: 'GET', path: '/league/{id}/initial-users', summary: 'Seed members' },
        { method: 'POST', path: '/league/{id}/replace-admin', summary: 'Hand over admin' },
        { method: 'POST', path: '/league/{id}/invite-users-to-replace', summary: 'Invite users to replace members' },
      ],
    },
    {
      title: 'Challenges (public)',
      description: 'Public leagues / challenges and their leaderboards.',
      endpoints: [
        { method: 'GET', path: '/challenge/{id}', summary: 'Challenge detail' },
        { method: 'POST', path: '/challenge/{id}/join', summary: 'Join a challenge' },
        { method: 'POST', path: '/challenge/{id}/leave', summary: 'Leave a challenge' },
        { method: 'PUT', path: '/challenge/{id}/name', summary: 'Rename a challenge' },
        { method: 'PUT', path: '/challenge/{id}/image', summary: 'Set challenge image' },
        { method: 'GET', path: '/challenge/{id}/entrance', summary: 'Challenge entrance info' },
        { method: 'GET', path: '/challenge/{id}/user', summary: 'Your membership in the challenge' },
        { method: 'GET', path: '/challenge/{id}/user/{id}', summary: "A member's challenge record" },
        { method: 'GET', path: '/challenge/{id}/users-ids', summary: 'Member id list' },
        { method: 'GET', path: '/challenge/{id}/initial-users', summary: 'Seed members' },
        { method: 'GET', path: '/challenges/supervised/active/{id}', summary: 'Active supervised challenges' },
        { method: 'GET', path: '/challenge-standings/users-standings', summary: 'Full league leaderboard (challengeId, offset, limit)', verified: true },
      ],
    },
    {
      title: 'Divisions',
      description: 'Division play and division-level standings.',
      endpoints: [
        { method: 'GET', path: '/division/{id}', summary: 'Division detail' },
        { method: 'GET', path: '/division-calendar/division/{id}', summary: 'Division calendar' },
        { method: 'GET', path: '/division-standings/ranking', summary: 'Division ranking' },
        { method: 'GET', path: '/division-standings/users-standings', summary: 'Division leaderboard' },
      ],
    },
    {
      title: 'Forecasts & predictions',
      description: 'The prono core: your picks per match, game-week and contest.',
      endpoints: [
        { method: 'GET', path: '/user-match-forecasts/{id}', summary: 'A forecast by id' },
        { method: 'GET', path: '/user-match-forecasts/contest/{id}/game-week/{gw}', summary: 'Your forecasts for a game-week (journée)' },
        { method: 'GET', path: '/user-match-forecasts/contest/{id}/match/{matchId}', summary: 'Your forecast for one match in a contest' },
        { method: 'GET', path: '/user-match-forecasts/entity/{id}/match/{matchId}', summary: 'Forecasts by entity for a match' },
        { method: 'GET', path: '/user-match-forecasts/championship/{id}/history', summary: 'Your forecast history for a championship' },
        { method: 'GET', path: '/user-predictions/{id}', summary: 'User predictions' },
        { method: 'GET', path: '/user-predictions/predictions-challenge/{id}', summary: 'Predictions for a prediction-challenge' },
        { method: 'GET', path: '/predictions-challenge/{id}', summary: 'Prediction-challenge detail' },
        { method: 'GET', path: '/predictions-challenge-standings/favorite-club', summary: 'Prediction-challenge standings by favorite club' },
        { method: 'GET', path: '/championship-available-predictions/{id}', summary: 'Predictions still open for a championship' },
        { method: 'GET', path: '/user/predicted-favorites/{id}', summary: 'A user\'s predicted favorites' },
      ],
    },
    {
      title: 'Matches & calendar',
      description: 'Fixtures, game-weeks and championship calendars.',
      endpoints: [
        { method: 'GET', path: '/championships-current-matches/by-date', summary: 'Current matches grouped by date' },
        { method: 'GET', path: '/championship-calendar/{id}', summary: 'Championship calendar' },
        { method: 'GET', path: '/championship-calendar/{id}/nearest-game-weeks', summary: 'Nearest game-weeks' },
        { method: 'GET', path: '/championship-calendar/{id}/next-game-weeks', summary: 'Upcoming game-weeks' },
        { method: 'GET', path: '/championship-match/{id}', summary: 'Single match detail' },
        { method: 'GET', path: '/championship-summary/{id}', summary: 'Championship summary' },
        { method: 'GET', path: '/championship-club/lfp/{id}', summary: 'LFP club info' },
        { method: 'GET', path: '/championship-club/{id}/season-matches/{id}', summary: "A club's season matches" },
        { method: 'GET', path: '/championship-club/{id}/players-infos/{id}', summary: "A club's player info" },
      ],
    },
    {
      title: 'Standings & player stats',
      description: 'Championship tables and player rankings.',
      endpoints: [
        { method: 'GET', path: '/championship-standings/{id}', summary: 'Championship table' },
        { method: 'GET', path: '/championship-players-ranking/{id}/goals', summary: 'Top scorers' },
        { method: 'GET', path: '/championship-players-ranking/{id}/assists', summary: 'Top assisters' },
        { method: 'GET', path: '/championship-players-ranking/{id}/ratings', summary: 'Top-rated players' },
        { method: 'GET', path: '/championship-players-pool-stats/{id}', summary: 'Player pool stats' },
      ],
    },
    {
      title: 'Bonuses',
      description: 'Match bonuses you can apply.',
      endpoints: [
        { method: 'GET', path: '/user-bonuses/match/{id}', summary: 'Bonuses available for a match' },
        { method: 'POST', path: '/user-bonuses/entity/{id}/match/{m}/bonus/{b}/apply', summary: 'Apply a bonus to a match' },
      ],
    },
    {
      title: 'Social feed, wall & messages',
      description: 'The community wall: posts, reactions and read-state.',
      endpoints: [
        { method: 'GET', path: '/post/{id}', summary: 'A post' },
        { method: 'POST', path: '/post/{id}/reaction', summary: 'React to a post' },
        { method: 'GET', path: '/message/{id}', summary: 'A message' },
        { method: 'POST', path: '/message/{id}/reaction', summary: 'React to a message' },
        { method: 'GET', path: '/summary/user/{id}', summary: 'A user\'s wall summary' },
        { method: 'POST', path: '/summary/{id}/mark-as-read', summary: 'Mark a summary read' },
        { method: 'POST', path: '/user-activity/{id}/register-wall-visit', summary: 'Register a wall visit' },
        { method: 'GET', path: '/user-activity/{id}/last-wall-visit', summary: 'Last wall visit' },
        { method: 'POST', path: '/user-activity/{id}/delete-wall-contest-summary', summary: 'Delete a wall contest summary' },
      ],
    },
    {
      title: 'Friends & contact book',
      description: 'Friend invitations and contact details.',
      endpoints: [
        { method: 'GET', path: '/user-contact-book/user/{id}/details', summary: 'Contact details for a user' },
        { method: 'POST', path: '/user-contact-book/invitation/{id}/accept', summary: 'Accept a friend invitation' },
        { method: 'POST', path: '/user-contact-book/invitation/{id}/reject', summary: 'Reject a friend invitation' },
      ],
    },
    {
      title: 'Profile & user',
      description: 'Account, career and archived rankings.',
      endpoints: [
        { method: 'GET', path: '/user/me', summary: 'The signed-in user' },
        { method: 'GET', path: '/user/{id}', summary: 'A user by id' },
        { method: 'GET', path: '/user-career/{id}', summary: "A user's career stats" },
        { method: 'GET', path: '/profile/{id}', summary: 'Profile' },
        { method: 'GET', path: '/public-profile/{id}', summary: 'Public profile' },
        { method: 'GET', path: '/app/profile/{id}', summary: 'App profile view' },
        { method: 'GET', path: '/user-rankings-archive/user/{id}', summary: 'Archived rankings for a user' },
        { method: 'POST', path: '/user-game-week-reveal/{id}/register-reveal-viewed', summary: 'Register a game-week reveal as viewed' },
      ],
    },
    {
      title: 'Badges',
      description: 'Badge collection.',
      endpoints: [
        { method: 'GET', path: '/badges-collection/user/{id}', summary: "A user's badges" },
        { method: 'POST', path: '/badges-collection/badge/{id}/register-visit', summary: 'Register a badge visit' },
      ],
    },
    {
      title: 'Notifications',
      description: 'In-app notifications.',
      endpoints: [
        { method: 'GET', path: '/user-notifications', summary: 'Your notifications' },
        { method: 'GET', path: '/user-notification/{id}', summary: 'A notification' },
        { method: 'POST', path: '/user-notification/{id}/action/{a}', summary: 'Run a notification action' },
        { method: 'POST', path: '/user-notification/{id}/click', summary: 'Register a notification click' },
      ],
    },
    {
      title: 'Misc',
      description: 'Everything else seen on the MPP host.',
      endpoints: [
        { method: 'GET', path: '/changelog/version/{id}', summary: 'Changelog for a version' },
        { method: 'GET', path: '/blog-post/{id}', summary: 'A blog post' },
        { method: 'GET', path: '/shop/stripe/check-payment-status', summary: 'Check a Stripe payment status' },
        { method: 'GET', path: '/debug/user/ids', summary: 'Debug: user ids' },
      ],
    },
  ],
};
