// Shape of the GET /api/music/overview response (see backend/blueprints/music.py).

export interface MusicStats {
  total_plays: number;
  distinct_tracks: number;
  distinct_artists: number;
  total_ms_played: number;
  first_play: string | null;
  last_play: string | null;
}

export interface RecentPlay {
  id: number;
  played_at: string;
  ms_played: number;
  completion_pct: number;
  track_name: string;
  image_url: string | null;
  artists: string;
}

export interface TopTrack {
  id: string;
  track_name: string;
  image_url: string | null;
  artists: string;
  play_count: number;
}

export interface TopArtist {
  id: string;
  artist_name: string;
  play_count: number;
}

export interface ActivityPoint {
  day: string;
  play_count: number;
}

export interface MusicOverview {
  stats: MusicStats;
  recent: RecentPlay[];
  top_tracks: TopTrack[];
  top_artists: TopArtist[];
  activity: ActivityPoint[];
}
